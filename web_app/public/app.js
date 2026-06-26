import { HandLandmarker, ObjectDetector, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

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
let objectDetector = undefined;
let runningMode = "VIDEO";
let webcamRunning = false;
let lastVideoTime = -1;
let jarvisRotation = 0;
let currentVisualContext = [];

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

// Initialize MediaPipe Models
async function createMediaPipeModels() {
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
    
    objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
            delegate: "GPU"
        },
        scoreThreshold: 0.25,
        maxResults: 15,
        runningMode: runningMode
    });
    
    if (initializeSystemButton) {
        initializeSystemButton.classList.remove("disabled");
    }
    addNotification("AI Models Loaded: Hands & Objects ready.");
    const objOut = document.getElementById("object-output");
    if(objOut) objOut.innerHTML = `<p class="sys-msg">Scanner ready.</p>`;
}

createMediaPipeModels();

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
        await objectDetector.setOptions({ runningMode: "VIDEO" });
    }

    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        const results = handLandmarker.detectForVideo(video, startTimeMs);
        const objResults = objectDetector.detectForVideo(video, startTimeMs);
        
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        // Draw Futuristic Object Bounding Boxes
        const objOut = document.getElementById("object-output");
        currentVisualContext = [];
        if (objResults.detections.length > 0) {
            for (const detection of objResults.detections) {
                const category = detection.categories[0];
                const box = detection.boundingBox;
                const score = Math.round(category.score * 100);
                
                if (!currentVisualContext.includes(category.categoryName)) {
                    currentVisualContext.push(category.categoryName);
                }

                // Futuristic Targeting Box (Corners only)
                const x = box.originX * (canvasElement.width / video.videoWidth);
                const y = box.originY * (canvasElement.height / video.videoHeight);
                const w = box.width * (canvasElement.width / video.videoWidth);
                const h = box.height * (canvasElement.height / video.videoHeight);
                const color = category.categoryName === "person" ? "#ef4444" : "#10b981"; // Red for person, green for objects
                
                canvasCtx.strokeStyle = color;
                canvasCtx.lineWidth = 2;
                canvasCtx.beginPath();
                const cornerLen = 20;
                // Top Left
                canvasCtx.moveTo(x, y + cornerLen); canvasCtx.lineTo(x, y); canvasCtx.lineTo(x + cornerLen, y);
                // Top Right
                canvasCtx.moveTo(x + w - cornerLen, y); canvasCtx.lineTo(x + w, y); canvasCtx.lineTo(x + w, y + cornerLen);
                // Bottom Left
                canvasCtx.moveTo(x, y + h - cornerLen); canvasCtx.lineTo(x, y + h); canvasCtx.lineTo(x + cornerLen, y + h);
                // Bottom Right
                canvasCtx.moveTo(x + w - cornerLen, y + h); canvasCtx.lineTo(x + w, y + h); canvasCtx.lineTo(x + w, y + h - cornerLen);
                canvasCtx.stroke();
                
                // Crosshair
                canvasCtx.beginPath();
                canvasCtx.moveTo(x + w/2 - 10, y + h/2);
                canvasCtx.lineTo(x + w/2 + 10, y + h/2);
                canvasCtx.moveTo(x + w/2, y + h/2 - 10);
                canvasCtx.lineTo(x + w/2, y + h/2 + 10);
                canvasCtx.strokeStyle = "rgba(255,255,255,0.5)";
                canvasCtx.stroke();

                // High-tech Label (Flipped to read normally on mirrored canvas)
                canvasCtx.save();
                canvasCtx.translate(x + w/2, y - 10);
                canvasCtx.scale(-1, 1); // Flip horizontally to counteract CSS mirror
                canvasCtx.fillStyle = color;
                canvasCtx.font = "bold 14px monospace";
                canvasCtx.textAlign = "center";
                canvasCtx.fillText(`TARGET: ${category.categoryName.toUpperCase()} [${score}%]`, 0, 0);
                canvasCtx.restore();
            }
        }
        
        if (objOut) {
            if (currentVisualContext.length > 0) {
                objOut.innerHTML = currentVisualContext.map(c => `<p class="sys-msg">Tracking: <strong>${c.toUpperCase()}</strong></p>`).join("");
            } else {
                objOut.innerHTML = `<p class="sys-msg">No targets detected.</p>`;
            }
        }
        
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

const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17]
];

function drawConnectors(ctx, landmarks, options) {
    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.lineWidth;
    ctx.beginPath();
    for (const connection of HAND_CONNECTIONS) {
        const p1 = landmarks[connection[0]];
        const p2 = landmarks[connection[1]];
        ctx.moveTo(p1.x * canvasElement.width, p1.y * canvasElement.height);
        ctx.lineTo(p2.x * canvasElement.width, p2.y * canvasElement.height);
    }
    ctx.stroke();
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
    
    const dx = landmarks[0].x - landmarks[9].x;
    const dy = landmarks[0].y - landmarks[9].y;
    const handSize = Math.sqrt(dx*dx + dy*dy);
    
    const baseRadius = 90 + (handSize * 0.2);

    const time = Date.now();
    const pulse = Math.sin(time / 150) * 0.05 + 1.0; 

    // Determine color based on hand
    const hue = handName === "Left" ? 180 : 35; // Cyan for left, Orange for right
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(jarvisRotation);
    ctx.scale(pulse, pulse);

    // Make the colors pop much stronger
    ctx.globalCompositeOperation = "screen";

    // Heavy Outer glow block
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius + 20, 0, 2 * Math.PI);
    ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.4)`;
    ctx.fill();

    // Thick Main Ring block
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius, 0, 2 * Math.PI);
    ctx.strokeStyle = `hsla(${hue}, 100%, 60%, 1)`;
    ctx.lineWidth = 12; // Extra heavy
    ctx.stroke();

    // Inner Dashed Ring block
    ctx.beginPath();
    ctx.setLineDash([20, 15]);
    ctx.arc(0, 0, baseRadius - 20, 0, 2 * Math.PI);
    ctx.strokeStyle = `hsla(${hue}, 100%, 70%, 1)`;
    ctx.lineWidth = 8; // Extra heavy
    ctx.stroke();
    ctx.setLineDash([]); // Reset

    // Core solid ring block
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius - 40, 0, 2 * Math.PI);
    ctx.fillStyle = `hsla(${hue}, 100%, 80%, 0.6)`;
    ctx.fill();

    // Draw heavy tech nodes on the outer ring
    for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const nx = Math.cos(angle) * baseRadius;
        const ny = Math.sin(angle) * baseRadius;
        ctx.beginPath();
        ctx.rect(nx - 10, ny - 10, 20, 20); // Square blocks
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 1)`;
        ctx.lineWidth = 4;
        ctx.stroke();
    }

    ctx.restore();

    // Draw heavy cybernetic lines to fingertips
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.setLineDash([10, 10]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.9)`;
    const tips = [4, 8, 12, 16, 20];
    tips.forEach((tipIdx, i) => {
        const tip = landmarks[tipIdx];
        const tx = tip.x * canvasElement.width;
        const ty = tip.y * canvasElement.height;
        
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        
        // Massive blocks at the fingertips
        ctx.beginPath();
        ctx.rect(tx - 8, ty - 8, 16, 16);
        ctx.fillStyle = `hsla(${hue}, 100%, 70%, 1)`;
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
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
        voiceStatus.textContent = "VOICE: LISTENING";
        voiceStatus.className = "badge active";
        addNotification("Microphone is now active and listening.");
    };
    
    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        
        const partial = (finalTranscript + interimTranscript).trim();
        if (partial.length > 0) {
            const voiceOutput = document.getElementById("voice-output");
            if (voiceOutput) {
                let placeholder = voiceOutput.querySelector(".interim-msg");
                if (!placeholder) {
                    placeholder = document.createElement("p");
                    placeholder.className = "interim-msg sys-msg";
                    placeholder.style.color = "var(--primary-glow)";
                    voiceOutput.appendChild(placeholder);
                }
                placeholder.innerHTML = `<em>...${partial}</em>`;
                voiceOutput.scrollTop = voiceOutput.scrollHeight;
            }
        }
        
        let text = finalTranscript.trim().toLowerCase();
        
        if (text) {
            console.log("Final Speech captured:", text);
            addNotification("🎤 Heard: '" + text + "'");
            
            // Remove interim placeholder
            const voiceOutput = document.getElementById("voice-output");
            if (voiceOutput) {
                const placeholder = voiceOutput.querySelector(".interim-msg");
                if (placeholder) placeholder.remove();
            }
            
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
            body: JSON.stringify({ prompt: command, context: currentVisualContext })
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
            isVoiceEnabled = false;
        }
        if (event.error === "network") {
            addNotification("Network error: Browser speech recognition failed. Try using Google Chrome.");
            isVoiceEnabled = false;
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
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.pitch = 1.0;
    utterance.rate = 1.0;
    
    const voices = window.speechSynthesis.getVoices();
    let jarvisVoice = voices.find(v => 
        v.name.includes("Daniel") || 
        v.name.includes("Google UK English Male") ||
        (v.lang === "en-GB" && v.name.toLowerCase().includes("male"))
    );
    
    if (!jarvisVoice) {
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

