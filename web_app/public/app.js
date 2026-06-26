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
let jarvisRotation = 0;

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

checkBackendAPI();
setInterval(checkBackendAPI, 10000);

function addNotification(text) {
    const p = document.createElement("p");
    p.className = "sys-msg";
    p.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
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
    addNotification("Vision System Initialized.");
}

createHandLandmarker();

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    enableWebcamButton.addEventListener("click", enableCam);
}

function enableCam(event) {
    if (!handLandmarker) return;

    if (webcamRunning === true) {
        webcamRunning = false;
        enableWebcamButton.innerHTML = "Enable Camera";
        camStatus.textContent = "CAM: OFFLINE";
        camStatus.className = "badge";
        video.srcObject.getTracks().forEach(track => track.stop());
    } else {
        webcamRunning = true;
        enableWebcamButton.innerHTML = "Disable Camera";
        camStatus.textContent = "CAM: ONLINE";
        camStatus.className = "badge active";

        const constraints = { video: { facingMode: "user" } };
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        });
    }
}

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
                drawConnectors(canvasCtx, landmarks, { color: "rgba(59, 130, 246, 0.4)", lineWidth: 2 });
                drawLandmarks(canvasCtx, landmarks, { color: "#3b82f6", lineWidth: 1, radius: 2 });
            }
            
            // Finger counting heuristics
            const primaryFingerCount = detectFingerCount(results.landmarks[0]);
            let gestureLabel = (primaryFingerCount === 5) ? "5 Fingers (autobotx uchless kisosk Mode)" : "Resting";

            // Draw autobotx uchless kisosk circle for ANY hand showing 5 fingers
            results.landmarks.forEach((landmarks, index) => {
                if (detectFingerCount(landmarks) === 5) {
                    const handName = results.handednesses[index][0].displayName;
                    drawJarvisCircle(canvasCtx, landmarks, handName);
                }
            });

            if (gestureOutput.innerHTML !== gestureLabel) {
                gestureOutput.innerHTML = gestureLabel;
            }
            
        } else {
            trackingStatus.textContent = "INACTIVE";
            trackingStatus.style.color = "var(--text-secondary)";
            handednessOut.textContent = "-";
            gestureOutput.innerHTML = `<span class="placeholder">Waiting for hand...</span>`;
        }
        canvasCtx.restore();
    }

    if (webcamRunning === true) {
        window.requestAnimationFrame(predictWebcam);
    }
}

// Very basic finger counting heuristic
function detectFingerCount(landmarks) {
    const isFingerUp = (tip, mcp) => landmarks[tip].y < landmarks[mcp].y;
    
    // Note: Thumb heuristic is simplified for a front-facing palm
    const thumbUp = landmarks[4].x < landmarks[3].x; // This depends on handedness, simplified here.
    const indexUp = isFingerUp(8, 5);
    const middleUp = isFingerUp(12, 9);
    const ringUp = isFingerUp(16, 13);
    const pinkyUp = isFingerUp(20, 17);
    
    let count = 0;
    if (indexUp) count++;
    if (middleUp) count++;
    if (ringUp) count++;
    if (pinkyUp) count++;
    
    // Crude thumb check
    if (Math.abs(landmarks[4].x - landmarks[5].x) > 0.05) {
        count++;
    }

    // Clamp count
    return Math.min(5, Math.max(0, count));
}

function drawConnectors(ctx, landmarks, options) {
    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.lineWidth;
}

function drawLandmarks(ctx, landmarks, options) {
    ctx.fillStyle = options.color;
    for(const lm of landmarks) {
        ctx.beginPath();
        ctx.arc(lm.x * canvasElement.width, lm.y * canvasElement.height, options.radius, 0, 2 * Math.PI);
        ctx.fill();
    }
}

function drawJarvisCircle(ctx, landmarks, handName) {
    const center = landmarks[9]; // Middle finger MCP
    const x = center.x * canvasElement.width;
    const y = center.y * canvasElement.height;
    
    const wrist = landmarks[0];
    const middleTip = landmarks[12];
    const dx = (wrist.x - middleTip.x) * canvasElement.width;
    const dy = (wrist.y - middleTip.y) * canvasElement.height;
    const handSize = Math.sqrt(dx*dx + dy*dy);
    
    const baseRadius = 90 + (handSize * 0.2);

    jarvisRotation += 0.04;
    const time = Date.now();
    const pulse = Math.sin(time / 150) * 0.05 + 1.0; 

    const hue = handName === "Left" ? 180 : 35;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse); 
    
    // Core glow
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 0.3, 0, 2 * Math.PI);
    ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.15)`;
    ctx.shadowBlur = 30;
    ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
    ctx.fill();

    // Inner fast-rotating dashed ring
    ctx.save();
    ctx.rotate(jarvisRotation * 2.5);
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 0.7, 0, 2 * Math.PI);
    ctx.strokeStyle = `hsla(${hue}, 100%, 60%, 0.9)`;
    ctx.lineWidth = 3;
    ctx.setLineDash([15, 10, 5, 10]);
    ctx.stroke();
    ctx.restore();
    
    // Middle solid ring with gaps (reverse rotation)
    ctx.save();
    ctx.rotate(-jarvisRotation * 1.5);
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 1.0, 0.2, 2 * Math.PI - 0.2);
    ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.7)`;
    ctx.lineWidth = 4;
    ctx.setLineDash([80, 30]);
    ctx.stroke();
    
    // Draw an inscribed hexagon
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
        const angle = i * Math.PI / 3;
        const px = Math.cos(angle) * baseRadius * 1.0;
        const py = Math.sin(angle) * baseRadius * 1.0;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.3)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.restore();

    // Outer thick radar band
    ctx.save();
    ctx.rotate(jarvisRotation * 0.8);
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 1.3, 0, Math.PI * 0.7);
    ctx.strokeStyle = `hsla(${hue}, 80%, 50%, 0.5)`;
    ctx.lineWidth = 10;
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 1.3, Math.PI, Math.PI * 1.7);
    ctx.stroke();
    
    // Outer tick marks
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 1.45, 0, 2 * Math.PI);
    ctx.strokeStyle = `hsla(${hue}, 100%, 60%, 0.6)`;
    ctx.lineWidth = 4;
    ctx.setLineDash([2, 18]);
    ctx.stroke();
    ctx.restore();

    // Draw cybernetic lines to fingertips
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.7)`;
    const tips = [4, 8, 12, 16, 20];
    tips.forEach((tipIdx, i) => {
        const tip = landmarks[tipIdx];
        const tx = tip.x * canvasElement.width - x;
        const ty = tip.y * canvasElement.height - y;
        
        const lineLen = Math.sqrt(tx*tx + ty*ty);
        const sweep = (time / 10 + i * 50) % lineLen;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        
        const hx = (tx / lineLen) * sweep;
        const hy = (ty / lineLen) * sweep;
        ctx.beginPath();
        ctx.arc(hx, hy, 3, 0, 2*Math.PI);
        ctx.fillStyle = "#fff";
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(tx, ty, 6 + Math.sin(time/100 + i)*2, 0, 2 * Math.PI);
        ctx.fillStyle = `hsla(${hue}, 100%, 60%, 0.9)`;
        ctx.fill();
    });

    ctx.restore();
}
