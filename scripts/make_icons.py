"""Generate favicon and PWA icons from public/UpscaleX.png.

Desktop / taskbar icons keep transparency (like UpscaleX.png).
Mobile install icons (apple-touch, maskable) keep an opaque white backdrop.
"""
import os
import shutil
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
SRC = os.path.join(ROOT, "UpscaleX.png")
LOGIN_COPY = os.path.join(ROOT, "Upscale.png")
ICONS = os.path.join(ROOT, "icons")
# White backdrop when flattening transparent PNGs for mobile install icons.
ICON_BG = (255, 255, 255, 255)

os.makedirs(ICONS, exist_ok=True)


def resize_square(src: Image.Image, size: int) -> Image.Image:
    return src.resize((size, size), Image.Resampling.LANCZOS)


def flatten(src: Image.Image, size: int, bg=ICON_BG) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    scaled = resize_square(src, size)
    canvas.alpha_composite(scaled)
    return canvas.convert("RGB")


def transparent(src: Image.Image, size: int) -> Image.Image:
    """Keep alpha so desktop / taskbar icons have no white box."""
    return resize_square(src, size)


def maskable(src: Image.Image, size: int, bg=ICON_BG) -> Image.Image:
    """Scale to ~82% safe zone for Android maskable icons."""
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * 0.82)
    scaled = resize_square(src, inner)
    offset = ((size - inner) // 2, (size - inner) // 2)
    canvas.paste(scaled, offset, scaled)
    return canvas.convert("RGB")


def main() -> None:
    if not os.path.isfile(SRC):
        raise SystemExit(f"Missing source icon: {SRC}")

    src = Image.open(SRC).convert("RGBA")
    shutil.copy2(SRC, LOGIN_COPY)

    # Favicon: Google Search wants a multiple of 48px (48x48 minimum).
    transparent(src, 48).save(os.path.join(ROOT, "favicon.png"))
    # Mobile home-screen / iOS: opaque white backdrop.
    flatten(src, 180).save(os.path.join(ROOT, "apple-touch-icon.png"))
    # Desktop / taskbar / browser "any" purpose: transparent like UpscaleX.
    transparent(src, 192).save(os.path.join(ICONS, "icon-192.png"))
    transparent(src, 512).save(os.path.join(ICONS, "icon-512.png"))
    # Android maskable: opaque safe-zone canvas.
    maskable(src, 512).save(os.path.join(ICONS, "icon-512-maskable.png"))

    print("Icons written from", os.path.abspath(SRC))
    print("Login copy:", os.path.abspath(LOGIN_COPY))


if __name__ == "__main__":
    main()
