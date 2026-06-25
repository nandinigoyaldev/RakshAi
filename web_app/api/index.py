from fastapi import FastAPI
from pydantic import BaseModel
import time

app = FastAPI(title="Autobot API")

class SignPayload(BaseModel):
    sign: str

@app.get("/api/health")
async def health_check():
    return {"status": "online", "system": "JARVIS Web Serverless", "timestamp": time.time()}

@app.post("/api/sign")
async def handle_sign(payload: SignPayload):
    # Process the sign logic here
    print(f"Received sign from client: {payload.sign}")
    return {"status": "success", "message": f"Processed sign: {payload.sign}"}
