"""Composes the app icon / splash files from the rendered brand layers.
   python3 brand.py <rendered-dir> <assets/images-dir>
Rendered layers (from brand.mjs): icon-bg, icon-fg, icon-fg-big, splash."""
import os, sys
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
L = lambda n: Image.open(os.path.join(src, f'{n}.png')).convert('RGBA')
bg, fg, big, splash = L('icon-bg'), L('icon-fg'), L('icon-fg-big'), L('splash')

full = bg.copy(); full.alpha_composite(big)
full.convert('RGB').save(os.path.join(dst, 'icon.png'), optimize=True)           # iOS / legacy / store (no transparency)
fg.save(os.path.join(dst, 'android-icon-foreground.png'), optimize=True)
bg.convert('RGB').save(os.path.join(dst, 'android-icon-background.png'), optimize=True)
splash.save(os.path.join(dst, 'splash-icon.png'), optimize=True)
full.resize((48, 48), Image.LANCZOS).save(os.path.join(dst, 'favicon.png'), optimize=True)

# Android 13+ themed icon: light shapes of the foreground as a single-colour glyph
px = fg.load(); W, H = fg.size
mono = Image.new('RGBA', (W, H), (0, 0, 0, 0)); mp = mono.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        if a >= 128 and (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62:
            mp[x, y] = (255, 255, 255, 255)
mono.filter(ImageFilter.MedianFilter(3)).save(os.path.join(dst, 'android-icon-monochrome.png'), optimize=True)
print('brand assets written to', dst)
