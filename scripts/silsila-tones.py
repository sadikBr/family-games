"""«سلسلة الذاكرة»: the pads' six soft tones (assets/sounds/silsila-0.wav … silsila-5.wav).

Marimba-like notes of the C major pentatonic scale: a sine fundamental with a little of the 4th partial
(a marimba bar's overtone) and a touch of the octave, a 6 ms attack and a smooth exponential decay.
22050 Hz mono 16-bit, like the app's other sounds. Pads 0–3 are a bright major chord (the 4-pad board);
pads 4 and 5 fill the scale in between for the 6-pad board.

Run: python3 scripts/silsila-tones.py
"""
import math
import os
import struct
import wave

RATE = 22050
DUR = 0.55
# pad → frequency (Hz): C5, E5, G5, C6, then D5, A5
NOTES = [523.25, 659.26, 783.99, 1046.50, 587.33, 880.00]
PEAK = 0.56

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sounds')

for i, f in enumerate(NOTES):
    n = int(RATE * DUR)
    frames = bytearray()
    for k in range(n):
        t = k / RATE
        attack = min(1.0, t / 0.006)
        body = math.exp(-t / 0.16)
        bright = math.exp(-t / 0.035)
        # a short fade at the very end so the file never clicks
        tail = min(1.0, (DUR - t) / 0.04)
        v = math.sin(2 * math.pi * f * t) + 0.18 * bright * math.sin(2 * math.pi * f * 3.93 * t) + 0.12 * body * math.sin(2 * math.pi * f * 2 * t)
        s = PEAK * attack * body * tail * v / 1.3
        frames += struct.pack('<h', int(max(-1.0, min(1.0, s)) * 32767))
    with wave.open(os.path.join(out, f'silsila-{i}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))
    print(f'silsila-{i}.wav  {f:.2f} Hz')
