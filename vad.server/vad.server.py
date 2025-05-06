from flask import Flask, request, jsonify
import torch
import numpy as np
import traceback
import logging

app = Flask(__name__)

# Suppress repetitive Flask logs
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

# Load Silero VAD model
model, utils = torch.hub.load('snakers4/silero-vad', 'silero_vad', trust_repo=True)
(get_speech_timestamps, _, _, _, _) = utils

@app.route('/vad', methods=['POST'])
def vad_endpoint():
    try:
        raw_data = request.data
        audio_length = len(raw_data)
        print(f"[VAD Server] Received audio data, length: {audio_length} bytes")

        if not raw_data or audio_length < 320:
            print("[VAD Server] Audio buffer too small for VAD")
            return jsonify({"is_speech": False, "reason": "Audio buffer too small"}), 200

        waveform = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32) / 32768.0
        waveform = torch.from_numpy(waveform).unsqueeze(0)

        mean_amplitude = waveform.abs().mean().item()
        print(f"[VAD Server] Waveform mean amplitude: {mean_amplitude:.4f}")

        # Lower threshold for phone audio, set min speech/silence durations
        timestamps = get_speech_timestamps(
            waveform, model,
            sampling_rate=16000,
            threshold=0.1,  # .1 is a lower threshold for phone audio
            min_speech_duration_ms=200,
            min_silence_duration_ms=300,
            speech_pad_ms=30
        )

        if timestamps:
            print(f"[VAD Server] ✅ Speech detected: {timestamps}")
            return jsonify({"is_speech": True, "segments": timestamps}), 200
        else:
            print("[VAD Server] 🚫 No speech detected.")
            return jsonify({"is_speech": False, "segments": []}), 200

    except Exception as e:
        print('[VAD Server] ❌ Exception occurred:', e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("[VAD Server] 🚀 Starting server on port 8001...")
    app.run(port=8001)
