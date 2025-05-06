# whisper_server.py  – minimal streaming STT (WebSocket)
import asyncio, json, websockets
from faster_whisper import WhisperModel

MODEL = WhisperModel("large-v3", device="cuda", compute_type="float16")
print("Whisper large-v3 loaded ✔")

async def handler(ws):
    pcm_buf = bytearray()
    while True:
        try:
            data = await ws.recv()
        except websockets.ConnectionClosed:
            break
        if isinstance(data, bytes):
            pcm_buf += data
            # flush every 1 s (8 kB of µ-law ≈ 1 s)
            if len(pcm_buf) >= 8000:
                segments, _ = MODEL.transcribe(bytes(pcm_buf), language="en", beam_size=1)
                text = "".join(seg.text for seg in segments).strip()
                if text:
                    await ws.send(json.dumps({"is_final": True, "text": text}))
                pcm_buf.clear()

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8000):
        print("STT WebSocket listening on ws://0.0.0.0:8000")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
