# autobotx Hackathon Project - Gesture + Voice Recognition

This project implements **autobotx**, a complete hand gesture and voice recognition system. The code is structured into modules handling different features.

## Modules

Run each module with the virtualenv activated:

```bash
. .venv/bin/activate
python autobotx/module_name.py
```

### Level 1: Camera Fundamentals

#### **Camera Feed: Open Camera** 
- **Goal**: Learn to access the webcam with OpenCV
- **Topics**: Video capture, frame reading, real-time display
- **Skills**: Setting up camera input for vision tasks
```bash
CAMERA_INDEX=0 python autobotx/camera_feed.py
```

### Level 2: Hand Detection & Gesture Recognition

#### **Gesture Tracker: Count Fingers**
- **Goal**: Detect hands and count raised fingers
- **Topics**: MediaPipe hand detection, landmark analysis, gesture detection
- **Skills**: ML-based hand tracking, geometric calculations
```bash
python autobotx/gesture_tracker.py
```

#### **Screenshot Engine: Two Finger Screenshot**
- **Goal**: Take screenshots using a hand gesture
- **Topics**: Gesture triggering, screen capture, state management
- **Skills**: Combining gesture detection with system commands
```bash
python autobotx/screenshot_engine.py
```

### Level 3: Voice & Audio Integration

#### **Voice Assistant: Voice Command Recognition**
- **Goal**: Listen for and recognize voice commands
- **Topics**: Real-time audio capture, speech-to-text, wake word detection
- **Skills**: Voice processing, threading, callbacks
```bash
python autobotx/voice_assistant.py
```

### Level 4: External Service Integration

#### **Spotify Integration: Spotify Integration**
- **Goal**: Control music playback with Python
- **Topics**: OAuth authentication, API integration, error handling
- **Skills**: Working with APIs, credential management, graceful degradation
```bash
python autobotx/spotify_controller.py
```

### Level 5: Complete System

#### **Main App: Full autobotx System**
- **Goal**: Combine all features into one powerful application
- **Topics**: Multi-modal input, event architecture, real-time processing
- **Skills**: System integration, performance optimization, user experience
```bash
CAMERA_INDEX=0 python autobotx/main.py
```

Or use the main entry point:
```bash
CAMERA_INDEX=0 python -m autobotx.main
```

**Controls:**
- Raise fingers to trigger actions
- Press `V` to toggle voice recognition
- Press `M` to switch between gesture and music modes
- Press `ESC` to quit

## What You'll Learn

✅ Real-time computer vision with OpenCV  
✅ Machine learning models (MediaPipe)  
✅ Audio processing and speech recognition  
✅ API authentication and integration  
✅ Multi-threaded applications  
✅ Event-driven architectures  
✅ Professional code structure and documentation  

## Setup Instructions

1. **Create virtual environment:**
   ```bash
   python3 -m venv .venv
   . .venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Spotify (optional):**
   - Create a Spotify Developer account
   - Create a `.env` file in the project root:
   ```
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
   ```

4. **Install optional system dependencies:**
   ```bash
   # For local Spotify control (fallback)
   sudo apt install playerctl
   
   # For text-to-speech
   sudo apt install speech-dispatcher espeak
   
   # For local AI models (advanced)
   curl -fsSL https://ollama.ai/install.sh | sh
   ```

## Technical Architecture

The modules are designed to be standalone for easy integration. Each file contains:
- Clear comments explaining what's happening
- Well-structured code following best practices
- Modular functions that can be adapted
- Demo/test functions to verify learning

**Future implementations:**
- Delete certain code sections and re-implement them
- Modify gesture triggers to do different actions
- Add new voice commands
- Integrate different external APIs
- Optimize performance for different hardware

## Development Tips

1. **Start with Camera Feed** - Understand the fundamentals
2. **Run each module independently** - Don't skip around
3. **Read the code comments** - They explain the "why"
4. **Modify and experiment** - Change parameters, try new things
5. **Use the print statements** - Debug output helps understanding
6. **Progress gradually** - Complex concepts build on simpler ones

---

**Happy learning!** 🎓


