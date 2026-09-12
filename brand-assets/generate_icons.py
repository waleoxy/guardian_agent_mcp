"""
Generates the Guardian app icon at every size Alexa+'s addon.json
schema requires (72, 64, 88, 126, 180, 241 — light variant only; no
dark variant needed since the mark already reads fine on Alexa's dark
surfaces).

Drawn as a shield (safety) with a simple house roofline notch (the
product domain) rather than a literal photo/screenshot, since app
icons need to read clearly at 64x64. Supersampled 4x then downsampled
for clean edges at small sizes.
"""
from PIL import Image, ImageDraw
import math

BG = (11, 14, 19, 255)        # --bg
SHIELD = (91, 140, 255, 255)  # --accent
SHIELD_DARK = (46, 74, 148, 255)
NOTCH = (11, 14, 19, 255)     # cut the roofline out of the shield in bg color
DOT = (53, 208, 127, 255)     # --green, "actively watching" dot

SIZES = [72, 64, 88, 126, 180, 241]
SCALE = 4  # supersample factor

def draw_icon(size: int) -> Image.Image:
    s = size * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded-square background
    radius = s * 0.22
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=BG)

    cx, cy = s / 2, s / 2 - s * 0.02
    w, h = s * 0.46, s * 0.56

    # Shield outline: pointed bottom, rounded top corners
    top = cy - h / 2
    bottom = cy + h / 2
    left = cx - w / 2
    right = cx + w / 2
    mid_y = cy + h * 0.12

    shield_pts = [
        (left, top + h * 0.12),
        (cx, top),
        (right, top + h * 0.12),
        (right, mid_y),
        (cx, bottom),
        (left, mid_y),
    ]
    d.polygon(shield_pts, fill=SHIELD)

    # Subtle bottom-half shading for depth
    shade_pts = [
        (left, mid_y),
        (cx, bottom),
        (right, mid_y),
        (right, top + h * 0.12 + (mid_y - (top + h * 0.12)) * 0.55),
        (cx, cy),
        (left, top + h * 0.12 + (mid_y - (top + h * 0.12)) * 0.55),
    ]
    d.polygon(shade_pts, fill=SHIELD_DARK)

    # House roofline notch cut into the shield's upper third
    roof_w, roof_h = w * 0.52, h * 0.30
    roof_top_y = top + h * 0.20
    roof_pts = [
        (cx, roof_top_y),
        (cx + roof_w / 2, roof_top_y + roof_h * 0.62),
        (cx + roof_w / 2 - roof_w * 0.16, roof_top_y + roof_h * 0.62),
        (cx + roof_w / 2 - roof_w * 0.16, roof_top_y + roof_h),
        (cx - roof_w / 2 + roof_w * 0.16, roof_top_y + roof_h),
        (cx - roof_w / 2 + roof_w * 0.16, roof_top_y + roof_h * 0.62),
        (cx - roof_w / 2, roof_top_y + roof_h * 0.62),
    ]
    d.polygon(roof_pts, fill=NOTCH)

    # "Actively watching" dot, bottom-right of the shield
    dot_r = s * 0.05
    d.ellipse(
        [right - dot_r * 0.6, mid_y - dot_r * 0.6, right + dot_r * 1.4, mid_y + dot_r * 1.4],
        fill=DOT,
    )

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    import os
    out_dir = os.path.join(os.path.dirname(__file__))
    for size in SIZES:
        icon = draw_icon(size)
        path = os.path.join(out_dir, f"icon-{size}x{size}.png")
        icon.save(path)
        print(f"wrote {path}")
