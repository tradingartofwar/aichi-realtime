# websocket/faster.stt.server.py
# ──────────────────────────────────────────────────────────────────────────────
# Streaming μ-law STT server using Faster-Whisper (CUDA) + websockets.
# Listens on ws://0.0.0.0:8002 by default.  One connection per call stream.

import asyncio, json, os, struct, wave, tempfile, audioop
import numpy as np
import websockets
from faster_whisper import WhisperModel
import torch

# ───── config ────────────────────────────────────────────────────────────────
HOST               = "0.0.0.0"
PORT               = 8002
MODEL_NAME         = "large-v3"            # whisper-large-v3 (~1 GB CT2)
DEVICE             = "cuda"                # "cuda" or "cpu"
COMPUTE_TYPE       = "float16"             # "float16" (GPU)  |  "int8_float16" (CPU)
FRAME_BYTES        = 160                   # 20 ms μ-law @ 8 kHz mono
FRAMES_PER_CHUNK   = 100                   # → 2.0 s batches; adjust to taste
LANGUAGE           = "en"                  # force language (or None for auto)

# ───── load model once at start-up ───────────────────────────────────────────
print(f"Loading Whisper {MODEL_NAME} on {DEVICE}…")
model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
print("Whisper ready ✅")

# ───── helper: μ-law bytes → float32 numpy @ 16 kHz mono ─────────────────────
def mulaw_to_f32_16k(raw_ulaw: bytes) -> np.ndarray:
    # μ-law 8 kHz → linear PCM s16 (little-endian)
    pcm8 = audioop.ulaw2lin(raw_ulaw, 2)             # 8 kHz, 16-bit
    # resample 8 kHz → 16 kHz
    pcm16, _ = audioop.ratecv(pcm8, 2, 1, 8000, 16000, None)
    # int16 → float32 in -1.0 … 1.0
    return np.frombuffer(pcm16, dtype="<i2").astype(np.float32) / 32768.0

# ───── per-socket handler ────────────────────────────────────────────────────
async def handler(ws: websockets.WebSocketServerProtocol):
    print("🆕  peer connected:", ws.remote_address)
    frame_buf = bytearray()

    async for message in ws:
        # Twilio sends raw binary frames – no JSON wrapper
        if isinstance(message, (bytes, bytearray)):
            frame_buf.extend(message)

            if len(frame_buf) >= FRAME_BYTES * FRAMES_PER_CHUNK:
                await transcribe_and_send(frame_buf, ws)
                frame_buf.clear()

        # (If you ever send control JSON from Node, handle it here)

    # flush any leftover audio
    if frame_buf:
        await transcribe_and_send(frame_buf, ws)
    print("👋  peer disconnected:", ws.remote_address)

# ───── STT + emit JSON back to caller ────────────────────────────────────────
async def transcribe_and_send(buf: bytearray, ws):
    audio_f32 = mulaw_to_f32_16k(buf)

    segments, _ = model.transcribe(
        audio_f32,
        language=LANGUAGE,
        vad_filter=True, vad_parameters=dict(min_silence_duration_ms=200))

    text = " ".join(seg.text.strip() for seg in segments).strip()
    if text:
        payload = json.dumps({"is_final": True, "text": text})
        await ws.send(payload)
        print("🔊  →", text)

# ───── main entry - start server ─────────────────────────────────────────────
async def main():
    async with websockets.serve(handler, HOST, PORT, max_size=2**20):
        print(f"🗣  STT WebSocket on ws://{HOST}:{PORT}")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    if DEVICE == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but not available.")
    asyncio.run(main())
