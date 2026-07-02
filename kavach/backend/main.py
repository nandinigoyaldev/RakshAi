import os
import json
import base64
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Body
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Twilio client
from twilio.rest import Client as TwilioClient

twilio_client = TwilioClient(
    os.getenv("TWILIO_ACCOUNT_SID"),
    os.getenv("TWILIO_AUTH_TOKEN")
)
TWILIO_FROM = os.getenv("TWILIO_WHATSAPP_FROM")

# Gemini AI
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
MODEL_NAME = "gemini-2.5-flash"
model = genai.GenerativeModel(MODEL_NAME)

app = FastAPI()

# CORS – allow any origin for demo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths for data files
BASE_DIR = Path(__file__).parent
CONTACTS_PATH = BASE_DIR / "contacts.json"
SOS_LOG_PATH = BASE_DIR / "sos_log.json"

# Ensure data files exist
for path in (CONTACTS_PATH, SOS_LOG_PATH):
    if not path.exists():
        path.write_text(json.dumps([], indent=2))

# Pydantic models
class Location(BaseModel):
    lat: float
    lng: float

class AnalyzePayload(BaseModel):
    image: Optional[str] = None  # base64 string or null
    location: Optional[Location] = None
    gsr_level: int
    mot_level: int
    voice_level: int

class SOSPayload(BaseModel):
    location: Location
    layers_triggered: List[str]
    ai_description: str
    timestamp: str
    trigger_type: str  # AUTO, MANUAL, IMMEDIATE

class Contact(BaseModel):
    name: str
    phone: str

# Helper functions
def load_json(path: Path):
    try:
        return json.loads(path.read_text())
    except Exception:
        return []

def save_json(path: Path, data):
    path.write_text(json.dumps(data, indent=2))

def parse_gemini_response(response_text: str) -> dict:
    """Strip markdown backticks and parse JSON inside Gemini response."""
    # Remove surrounding markdown fences if present
    if response_text.strip().startswith("`"):
        # Find first '{' and last '}'
        start = response_text.find('{')
        end = response_text.rfind('}')
        if start != -1 and end != -1:
            response_text = response_text[start:end+1]
    try:
        return json.loads(response_text)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to parse Gemini JSON response")

# Endpoints
@app.get("/api/health")
def health():
    return {"status": "online"}

@app.get("/api/contacts")
def get_contacts():
    return load_json(CONTACTS_PATH)

@app.post("/api/contacts")
def add_contact(contact: Contact):
    contacts = load_json(CONTACTS_PATH)
    # Simple validation – phone must start with + and digits
    if not contact.phone.startswith('+') or not contact.phone[1:].isdigit():
        raise HTTPException(status_code=400, detail="Phone must start with '+' and contain digits only")
    contacts.append(contact.dict())
    save_json(CONTACTS_PATH, contacts)
    return {"success": True, "contact": contact}

@app.delete("/api/contacts/{phone}")
def delete_contact(phone: str):
    contacts = load_json(CONTACTS_PATH)
    new_contacts = [c for c in contacts if c.get("phone") != phone]
    if len(new_contacts) == len(contacts):
        raise HTTPException(status_code=404, detail="Contact not found")
    save_json(CONTACTS_PATH, new_contacts)
    return {"success": True}

@app.post("/api/analyze")
async def analyze(payload: AnalyzePayload):
    # Determine layer counts
    layers = []
    if payload.gsr_level >= 2:
        layers.append("GSR")
    if payload.mot_level >= 2:
        layers.append("MOTION")
    if payload.voice_level >= 2:
        layers.append("VOICE")

    posture_level = None
    observations = None
    description = None

    if payload.image:
        # Decode base64 image
        try:
            image_bytes = base64.b64decode(payload.image)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 image")
        # Send to Gemini Vision
        try:
            from io import BytesIO
            from PIL import Image
            image = Image.open(BytesIO(image_bytes))
            gemini_resp = model.generate_content(
                [
                    "You are KAVACH safety AI. Analyze body language for distress. Look for: hunched posture, defensive arms, backing away, fearful expression, nervous looking around, covering face. Return ONLY this JSON no markdown:\n{\n  \"posture_level\": 0 or 1 or 2,\n  \"observations\": [3 short strings],\n  \"description\": \"one sentence\"\n}\n",
                    image
                ]
            )
            resp_dict = parse_gemini_response(gemini_resp.text)
            posture_level = resp_dict.get("posture_level")
            observations = resp_dict.get("observations")
            description = resp_dict.get("description")
            if posture_level is not None:
                layers.append("POSTURE")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Gemini analysis failed: {str(e)}")

    # Count active layers (posture counts as a layer only if provided)
    layers_active = len(layers)
    auto_trigger = layers_active >= 2
    immediate_trigger = layers_active >= 3

    return {
        "posture_level": posture_level,
        "observations": observations,
        "description": description,
        "layers_active": layers_active,
        "auto_trigger": auto_trigger,
        "immediate_trigger": immediate_trigger,
    }

@app.post("/api/sos")
def send_sos(payload: SOSPayload):
    contacts = load_json(CONTACTS_PATH)
    if not contacts:
        raise HTTPException(status_code=400, detail="No trusted contacts configured.")
    # Build message
    location_url = f"https://maps.google.com/?q={payload.location.lat},{payload.location.lng}"
    layers_str = "+".join(payload.layers_triggered)
    msg_body = (
        "🚨 KAVACH EMERGENCY ALERT 🚨\n\n"
        "Someone needs help RIGHT NOW.\n\n"
        f"📍 Location: {location_url}\n"
        f"🕐 Time: {payload.timestamp}\n"
        f"⚡ Trigger: {payload.trigger_type}\n"
        f"🔴 Layers: {layers_str}\n"
        f"🤖 AI: {payload.ai_description}\n\n"
        "No action was taken by the person in danger.\n"
        "KAVACH detected this automatically.\n\n"
        "Sent by KAVACH Safety System."
    )
    alerted = 0
    for contact in contacts:
        to_number = f"whatsapp:{contact['phone']}"
        try:
            twilio_client.messages.create(body=msg_body, from_=TWILIO_FROM, to=to_number)
            alerted += 1
        except Exception as e:
            # Log but continue
            print(f"Failed to send to {to_number}: {e}")
    # Log SOS event
    log_entry = {
        "timestamp": payload.timestamp,
        "location": payload.location.dict(),
        "layers_triggered": payload.layers_triggered,
        "ai_description": payload.ai_description,
        "trigger_type": payload.trigger_type,
        "contacts_alerted": alerted,
    }
    logs = load_json(SOS_LOG_PATH)
    logs.append(log_entry)
    save_json(SOS_LOG_PATH, logs)
    return {"success": True, "alerted": alerted}

# Serve frontend static files
@app.get("/", response_class=FileResponse)
def serve_index():
    index_path = Path(__file__).parent.parent / "frontend" / "index.html"
    return FileResponse(index_path)

@app.get("/static/{file_path:path}")
def serve_static(file_path: str):
    static_file = Path(__file__).parent.parent / "frontend" / file_path
    if static_file.is_file():
        return FileResponse(static_file)
    raise HTTPException(status_code=404, detail="Static file not found")

# Startup hook to ensure directories exist
@app.on_event("startup")
async def startup_event():
    # Create frontend dir if missing (for safety)
    (BASE_DIR.parent / "frontend").mkdir(parents=True, exist_ok=True)
    (BASE_DIR).mkdir(parents=True, exist_ok=True)

