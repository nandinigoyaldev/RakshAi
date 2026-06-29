import os
import sys
import json
import threading
import time
from typing import Dict, Any

import serial
import serial.tools.list_ports

# Global thread‑safe state
_state_lock = threading.Lock()
_state: Dict[str, Any] = {
    "bpm": 0,
    "motion": 0.0,
    "hr_level": 0,
    "mot_level": 0,
    "connected": False,
}

def _detect_port() -> str | None:
    """Return first serial port that looks like an Arduino."""
    ports = list(serial.tools.list_ports.comports())
    for p in ports:
        name = p.device.lower()
        desc = (p.description or "").lower()
        if "arduino" in desc or "usb" in name or "acm" in name:
            return p.device
    return ports[0].device if ports else None

def _parse(line: str) -> Dict[str, Any]:
    # Expected: BPM:75,MOTION:1.2,HR_LEVEL:0,MOT_LEVEL:0
    parts = line.strip().split(',')
    data: Dict[str, Any] = {}
    for part in parts:
        if ':' not in part:
            continue
        k, v = part.split(':', 1)
        k = k.strip().lower()
        try:
            if k == 'bpm':
                data['bpm'] = int(v)
            elif k == 'motion':
                data['motion'] = float(v)
            elif k == 'hr_level':
                data['hr_level'] = int(v)
            elif k == 'mot_level':
                data['mot_level'] = int(v)
        except ValueError:
            continue
    return data

def _reader():
    ser = None
    while True:
        if ser is None:
            port = _detect_port()
            if port:
                try:
                    ser = serial.Serial(port, 9600, timeout=2)
                    with _state_lock:
                        state['connected'] = True
                except Exception:
                    ser = None
                    with _state_lock:
                        state['connected'] = False
                    time.sleep(3)
                    continue
            else:
                with _state_lock:
                    state['connected'] = False
                time.sleep(3)
                continue
        try:
            line = ser.readline().decode(errors='ignore').strip()
            if line:
                parsed = _parse(line)
                with _state_lock:
                    state.update(parsed)
        except Exception:
            try:
                ser.close()
            except Exception:
                pass
            ser = None
            with _state_lock:
                state['connected'] = False
            time.sleep(3)
        time.sleep(0.1)

_thread = threading.Thread(target=_reader, daemon=True)
_thread.start()

def get_arduino_state() -> Dict[str, Any]:
    with _state_lock:
        return state.copy()

if __name__ == '__main__':
    try:
        while True:
            print(get_arduino_state())
            time.sleep(2)
    except KeyboardInterrupt:
        sys.exit(0)
