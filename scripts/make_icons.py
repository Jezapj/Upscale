"""Generate Upscale PWA icons: a glossy sky-blue squircle with a white peak."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def make_icon(size, maskable=False):
    top = (155, 227, 255)      # #9be3ff
    bottom = (58, 142, 240)    # #3a8ef0

    # Vertical gradient background.
    bg = Image.new("RGB", (size, size), bottom)
    px = bg.load()
    for y in range(size):
        c = lerp(top, bottom, y / size)
        for x in range(size):
            px[x, y] = c

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Safe area: maskable icons need ~20% padding so nothing is clipped.
    pad = int(size * 0.12) if maskable else 0
    inner = size - pad * 2
    radius = int(inner * 0.30)
    mask = rounded_mask(inner, radius)
    bg_inner = bg.resize((inner, inner))
    img.paste(bg_inner, (pad, pad), mask)

    draw = ImageDraw.Draw(img)

    # Glossy top highlight.
    gloss = Image.new("RGBA", (inner, inner), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gloss)
    gd.rounded_rectangle([0, 0, inner - 1, int(inner * 0.5)],
                         radius=radius, fill=(255, 255, 255, 46))
    img.paste(gloss, (pad, pad), gloss)

    # White mountain peak.
    cx = pad
    s = inner
    peak = [
        (cx + s * 0.22, pad + s * 0.74),
        (cx + s * 0.46, pad + s * 0.36),
        (cx + s * 0.60, pad + s * 0.56),
        (cx + s * 0.70, pad + s * 0.44),
        (cx + s * 0.82, pad + s * 0.74),
    ]
    draw.polygon(peak, fill=(255, 255, 255, 255))

    # Little sun.
    r = s * 0.06
    sun = (cx + s * 0.70, pad + s * 0.30)
    draw.ellipse([sun[0] - r, sun[1] - r, sun[0] + r, sun[1] + r],
                 fill=(255, 243, 176, 255))

    return img


make_icon(192).save(os.path.join(OUT, "icon-192.png"))
make_icon(512).save(os.path.join(OUT, "icon-512.png"))
make_icon(512, maskable=True).save(os.path.join(OUT, "icon-512-maskable.png"))
# Apple touch icon (no transparency, lives at public root).
apple = make_icon(180)
flat = Image.new("RGB", apple.size, (238, 246, 251))
flat.paste(apple, (0, 0), apple)
flat.save(os.path.join(os.path.dirname(__file__), "..", "public", "apple-touch-icon.png"))
print("icons written to", os.path.abspath(OUT))
