import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const initializeSystemButton = document.getElementById("initializeSystemButton");
const apiStatus = document.getElementById("api-status");
const camStatus = document.getElementById("camera-status");
const voiceStatus = document.getElementById("voice-status");

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
    if (initializeSystemButton) {
        initializeSystemButton.classList.remove("disabled");
    }
    addNotification("Vision System Initialized.");
}

createHandLandmarker();

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    if (initializeSystemButton) {
        initializeSystemButton.addEventListener("click", initializeSystem);
    }
}

let systemInitialized = false;

function initializeSystem(event) {
    if (!handLandmarker) return;

    if (systemInitialized) {
        // Shutdown
        systemInitialized = false;
        initializeSystemButton.innerHTML = "Initialize J.A.R.V.I.S.";
        initializeSystemButton.classList.remove("active");
        
        webcamRunning = false;
        camStatus.textContent = "CAM: OFFLINE";
        camStatus.className = "badge";
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        
        isVoiceEnabled = false;
        voiceStatus.textContent = "VOICE: OFFLINE";
        voiceStatus.className = "badge";
        if (recognition) {
            recognition.stop();
        }
        addNotification("J.A.R.V.I.S. deactivated.");
    } else {
        // Startup
        systemInitialized = true;
        initializeSystemButton.innerHTML = "Disable J.A.R.V.I.S.";
        initializeSystemButton.classList.add("active");
        
        webcamRunning = true;
        camStatus.textContent = "CAM: ONLINE";
        camStatus.className = "badge active";
        
        const constraints = { video: { facingMode: "user" }, audio: true };
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            // Release the microphone track immediately so SpeechRecognition can use it!
            stream.getAudioTracks().forEach(track => track.stop());
            
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
            
            // Start voice ONLY after permissions are explicitly granted!
            isVoiceEnabled = true;
            voiceStatus.textContent = "VOICE: LISTENING";
            voiceStatus.className = "badge active";
            if (recognition) {
                try {
                    recognition.start();
                } catch (e) {
                    console.error("Voice start failed:", e);
                    addNotification("Failed to start voice: " + e.message);
                }
            }
            addNotification("J.A.R.V.I.S. initialized. Say 'Hey Jarvis' to interact.");
        }).catch(err => {
            console.error("Permission denied:", err);
            addNotification("Camera/Mic permissions denied. Please allow them in your browser.");
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
            
            jarvisRotation += 0.04; // Update once per frame

            for (const landmarks of results.landmarks) {
                drawConnectors(canvasCtx, landmarks, { color: "rgba(59, 130, 246, 0.4)", lineWidth: 2 });
                drawLandmarks(canvasCtx, landmarks, { color: "#3b82f6", lineWidth: 1, radius: 2 });
            }
            
            // Finger counting heuristics
            const primaryFingerCount = detectFingerCount(results.landmarks[0]);
            let gestureLabel = (primaryFingerCount === 5) ? "5 Fingers (autobotx Mode)" : "Resting";

            // Draw autobotx circle for ANY hand showing 5 fingers
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

function playWakeChime() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    const audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'sine';
    // Classic high-tech double beep effect
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); 
    osc.frequency.setValueAtTime(1760, audioCtx.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.2);
}

// --- Voice Assistant ---

let isVoiceEnabled = false;
let recognition = null;
let jarvisAwake = false;
let awakeTimeout = null;

// Speech Recognition (Web Speech API)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
        voiceStatus.textContent = "VOICE: LISTENING";
        voiceStatus.className = "badge active";
        addNotification("Microphone is now active and listening.");
    };
    
    recognition.onresult = (event) => {
        const last = event.results.length - 1;
        let text = event.results[last][0].transcript.trim().toLowerCase();
        
        console.log("Speech captured:", text);
        addNotification("🎤 Heard: '" + text + "'");
        
        if (text) {
            const wakeWords = ["hey jarvis", "jarvis"];
            let isWakeWordDetected = false;
            let command = "";
            
            for (let word of wakeWords) {
                if (text.startsWith(word) || text.includes(word)) {
                    isWakeWordDetected = true;
                    const idx = text.indexOf(word);
                    command = text.substring(idx + word.length).trim();
                    break;
                }
            }
            
            if (isWakeWordDetected) {
                if (command.length > 0) {
                    jarvisAwake = false;
                    processVoiceCommand(command);
                } else {
                    jarvisAwake = true;
                    playWakeChime();
                    clearTimeout(awakeTimeout);
                    awakeTimeout = setTimeout(() => {
                        jarvisAwake = false;
                        if (isVoiceEnabled) {
                            voiceStatus.textContent = "VOICE: LISTENING";
                        }
                    }, 10000); // stay awake for 10s
                    voiceStatus.textContent = "VOICE: AWAKE";
                }
            } else if (jarvisAwake) {
                jarvisAwake = false;
                clearTimeout(awakeTimeout);
                processVoiceCommand(text);
            }
        }
    };
    
    function processVoiceCommand(command) {
        addVoiceMessage("You", command);
        voiceStatus.textContent = "VOICE: PROCESSING";
        
        // Send to backend via REST API
        fetch('/api/voice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt: command })
        })
        .then(res => res.json())
        .then(data => {
            if (data.response) {
                addVoiceMessage("J.A.R.V.I.S.", data.response);
                speakText(data.response);
            }
            if (isVoiceEnabled) {
                voiceStatus.textContent = "VOICE: LISTENING";
            }
        })
        .catch(err => {
            console.error("Voice API error:", err);
            addNotification("Failed to connect to voice backend.");
            if (isVoiceEnabled) {
                voiceStatus.textContent = "VOICE: LISTENING";
            }
        });
    }
    
    recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        addNotification("Speech Error: " + event.error);
        if (event.error === "not-allowed") {
            addNotification("Microphone access denied. Please check permissions.");
        }
    };
    
    recognition.onend = () => {
        console.log("Speech recognition ended.");
        // Auto restart if still enabled
        if (isVoiceEnabled) {
            try {
                recognition.start();
            } catch (e) {
                console.error("Failed to restart recognition:", e);
            }
        } else {
            voiceStatus.textContent = "VOICE: ONLINE (PAUSED)";
            voiceStatus.className = "badge active";
        }
    };
} else {
    addNotification("Web Speech API not supported in this browser.");
}

function addVoiceMessage(sender, text) {
    const voiceOutput = document.getElementById("voice-output");
    if (voiceOutput) {
        // Remove placeholder if present
        const placeholder = voiceOutput.querySelector(".sys-msg");
        if (placeholder && placeholder.textContent.includes("Waiting")) {
            placeholder.remove();
        }
        
        const p = document.createElement("p");
        p.innerHTML = `<strong>${sender}:</strong> ${text}`;
        voiceOutput.appendChild(p);
        voiceOutput.scrollTop = voiceOutput.scrollHeight;
    }
}

// Text to Speech (Speech Synthesis)
function speakText(text) {
    if (!window.speechSynthesis) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.pitch = 0.8;
    utterance.rate = 1.05;
    
    // Try to find a male British voice
    const voices = window.speechSynthesis.getVoices();
    let jarvisVoice = voices.find(v => 
        v.name.includes("Daniel") || 
        v.name.includes("Google UK English Male") ||
        (v.lang === "en-GB" && v.name.toLowerCase().includes("male"))
    );
    
    if (!jarvisVoice) {
        // Fallback to any en-GB voice
        jarvisVoice = voices.find(v => v.lang === 'en-GB');
    }
    
    if (jarvisVoice) {
        utterance.voice = jarvisVoice;
    }
    
    // Temporarily pause recognition while speaking to avoid hearing itself
    if (recognition && isVoiceEnabled) {
        recognition.stop();
        utterance.onend = () => {
            if (isVoiceEnabled) {
                try {
                    recognition.start();
                } catch (e) {}
            }
        };
    }
    
    window.speechSynthesis.speak(utterance);
}

// Pre-load voices (browser quirk)
if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

