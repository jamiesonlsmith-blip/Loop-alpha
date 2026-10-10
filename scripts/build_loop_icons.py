"""Build full-bleed Loop launcher PNGs from the user-approved ring artwork.

The source is an approved WebP master. Preserve the gold interlocking rings,
but eliminate the source's outer white canvas and glass-like framing.
"""
import base64
import io
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
SOURCE = ICONS / "loop-approved-source.b64"
SRC = Image.open(io.BytesIO(base64.b64decode("".join(SOURCE.read_text().split())))).convert("RGB")
assert SRC.width == SRC.height, "Loop artwork must be square"
RESAMPLE = Image.Resampling.LANCZOS

# A coherent, full-bleed green field. No baked-in rounded rectangle or white
# padding: Android/iOS launchers apply their own platform icon mask.
TOP_LEFT = (16, 141, 74)
TOP_RIGHT = (1, 112, 60)
BOTTOM_LEFT = (2, 75, 39)
BOTTOM_RIGHT = (1, 55, 32)


def green_background(size):
    canvas = Image.new("RGB", (size, size))
    pixels = canvas.load()
    scale = max(size - 1, 1)
    for y in range(size):
        fy = y / scale
        for x in range(size):
            fx = x / scale
            pixels[x, y] = tuple(
                round(
                    TOP_LEFT[k] * (1 - fx) * (1 - fy)
                    + TOP_RIGHT[k] * fx * (1 - fy)
                    + BOTTOM_LEFT[k] * (1 - fx) * fy
                    + BOTTOM_RIGHT[k] * fx * fy
                )
                for k in range(3)
            )
    return canvas


def clean_original():
    n = SRC.width
    color = SRC.load()
    alpha = Image.new("L", (n, n), 0)
    mask = alpha.load()
    for y in range(n):
        for x in range(n):
            red, green, blue = color[x, y]
            edge = min(x, y, n - 1 - x, n - 1 - y)
            # Feather green background into the original away from the edge.
            # This eliminates the bright rim and square-within-a-square look.
            blend = min(1.0, max(0.0, (edge - 2) / (57 * n / 192)))
            blend = blend * blend * (3 - 2 * blend)
            # Retain every part of the approved gold speech bubbles, even tails.
            gold = (
                red > 115 and red > green * 0.78
                and red > blue * 1.10 and green > blue * 0.9
                and edge > 16 * n / 192
            )
            if gold:
                blend = 1
            # Strip remaining light pixels belonging to the old outer canvas.
            if (
                not gold and edge < 36 * n / 192
                and red > 160 and green > 180 and blue > 170
            ):
                blend = 0
            mask[x, y] = round(255 * blend)
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7 * n / 192))
    return Image.composite(SRC, green_background(n), alpha)


CLEAN = clean_original()


def save_standard(size, name):
    CLEAN.resize((size, size), RESAMPLE).convert("RGBA").save(
        ICONS / name, format="PNG", optimize=True
    )


for size, name in [
    (180, "icon-180.png"),
    (192, "icon-192.png"),
    (512, "icon-512.png"),
]:
    save_standard(size, name)

# Android adaptive icons mask the outer third on certain launchers. Draw only
# the gold rings in the central safe region over a CONTINUOUS green background,
# not an embedded mini-square carrying its own white/bright border.
n = CLEAN.width
gold_mask = Image.new("L", (n, n), 0)
p = CLEAN.load()
m = gold_mask.load()
for y in range(n):
    for x in range(n):
        red, green, blue = p[x, y]
        if red > 100 and red > green * 0.79 and red > blue * 1.11 and green > blue * 0.95:
            opacity = max(0, min(255, int((red - 90) / 60 * 255)))
        else:
            opacity = 0
        m[x, y] = opacity

gold_mask = gold_mask.filter(ImageFilter.GaussianBlur(0.65 * n / 192))
adaptive = green_background(512)
art_size = 409  # Fit gold-ring artwork inside Android's adaptive safe circle.
position = (512 - art_size) // 2
adaptive.paste(
    CLEAN.resize((art_size, art_size), RESAMPLE),
    (position, position),
    gold_mask.resize((art_size, art_size), RESAMPLE),
)
adaptive.convert("RGBA").save(ICONS / "icon-maskable-512.png", format="PNG", optimize=True)

for size, name in [
    (180, "icon-180.png"),
    (192, "icon-192.png"),
    (512, "icon-512.png"),
    (512, "icon-maskable-512.png"),
]:
    icon = Image.open(ICONS / name)
    assert icon.size == (size, size) and icon.mode == "RGBA", name
    # No pale/white corners (or transparent framing) on any target asset.
    for corner in [(0, 0), (size - 1, 0), (0, size - 1), (size - 1, size - 1)]:
        red, green, blue, opacity = icon.getpixel(corner)
        assert opacity == 255 and green > red * 1.5 and green > blue * 1.4, (name, corner)
    print(name, icon.size, "full-bleed green edges verified")

# Android's small status-bar notification symbol is a separate asset from
# the colorful launcher/large-notification icon. A full-bleed colored square
# in the badge option becomes an unreadable solid square on Android.
# Preserve the approved interlocking rings as pure white alpha-only artwork;
# Android automatically tints monochrome notification badges.
badge_size = 96
source_mask = gold_mask.point(lambda opacity: 255 if opacity >= 70 else 0)
bounds = source_mask.getbbox()
assert bounds, "Approved Loop rings were not found in source artwork"
crop = gold_mask.crop(bounds)
inner_size = 80
scale = min(inner_size / crop.width, inner_size / crop.height)
width = round(crop.width * scale)
height = round(crop.height * scale)
alpha = crop.resize((width, height), RESAMPLE).filter(ImageFilter.MaxFilter(3))
badge = Image.new("RGBA", (badge_size, badge_size), (255, 255, 255, 0))
position = ((badge_size - width) // 2, (badge_size - height) // 2)
badge.paste((255, 255, 255, 255), (*position, position[0] + width, position[1] + height), alpha)
badge.save(ICONS / "notification-badge-96.png", format="PNG", optimize=True)
check = Image.open(ICONS / "notification-badge-96.png").convert("RGBA")
assert check.size == (96, 96)
assert all(check.getpixel(point)[3] == 0 for point in [(0, 0), (95, 0), (0, 95), (95, 95)])
coverage = sum(1 for a in check.getchannel("A").getdata() if a > 100)
assert 500 < coverage < 6000, "Notification badge needs recognizable transparent rings"
print("notification-badge-96.png", check.size, "transparent monochrome rings verified")
