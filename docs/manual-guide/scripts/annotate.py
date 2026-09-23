"""Annotate SIAK screenshots with red bounding boxes + pointer arrows to highlight the feature being discussed."""
import sys, os, math
from PIL import Image, ImageDraw, ImageFont

RED = (239, 68, 68)
WHITE = (255, 255, 255)

def get_font(size=28):
    for name in ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()

def annotate(path, box, label=None, out=None):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    x1, y1, x2, y2 = [max(0, min(v, w if i%2==0 else h)) for i, v in enumerate(box)]
    draw = ImageDraw.Draw(img)
    
    # Red bounding box
    draw.rectangle([x1, y1, x2, y2], outline=RED, width=5)
    
    # Arrow from above-left pointing into box
    ax, ay = max(10, x1 - 50), max(10, y1 - 50)
    draw.line([ax, ay, x1 + 10, y1 + 10], fill=RED, width=5)
    # Arrowhead
    ang = math.atan2(y1 + 10 - ay, x1 + 10 - ax)
    ah = 16
    p1 = (x1 + 10 - ah * math.cos(ang - 0.4), y1 + 10 - ah * math.sin(ang - 0.4))
    p2 = (x1 + 10 - ah * math.cos(ang + 0.4), y1 + 10 - ah * math.sin(ang + 0.4))
    draw.polygon([(x1 + 10, y1 + 10), p1, p2], fill=RED)
    
    if label:
        f = get_font(26)
        tw = draw.textlength(label, font=f)
        cx1, cy1 = x1, max(6, y1 - 42)
        draw.rounded_rectangle([cx1, cy1, min(w - 4, cx1 + tw + 24), cy1 + 38], radius=8, fill=RED)
        draw.text((cx1 + 12, cy1 + 5), label, font=f, fill=WHITE)
    
    out = out or path
    img.save(out)
    print(f"OK: {out} ({w}x{h})")

if __name__ == "__main__":
    if len(sys.argv) >= 6:
        annotate(sys.argv[1], tuple(int(v) for v in sys.argv[2:6]),
                 sys.argv[6] if len(sys.argv) > 6 else None)
    else:
        print("Usage: annotate.py <img> <x1> <y1> <x2> <y2> [label]")
