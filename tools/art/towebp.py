import sys, os
from PIL import Image
# towebp.py srcdir dstdir size [prefix-to-strip]
src, dst, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
strip = sys.argv[4] if len(sys.argv) > 4 else ''
os.makedirs(dst, exist_ok=True)
tot = 0
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'): continue
    im = Image.open(os.path.join(src, f)).convert('RGBA')
    if size and im.width != size:
        im = im.resize((size, round(im.height * size / im.width)), Image.LANCZOS)
    name = f[:-4]
    if strip and name.startswith(strip): name = name[len(strip):]
    out = os.path.join(dst, name + '.webp')
    im.save(out, 'WEBP', quality=90, method=6)
    tot += os.path.getsize(out)
print(dst, round(tot / 1024), 'KB')
