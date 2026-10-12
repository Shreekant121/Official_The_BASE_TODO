# Tile preview stills into a labelled contact sheet: python3 scripts/sheet.py out/sheet.jpg out/stills/*.jpg
import sys
from PIL import Image, ImageDraw
out, files = sys.argv[1], sorted(sys.argv[2:], key=lambda f: float(f.split('/t')[-1][:-4]))
ims = [Image.open(f) for f in files]
w, h = ims[0].size
cols = 2
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows), 'black')
for i, (f, im) in enumerate(zip(files, ims)):
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(im, (x, y))
    d = ImageDraw.Draw(sheet)
    d.rectangle([x, y, x + 110, y + 26], fill='black')
    d.text((x + 6, y + 6), f.split('/t')[-1][:-4] + 's', fill='yellow')
sheet.save(out, quality=80)
