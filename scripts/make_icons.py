"""Generate favicon and PWA icons from public/UpscaleX.png."""
import os
import shutil
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
SRC = os.path.join(ROOT, "UpscaleX.png")
LOGIN_COPY = os.path.join(ROOT, "Upscale.png")
ICONS = os.path.join(ROOT, "icons")
# Matches the logo’s dark backdrop when flattening transparent PNGs.
FLAT_BG = (5, 5, 8, 255)

os.makedirs(ICONS, exist_ok=True)


def resize_square(src: Image.Image, size: int) -> Image.Image:
    return src.resize((size, size), Image.Resampling.LANCZOS)


def flatten(src: Image.Image, size: int, bg=FLAT_BG) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    scaled = resize_square(src, size)
    canvas.alpha_composite(scaled)
    return canvas.convert("RGB")


def maskable(src: Image.Image, size: int, bg=FLAT_BG) -> Image.Image:
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

    # Favicon keeps alpha for crisp edges on varied browser chrome.
    resize_square(src, 32).save(os.path.join(ROOT, "favicon.png"))
    flatten(src, 180).save(os.path.join(ROOT, "apple-touch-icon.png"))
    flatten(src, 192).save(os.path.join(ICONS, "icon-192.png"))
    flatten(src, 512).save(os.path.join(ICONS, "icon-512.png"))
    maskable(src, 512).save(os.path.join(ICONS, "icon-512-maskable.png"))

    print("Icons written from", os.path.abspath(SRC))
    print("Login copy:", os.path.abspath(LOGIN_COPY))


if __name__ == "__main__":
    main()
