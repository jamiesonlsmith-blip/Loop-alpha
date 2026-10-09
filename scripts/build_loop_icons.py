"""Build polished Loop home-screen icons from the approved source artwork.

The committed JPEG is a compact transport master of the approved Loop design;
output PNGs are generated for Android/iOS/PWA sizing. Never redraw the rings.
"""
import base64
import io
from pathlib import Path
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT / 'icons' / 'loop-approved-source.b64'
DEST=ROOT / 'icons'
SRC=Image.open(io.BytesIO(base64.b64decode(''.join(SOURCE.read_text().split())))).convert('RGB')
RESAMPLE=Image.Resampling.LANCZOS

def rounded_source(size):
    image=SRC.resize((size,size),RESAMPLE).convert('RGBA')
    # The approved artwork contains white outside its rounded green tile.
    # Keep the gold interlocking rings intact but remove the exterior white
    # so the Android launcher, not the JPEG, supplies the outer shape.
    mask=Image.new('L',(size,size),0)
    pen=ImageDraw.Draw(mask)
    # Match the source tile corner radius without clipping the yellow mark.
    pen.rounded_rectangle((0,0,size-1,size-1),radius=round(size*.155),fill=255)
    canvas=Image.new('RGBA',(size,size),(4,84,52,255))
    canvas.paste(image,(0,0),mask)
    return canvas

def save(size,name):
    image=rounded_source(size)
    image.save(DEST/name,format='PNG',optimize=True)

for px,name in [(180,'icon-180.png'),(192,'icon-192.png'),(512,'icon-512.png')]:
    save(px,name)

# Adaptive Android icon mask can shrink the visible region to a central 66%.
# Give the symbol breathing room, with green artwork behind the mask edge.
background=Image.new('RGBA',(512,512),(3,91,58,255))
master=rounded_source(384)
background.alpha_composite(master,((512-384)//2,(512-384)//2))
background.save(DEST/'icon-maskable-512.png',format='PNG',optimize=True)
for name in ['icon-180.png','icon-192.png','icon-512.png','icon-maskable-512.png']:
    x=Image.open(DEST/name);assert x.mode=='RGBA';assert x.size[0]==int(name.split('-')[-1].split('.')[0])
    print(name, x.size)
