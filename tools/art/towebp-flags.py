"""towebp-flags.py srcdir dstdir — the flag PNGs (tools/art/flags.mjs) as small WebP files."""
import os
import sys

from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
quality = int(os.environ.get('FLAG_Q', '82'))
total = 0
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'):
        continue
    im = Image.open(os.path.join(src, f)).convert('RGBA')
    # keep the alpha channel only where the flag isn't a full rectangle (Nepal)
    if im.getchannel('A').getextrema()[0] == 255:
        im = im.convert('RGB')
    out = os.path.join(dst, f[:-4] + '.webp')
    im.save(out, 'WEBP', quality=quality, method=6)
    total += os.path.getsize(out)
print(dst, round(total / 1024), 'KB')
