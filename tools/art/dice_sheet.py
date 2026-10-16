"""Packs the dice frames (rendered at 2×, downscaled for smooth edges): tumble sprite sheet (6×6) + resting faces, as WebP.
   python3 dice_sheet.py <frames> <dst> [size]"""
import os, sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
S = int(sys.argv[3]) if len(sys.argv) > 3 else 256
load = lambda f: Image.open(os.path.join(src, f)).convert('RGBA').resize((S, S), Image.LANCZOS)
os.makedirs(dst, exist_ok=True)
frames = sorted(f for f in os.listdir(src) if f.startswith('tumble-'))
rows = (len(frames) + 5) // 6
sheet = Image.new('RGBA', (S * 6, S * rows), (0, 0, 0, 0))
for i, f in enumerate(frames):
    sheet.paste(load(f), ((i % 6) * S, (i // 6) * S))
sheet.save(os.path.join(dst, 'dice3d-tumble.webp'), 'WEBP', quality=88, method=6)
for n in range(1, 7):
    load(f'rest-{n}.png').save(os.path.join(dst, f'dice3d-{n}.webp'), 'WEBP', quality=90, method=6)
print('dice sheet', S * 6, 'x', S * rows)
