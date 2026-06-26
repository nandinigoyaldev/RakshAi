from fastapi import FastAPI, File, UploadFile
from pydantic import BaseModel
import time
import os
import google.generativeai as genai
from dotenv import load_dotenv

# Try to load .env from root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))

system_prompt = (
    "You are J.A.R.V.I.S., a highly advanced AI assistant created by Tony Stark. "
    "You are extremely helpful, highly intelligent, slightly sarcastic, and very formal. "
    "Keep your answers concise and conversational, as they will be spoken out loud via text-to-speech. "
    "Refer to the user as 'Sir' or 'Madam' occasionally."
)

model = genai.GenerativeModel('gemini-2.5-flash', system_instruction=system_prompt)
chat_session = model.start_chat(history=[])

app = FastAPI(title="Autobot API")

class VoicePrompt(BaseModel):
    prompt: str
    context: list[str] = []

@app.post("/api/voice")
async def process_voice(data: VoicePrompt):
    prompt = data.prompt
    context = data.context
    
    if not os.environ.get("GEMINI_API_KEY"):
        return {"response": "Gemini API Key is missing."}
    
    # Inject visual context if available
    if context and len(context) > 0:
        objects = ", ".join(context)
        prompt = f"[SYSTEM: The user's camera currently sees these objects in the room: {objects}]\nUser says: {prompt}"
    
    try:
        llm_response = chat_session.send_message(prompt)
        return {"response": llm_response.text}
    except Exception as llm_err:
        print(f"LLM Error: {llm_err}")
        return {"response": "I'm sorry, I encountered an error processing your request."}

@app.post("/api/voice-audio")
async def process_voice_audio(audio: UploadFile = File(...)):
    if not os.environ.get("GEMINI_API_KEY"):
        return {"response": "Gemini API Key is missing."}
    
    try:
        audio_bytes = await audio.read()
        mime = audio.content_type if audio.content_type else "audio/webm"
        
        # Send audio directly to Gemini
        llm_response = chat_session.send_message([
            {"mime_type": mime, "data": audio_bytes},
            "Listen to this spoken command and respond to it."
        ])
        return {"response": llm_response.text}
    except Exception as llm_err:
        print(f"Audio LLM Error: {llm_err}")
        return {"response": "I'm sorry, I encountered an error processing your audio."}

class SignPayload(BaseModel):
    sign: str

class RegisterPayload(BaseModel):
    image_base64: str

@app.get("/api/health")
async def health_check():
    return {"status": "online", "system": "Touchless Kiosk", "timestamp": time.time()}

@app.get("/api/config")
async def get_config():
    return {"picovoiceKey": os.environ.get("PICOVOICE_ACCESS_KEY", "")}

from fastapi.staticfiles import StaticFiles
import os

# Get the directory of the current file to find the public folder
current_dir = os.path.dirname(os.path.abspath(__file__))
public_dir = os.path.join(current_dir, "..", "public")

# We mount it at the end to avoid overriding API routes
app.mount("/public", StaticFiles(directory=public_dir), name="public")

@app.get("/")
async def serve_index():
    from fastapi.responses import FileResponse
    return FileResponse(os.path.join(public_dir, "index.html"))

@app.get("/{filename:path}")
async def serve_static(filename: str):
    from fastapi.responses import FileResponse
    file_path = os.path.join(public_dir, filename)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(public_dir, "index.html"))


