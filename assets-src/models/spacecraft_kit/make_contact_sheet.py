#!/usr/bin/env python3
"""Contact sheet of every part (hero renders from render_kit.py).
    python3 make_contact_sheet.py <kit_dir> <render_dir> <out.png> [cols] [tile_px] [only ids...]"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

kit, rd, out = sys.argv[1], sys.argv[2], sys.argv[3]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 7
tile = int(sys.argv[5]) if len(sys.argv) > 5 else 300
only = sys.argv[6:]
parts = [p for p in json.load(open(os.path.join(kit, "parts.json")))["parts"] if not only or p["id"] in only]
rows = (len(parts) + cols - 1) // cols
th = int(tile * 0.75)
lab = 40
W, H = cols * tile, rows * (th + lab) + 50
sheet = Image.new("RGB", (W, H), (24, 26, 31))
d = ImageDraw.Draw(sheet)
try:
    f1 = ImageFont.truetype("DejaVuSans-Bold.ttf", 13)
    f2 = ImageFont.truetype("DejaVuSans.ttf", 11)
    f0 = ImageFont.truetype("DejaVuSans-Bold.ttf", 20)
except OSError:
    f0 = f1 = f2 = ImageFont.load_default()
d.text((14, 12), f"Lunar Mapper 6U kit - {len(parts)} parts (real scale, metres)", fill=(235, 235, 240), font=f0)
for i, p in enumerate(parts):
    x, y = (i % cols) * tile, 50 + (i // cols) * (th + lab)
    path = os.path.join(rd, p["id"] + "_hero.png")
    if os.path.exists(path):
        im = Image.open(path).convert("RGB")
        im = im.crop((60, 45, im.width - 60, im.height - 45)).resize((tile - 6, th - 6), Image.LANCZOS)
        sheet.paste(im, (x + 3, y + 3))
    tier = {1: "T1", 2: "T2", 3: "T3"}[p["tier"]]
    d.text((x + 8, y + th + 2), f"{tier}  {p['id']}", fill=(240, 160, 70), font=f1)
    size = " x ".join(str(round(v * 1000)) for v in p["size_m"])
    d.text((x + 8, y + th + 20), f"{size} mm  {p['triangles'] / 1000:.1f}k tris", fill=(160, 165, 178), font=f2)
sheet.save(out, optimize=True)
print("wrote", out, sheet.size)
