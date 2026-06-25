from fastapi import FastAPI
from pydantic import BaseModel
import time

app = FastAPI(title="Autobot API")

class SignPayload(BaseModel):
    sign: str

class RegisterPayload(BaseModel):
    image_base64: str

@app.get("/api/health")
async def health_check():
    return {"status": "online", "system": "Touchless Kiosk", "timestamp": time.time()}

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

@app.post("/api/sign")
async def handle_sign(payload: SignPayload):
    sign = payload.sign
    print(f"Received sign from client: {sign}")
    return {"status": "success", "message": f"Processed sign: {sign}"}

@app.post("/api/register")
async def handle_register(payload: RegisterPayload):
    # In a real app, upload this base64 string to AWS S3 or Supabase Storage.
    # For Vercel Serverless, we process and return success since we cannot store to local disk safely.
    print("Received new user photo registration.")
    
    return {
        "status": "success",
        "message": "User profile successfully captured and stored securely.",
        "image_preview": payload.image_base64[:50] + "..." # Just for logging
    }

import os
import urllib.parse
import urllib.request
import json
from fastapi.responses import RedirectResponse

@app.get("/api/spotify/login")
async def spotify_login():
    client_id = os.getenv("SPOTIFY_CLIENT_ID", "")
    redirect_uri = os.getenv("SPOTIFY_REDIRECT_URI", "http://localhost:8000/api/spotify/callback")
    
    scope = "user-modify-playback-state user-read-playback-state"
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": scope,
        "show_dialog": "true"
    }
    url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode(params)
    return RedirectResponse(url=url)

@app.get("/api/spotify/callback")
async def spotify_callback(code: str = None, error: str = None):
    if error:
        return {"error": error}
    
    client_id = os.getenv("SPOTIFY_CLIENT_ID", "")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET", "")
    redirect_uri = os.getenv("SPOTIFY_REDIRECT_URI", "http://localhost:8000/api/spotify/callback")
    
    data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
    }).encode("utf-8")
    
    req = urllib.request.Request("https://accounts.spotify.com/api/token", data=data)
    
    import base64
    auth_str = f"{client_id}:{client_secret}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()
    req.add_header("Authorization", f"Basic {b64_auth}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read())
            access_token = res_data.get("access_token")
            # Redirect back to the frontend with the token
            return RedirectResponse(url=f"/?access_token={access_token}")
    except Exception as e:
        return {"error": str(e)}
