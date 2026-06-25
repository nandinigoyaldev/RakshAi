import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const enableWebcamButton = document.getElementById("enableWebcamButton");
const apiStatus = document.getElementById("api-status");
const camStatus = document.getElementById("camera-status");

const gestureOutput = document.getElementById("gesture-output");
const trackingStatus = document.getElementById("tracking-status");
const handednessOut = document.getElementById("handedness-out");
const notificationsBox = document.getElementById("notifications-box");

let handLandmarker = undefined;
let runningMode = "VIDEO";
let webcamRunning = false;
let lastVideoTime = -1;
let lastSignSentTime = 0;

// API connection check
async function checkBackendAPI() {
    try {
        const response = await fetch('/api/health');
        if (response.ok) {
            apiStatus.textContent = "SYS: ONLINE";
            apiStatus.className = "badge active";
        } else {
            throw new Error("API not ok");
        }
    } catch (error) {
        apiStatus.textContent = "SYS: OFFLINE";
        apiStatus.className = "badge error";
    }
}

// Check API status periodically
checkBackendAPI();
setInterval(checkBackendAPI, 10000);

function addNotification(text) {
    const p = document.createElement("p");
    p.className = "sys-msg";
    p.textContent = `> [${new Date().toLocaleTimeString()}] ${text}`;
    notificationsBox.prepend(p);
}

// Initialize MediaPipe
async function createHandLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: runningMode,
        numHands: 2,
        minHandDetectionConfidence: 0.7,
        minHandPresenceConfidence: 0.7,
        minTrackingConfidence: 0.7
    });
    enableWebcamButton.classList.remove("disabled");
    addNotification("AI Model Loaded: Ready for Sign Language.");
}

createHandLandmarker();

// Enable webcam
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    enableWebcamButton.addEventListener("click", enableCam);
} else {
    console.warn("getUserMedia() is not supported by your browser");
}

function enableCam(event) {
    if (!handLandmarker) {
        console.log("Wait! objectDetector not loaded yet.");
        return;
    }

    if (webcamRunning === true) {
        webcamRunning = false;
        enableWebcamButton.innerHTML = "[ INITIATE OPTICAL SENSOR ]";
        camStatus.textContent = "CAM: OFFLINE";
        camStatus.className = "badge";
        video.srcObject.getTracks().forEach(track => track.stop());
    } else {
        webcamRunning = true;
        enableWebcamButton.innerHTML = "[ TERMINATE OPTICAL SENSOR ]";
        camStatus.textContent = "CAM: ONLINE";
        camStatus.className = "badge active";

        const constraints = { video: { facingMode: "user" } };
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        });
    }
}

// Prediction Loop
async function predictWebcam() {
    canvasElement.style.width = video.videoWidth;
    canvasElement.style.height = video.videoHeight;
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
    
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await handLandmarker.setOptions({ runningMode: "VIDEO" });
    }

    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        const results = handLandmarker.detectForVideo(video, startTimeMs);
        
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        if (results.landmarks && results.landmarks.length > 0) {
            trackingStatus.textContent = "ACTIVE";
            trackingStatus.style.color = "var(--success)";
            
            handednessOut.textContent = results.handednesses[0][0].displayName;

            for (const landmarks of results.landmarks) {
                drawConnectors(canvasCtx, landmarks, {
                    color: "rgba(0, 240, 255, 0.4)",
                    lineWidth: 2
                });
                drawLandmarks(canvasCtx, landmarks, { 
                    color: "#00f0ff", 
                    lineWidth: 1, 
                    radius: 2 
                });
            }
            
            // Sign Language Heuristics
            const sign = detectSignLanguage(results.landmarks[0]);
            if(sign) {
                if (gestureOutput.innerHTML !== sign) {
                    gestureOutput.innerHTML = sign;
                    
                    // Throttle API requests to Vercel so we don't spam
                    if (Date.now() - lastSignSentTime > 1500) {
                        lastSignSentTime = Date.now();
                        sendSignToAPI(sign);
                    }
                }
            }
            
        } else {
            trackingStatus.textContent = "INACTIVE";
            trackingStatus.style.color = "var(--text-secondary)";
            handednessOut.textContent = "-";
            gestureOutput.innerHTML = `<span class="placeholder">AWAITING INPUT...</span>`;
        }
        canvasCtx.restore();
    }

    if (webcamRunning === true) {
        window.requestAnimationFrame(predictWebcam);
    }
}

async function sendSignToAPI(sign) {
    try {
        const response = await fetch('/api/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sign: sign })
        });
        const data = await response.json();
        addNotification(`Uplink: ${data.message}`);
    } catch (err) {
        console.error(err);
    }
}

// Very basic Sign Language Heuristic for Demo
function detectSignLanguage(landmarks) {
    const isFingerUp = (tip, mcp) => landmarks[tip].y < landmarks[mcp].y;
    const indexUp = isFingerUp(8, 5);
    const middleUp = isFingerUp(12, 9);
    const ringUp = isFingerUp(16, 13);
    const pinkyUp = isFingerUp(20, 17);
    
    if (indexUp && middleUp && !ringUp && !pinkyUp) {
        return "V / 2";
    } else if (indexUp && !middleUp && !ringUp && !pinkyUp) {
        return "1 / POINT";
    } else if (indexUp && middleUp && ringUp && pinkyUp) {
        return "5 / OPEN";
    } else if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
        return "A / FIST";
    }
    return null;
}

function drawConnectors(ctx, landmarks, options) {
    ctx.strokeStyle = options.color || "#00f0ff";
    ctx.lineWidth = options.lineWidth || 2;
}

function drawLandmarks(ctx, landmarks, options) {
    ctx.fillStyle = options.color || "#00f0ff";
    for(const lm of landmarks) {
        ctx.beginPath();
        ctx.arc(lm.x * canvasElement.width, lm.y * canvasElement.height, options.radius || 2, 0, 2 * Math.PI);
        ctx.fill();
    }
}
