from PIL import Image
import os

base = r"C:\Users\ratih\source\repos\Siak\docs\manual-guide\screenshots_new"
for root, dirs, files in os.walk(base):
    for f in files:
        if f.endswith(".png"):
            path = os.path.join(root, f)
            im = Image.open(path)
            sz = os.path.getsize(path)
            print(f"{path}: {im.width}x{im.height} ({sz} bytes)")
