"""
Store-listing carousel image (600x900, required by addon.json schema).
A designed graphic of the dashboard concept, not a literal browser
screenshot — matches the dark theme in public/index.html so the store
listing and the actual product look like the same thing.
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 600, 900

BG = (11, 14, 19, 255)
PANEL = (20, 25, 34, 255)
PANEL_BORDER = (35, 43, 56, 255)
TEXT = (232, 236, 242, 255)
MUTED = (139, 150, 168, 255)
GREEN = (53, 208, 127, 255)
YELLOW = (245, 196, 81, 255)
ACCENT = (91, 140, 255, 255)

FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
def font(size, bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(FONT_DIR + name, size)

img = Image.new("RGBA", (W, H), BG)
d = ImageDraw.Draw(img)

# Header — reuse the real generated icon glyph instead of an emoji
# (DejaVu Sans has no color-emoji glyph, so a raw 🏠 renders as tofu).
import os
icon_path = os.path.join(os.path.dirname(__file__), "icon-64x64.png")
header_icon = Image.open(icon_path).resize((40, 40), Image.LANCZOS)
img.paste(header_icon, (36, 36), header_icon)
d.text((88, 44), "GUARDIAN", font=font(26, bold=True), fill=TEXT)
d.rounded_rectangle([W - 190, 44, W - 36, 76], radius=16, outline=GREEN, width=2)
d.text((W - 178, 52), "Monitoring active", font=font(13), fill=GREEN)

def panel(y, h, title):
    d.rounded_rectangle([36, y, W - 36, y + h], radius=14, fill=PANEL, outline=PANEL_BORDER, width=1)
    d.text((56, y + 18), title, font=font(13, bold=True), fill=MUTED)
    return y + 50

# House status panel
y = panel(110, 220, "HOUSE STATUS")
rows = [("John — owner", "away", GREEN), ("Mary — parent", "home", GREEN), ("James — child", "away", GREEN)]
ry = y
for name, status, color in rows:
    d.ellipse([56, ry + 6, 68, ry + 18], fill=color)
    d.text((80, ry), name, font=font(16), fill=TEXT)
    d.text((W - 130, ry), status, font=font(13), fill=MUTED)
    d.line([56, ry + 40, W - 56, ry + 40], fill=PANEL_BORDER, width=1)
    ry += 56

# Active incident panel
y2 = panel(360, 280, "ACTIVE INCIDENTS")
d.rounded_rectangle([56, y2, W - 56, y2 + 190], radius=10, outline=PANEL_BORDER, width=1)
d.rounded_rectangle([76, y2 + 18, 76 + 56, y2 + 42], radius=6, fill=YELLOW)
d.text((88, y2 + 23), "ASK", font=font(12, bold=True), fill=BG)
d.text(
    (76, y2 + 54),
    "Mom hasn't responded to two\ncheck-ins this morning.",
    font=font(16), fill=TEXT, spacing=8,
)
d.text((76, y2 + 112), "Confidence: 85%", font=font(13), fill=MUTED)

def button(x, y, w, h, label, color, outline=True):
    if outline:
        d.rounded_rectangle([x, y, x + w, y + h], radius=8, outline=color, width=2)
    else:
        d.rounded_rectangle([x, y, x + w, y + h], radius=8, fill=color)
    bbox = d.textbbox((0, 0), label, font=font(14))
    tw = bbox[2] - bbox[0]
    d.text((x + (w - tw) / 2, y + 10), label, font=font(14), fill=color if outline else BG)

button(76, y2 + 142, 170, 36, "CONTACT MOM", ACCENT)
button(266, y2 + 142, 150, 36, "ESCALATE", (239, 91, 91, 255))

# Footer tagline
d.text(
    (36, 700),
    "AI that doesn't just detect\nwhat's happening.",
    font=font(22, bold=True), fill=TEXT, spacing=6,
)
d.text((36, 756), "It understands what to do next.", font=font(15), fill=MUTED)

img.convert("RGB").save("carousel-1.png")
print("wrote carousel-1.png")
