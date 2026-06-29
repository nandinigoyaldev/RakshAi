import os
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from dotenv import load_dotenv
import google.generativeai as genai
from twilio.rest import Client

# Import Arduino reader (starts its own thread on import)
from .arduino_reader import get_arduino_state

# -------------------------------------------------
# Environment setup
# -------------------------------------------------
PROJECT_ROOT = Path(__file__).parent
load_dotenv(PROJECT_ROOT / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM")

if not all([GEMINI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM]):
    raise RuntimeError("Missing required environment variables in .env")

# -------------------------------------------------
# Initialise external services
# -------------------------------------------------
genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel("gemini-2.5-flash")

twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

# -------------------------------------------------
# Helper I/O utilities
# -------------------------------------------------
def _ensure_json(path: Path, default: Any):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(default, indent=2))

CONTACTS_PATH = PROJECT_ROOT / "contacts.json"
SOS_LOG_PATH = PROJECT_ROOT / "sos_log.json"

_ensure_json(CONTACTS_PATH, [])
_ensure_json(SOS_LOG_PATH, [])

def _load_json(path: Path) -> Any:
    return json.loads(path.read_text())

def _write_json(path: Path, data: Any):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))

# -------------------------------------------------
# FastAPI app configuration
# -------------------------------------------------
app = FastAPI(title="KAVACH Safety System", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static assets under /static and root '/' returns index.html
app.mount("/static", StaticFiles(directory=PROJECT_ROOT / "static"), name="static")

@app.get("/", response_class=FileResponse)
async def root():
    return FileResponse(PROJECT_ROOT / "static" / "index.html")

# -------------------------------------------------
# Request models
# -------------------------------------------------
class ImageAnalyzeRequest(BaseModel):
    image: str  # base64 JPEG
    location: Dict[str, float] = Field(..., example={"lat": 12.34, "lng": 56.78})

class SOSRequest(BaseModel):
    location: Dict[str, float]
    assessment: str
    triggered_by: str
    timestamp: str

class ContactIn(BaseModel):
    name: str
    phone: str

# -------------------------------------------------
# Gemini helper
# -------------------------------------------------
async def _call_gemini(image_b64: str) -> Dict[str, Any]:
    prompt = (
        "You are KAVACH, a women's safety AI. Analyze this camera frame for distress signals in body language. "
        "Look for: hunched posture, defensive arm positions, person backing away, fearful facial expression, "
        "covering face, looking around nervously. Return ONLY the following JSON, no markdown: {\n"
        "  posture_level: 0 or 1 or 2,\n"
        "  observations: [3 short strings],\n"
        "  confidence: float 0 to 1,\n"
        "  description: one sentence\n"
        "} 0=normal, 1=slightly distressed, 2=clearly distressed"
    )
    data_uri = f"data:image/jpeg;base64,{image_b64}"
    try:
        response = gemini_model.generate_content([
            genai.Part.of(prompt),
            genai.Part.from_uri(data_uri, mime_type="image/jpeg"),
        ])
        txt = response.text.strip()
        if txt.startswith("```"):
            txt = "\n".join(txt.splitlines()[1:-1])
        return json.loads(txt)
    except Exception as e:
        raise RuntimeError(f"Gemini request failed: {e}")

# -------------------------------------------------
# API endpoints
# -------------------------------------------------
@app.post("/api/analyze")
async def analyze(request: ImageAnalyzeRequest):
    try:
        gemini_res = await _call_gemini(request.image)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    arduino = get_arduino_state()
    posture_level = int(gemini_res.get("posture_level", 0))
    hr_level = int(arduino.get("hr_level", 0))
    mot_level = int(arduino.get("mot_level", 0))
    layers_triggered = sum([posture_level >= 2, hr_level >= 2, mot_level >= 2])
    auto_trigger = layers_triggered >= 2

    resp = {
        "posture_level": posture_level,
        "hr_level": hr_level,
        "mot_level": mot_level,
        "bpm": arduino.get("bpm", 0),
        "motion": arduino.get("motion", 0.0),
        "observations": gemini_res.get("observations", []),
        "description": gemini_res.get("description", ""),
        "auto_trigger": auto_trigger,
        "arduino_connected": arduino.get("connected", False),
        "layers_triggered": layers_triggered,
    }
    return JSONResponse(content=resp)

def _send_whatsapp(to: str, body: str):
    twilio_client.messages.create(from_=TWILIO_WHATSAPP_FROM, body=body, to=to)

@app.post("/api/sos")
async def send_sos(sos: SOSRequest, background_tasks: BackgroundTasks):
    contacts = _load_json(CONTACTS_PATH)
    if not contacts:
        raise HTTPException(status_code=400, detail="No contacts configured.")
    lat, lng = sos.location.get("lat"), sos.location.get("lng")
    map_url = f"https://maps.google.com/?q={lat},{lng}"
    body = (
        "🚨 KAVACH EMERGENCY ALERT 🚨\n\n"
        "Someone needs help RIGHT NOW.\n\n"
        f"📍 Location: {map_url}\n"
        f"🕐 Time: {sos.timestamp}\n"
        f"⚡ Triggered by: {sos.triggered_by}\n"
        f"🤖 AI detected: {sos.assessment}\n\n"
        "Sent automatically by KAVACH Safety System.\nNo action was needed from the person in danger."
    )
    for contact in contacts:
        to = contact.get("phone")
        if to:
            background_tasks.add_task(_send_whatsapp, to, body)
    log_entry = {
        "id": str(uuid.uuid4()),
        "timestamp": sos.timestamp,
        "location": sos.location,
        "assessment": sos.assessment,
        "triggered_by": sos.triggered_by,
        "contacts_alerted": len(contacts),
    }
    logs = _load_json(SOS_LOG_PATH)
    logs.append(log_entry)
    _write_json(SOS_LOG_PATH, logs)
    return {"success": True, "alerted": len(contacts)}

@app.get("/api/arduino")
async def arduino_state():
    return get_arduino_state()

@app.get("/api/contacts")
async def get_contacts():
    return _load_json(CONTACTS_PATH)

@app.post("/api/contacts")
async def add_contact(contact: ContactIn):
    contacts = _load_json(CONTACTS_PATH)
    if any(c["phone"] == contact.phone for c in contacts):
        raise HTTPException(status_code=400, detail="Contact already exists.")
    contacts.append({"name": contact.name, "phone": contact.phone})
    _write_json(CONTACTS_PATH, contacts)
    return contacts

@app.delete("/api/contacts/{phone}")
async def delete_contact(phone: str):
    contacts = _load_json(CONTACTS_PATH)
    new_list = [c for c in contacts if c.get("phone") != phone]
    if len(new_list) == len(contacts):
        raise HTTPException(status_code=404, detail="Contact not found.")
    _write_json(CONTACTS_PATH, new_list)
    return new_list

@app.get("/api/health")
async def health():
    return {"status": "online", "arduino": get_arduino_state().get("connected", False)}

# -------------------------------------------------
# End of file – run with: uvicorn kavach.main:app --reload
# -------------------------------------------------
