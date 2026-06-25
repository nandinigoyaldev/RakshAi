## JARVIS — Beginner Guide (Gesture + Voice)

Welcome! This repo teaches you how to build a simple JARVIS-style assistant using hand gestures, voice commands, and (optionally) Spotify control. The instructions below assume you are using Linux and have a webcam and microphone available.

If you cloned this repo from GitHub, replace the repository URL in the commands below with your repo's URL.

### 1) Clone repository

```bash
# replace <your-repo-url> with the GitHub URL
git clone <your-repo-url>
cd Auto_bot_x
```

### 2) Create Python virtual environment and activate

```bash
python3 -m venv .venv
. .venv/bin/activate
```

Windows (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Windows (cmd.exe):

```cmd
python -m venv .venv
.\.venv\Scripts\activate.bat
```

### 3) Install Python dependencies

```bash
pip install -r requirements.txt
```

If the install fails for `mediapipe` or other packages, follow the errors and install any missing system packages (example: `sudo apt install build-essential libatlas-base-dev`).

Notes by OS:

- Linux: you may need build tools and PortAudio for audio support:

```bash
sudo apt install build-essential libatlas-base-dev portaudio19-dev
```

- macOS (Intel / Apple Silicon): install Homebrew then:

```bash
brew install portaudio ffmpeg
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

On Apple Silicon you may need to use Python from Homebrew or install universal2 wheels for some packages.

- Windows: install "Build Tools for Visual Studio" (C++), then activate venv and run `pip install -r requirements.txt`.
   If `sounddevice` or `mediapipe` fail, install prebuilt wheels or use `pipwin` for PortAudio where applicable.

### 4) Optional system packages (recommended)

```bash
# Local media control fallback
sudo apt install playerctl

# Text-to-speech (optional)
sudo apt install speech-dispatcher espeak
```

### 5) Configure environment variables (optional — Spotify)

To enable Spotify Web API control, create a `.env` file in the project root with:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
```

Create the Spotify app and add the redirect URI in the Spotify Developer Dashboard.

### 6) What each file/folder is for

- `gesture.py` — Main launcher that runs the full JARVIS app.
- `lessons/` — Small, focused lesson scripts for teaching step-by-step.
- `lessons/lesson_06_gesture_recognition_full.py` — Full app implementation (same as `gesture.py` behavior).
- `spotify.py`, `voice.py` — Helpers for Spotify and voice recognition.
- `audios/` — Sound effects used by the app.
- `requirements.txt` — Python dependencies to install.

### 7) Run the full JARVIS app

```bash
# Use CAMERA_INDEX to select the webcam if you have multiple
CAMERA_INDEX=0 python gesture.py
```

Controls inside the app:
- `V` — Toggle voice recognition on/off
- `M` — Switch between GESTURE and SPOTIFY modes
- `ESC` — Quit the application

### 8) Run an individual lesson (recommended for beginners)

Start with the camera lesson:

```bash
python lessons/lesson_01_open_camera.py
```

Then follow lessons in order:
- `lesson_02_count_fingers.py` — MediaPipe hand detection and finger counting
- `lesson_03_two_finger_screenshot.py` — Trigger screenshots with 2 fingers
- `lesson_04_voice_control.py` — Voice listener demo
- `lesson_05_spotify_integration.py` — Spotify API demo
- `lesson_06_gesture_recognition_full.py` — Full system (same features as `gesture.py`)

### 9) Gestures supported (quick reference)

- `1 finger` — Open browser (one-time trigger)
- `pinch` (thumb + index) — Sparkle effect (audio/visual)
- `2 fingers` — Screenshot (saves to `screenshots/` by default)
- `5 fingers` — Enter JARVIS mode

In `SPOTIFY` mode (press `M`):
- `1` — Play
- `2` — Pause
- `3` — Previous track
- `4` — Next track

### 10) Customizing gestures

Open or create `profiles.json` in the project root to remap gestures or adjust settings. The default profile contains mappings for `gesture_mode_gestures` and `spotify_gestures`.

### 11) Ignore screenshots folder in the repo

This project keeps automatic screenshots locally. The repository is configured to ignore the `screenshots/` folder — no changes needed. (If you want to remove it from `.gitignore`, edit `.gitignore`.)

### 12) Troubleshooting

- If OpenCV windows are blank on Wayland, run:

```bash
export QT_QPA_PLATFORM=xcb
python gesture.py
```

- If microphone input is not detected, run:

```bash
python -m sounddevice
```

- If Spotify API fails, ensure `.env` is configured and redirect URI matches your Spotify app settings.

### 13) Contributing and classroom usage

This repo is organized for teaching. For workshops we recommend:
- Run lessons in order
- Ask students to modify small parts (e.g., change gesture actions)
- Use `lesson_06_gesture_recognition_full.py` as the final demo

---

If you want, I can also:
- Add a short `CONTRIBUTING.md` tailored for student exercises
- Add a minimal `profiles.json` example with comments
- Create a `run.sh` helper script that sets up the venv and runs the app

Happy teaching! 🎓


4. If using Spotify API control, set:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI` (must match your Spotify app config)

## Run

```bash
jarvis-gesture
```

Or:

```bash
python scripts/run_gesture.py
```

## Controls

- Press `v` in the camera window to toggle voice mode on/off.
- Press `Esc` to exit.
- When voice mode is on, gesture actions are paused to prevent accidental triggers.

## Environment Variables

See `.env.example` for all supported keys. Important ones:

- Spotify API: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`
- Cloud AI chat: `OPENAI_API_KEY` or `AI_CHAT_API_KEY`, `AI_CHAT_API_BASE`, `AI_CHAT_MODEL`
- Local AI chat (Ollama): `AI_LOCAL_API_BASE`, `AI_LOCAL_MODEL`, `AI_AUTO_START_OLLAMA`
- Camera selection: `CAMERA_INDEX` (example: `0` or `0,1`)
- Visual theme: `JARVIS_THEME` (`auto`, `amber`, `cyan`)
- Render quality: `RENDER_QUALITY` (`performance`, `balanced`, `ultra`)
- HUD/FPS display: `SHOW_FPS` (`true`/`false`), `JARVIS_BUILD_TAG` (example: `v1.0.0`)

## Troubleshooting

### Voice hears you but no spoken reply

The app speaks via `spd-say` first, then `espeak` fallback.
Install one of these packages:

```bash
sudo apt install speech-dispatcher espeak
```

### Spotify commands do not respond

- Ensure Spotify desktop/web is running and currently active.
- If API credentials are not set, install local fallback control:

```bash
sudo apt install playerctl
```

### Camera does not open

- Confirm webcam permissions.
- Try setting `CAMERA_INDEX` in `.env`.

## Security

- Never commit `.env`.
- Rotate keys immediately if exposed.
- See `SECURITY.md` for reporting guidance.

## Contributing

See `CONTRIBUTING.md`.

## Activate the env

```bash
source myenv/bin/activate
```

## Web Application & Sign Language (Vercel Ready)

The Autobot project now includes a futuristic, JARVIS-styled web interface with built-in Sign Language Recognition!

### Features
- **Sign Language Recognition**: Detects basic signs (A/Fist, V/2, 5/Open, 1/Point) directly in your browser.
- **JARVIS Aesthetics**: Monospaced terminal fonts, cyan wireframes, and holographic scanlines.
- **Vercel Deployable**: The `web_app/` folder is pre-configured to be deployed instantly on Vercel as a Serverless API + Static Frontend.

### Running Locally
To test the web app on your local machine:
1. Navigate to the web directory: `cd web_app`
2. Install the web dependencies: `pip install -r requirements.txt`
3. Run the backend server: `uvicorn api.index:app --reload`
4. Open your browser and go to `http://localhost:8000`

### Deploying to Vercel
1. Push this repository to GitHub.
2. Log into Vercel and click **Add New Project**.
3. Import your GitHub repository.
4. Set the **Root Directory** to `web_app`.
5. Vercel will automatically detect `vercel.json` and deploy both the Python Serverless function and the static frontend!
