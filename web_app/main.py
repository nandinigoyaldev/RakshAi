from fastapi import FastAPI, WebSocket, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import json
import os
import time

app = FastAPI(title="Autobot Web")

# Ensure static directory exists
os.makedirs("static", exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("static/index.html", "r") as f:
        return f.read()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client connected via WebSocket")
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle messages from frontend (like commands, or detected sign language words)
            if message.get("type") == "command":
                cmd = message.get("payload")
                print(f"Received command: {cmd}")
                
                # Mock response back to client
                response = {"type": "notification", "message": f"Processed: {cmd}"}
                await websocket.send_text(json.dumps(response))
                
            elif message.get("type") == "sign_language":
                # Handle continuous sign language detection
                sign = message.get("payload")
                print(f"Sign detected: {sign}")
                
    except Exception as e:
        print(f"WebSocket Error/Disconnect: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
