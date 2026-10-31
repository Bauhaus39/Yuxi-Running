"""Bundle the Canvas game into one self-contained HTML file."""
from pathlib import Path
import base64
import json

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent

def data_url(path: Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")

html = (BASE / "index.html").read_text(encoding="utf-8")
css = (BASE / "style.css").read_text(encoding="utf-8")
js = (BASE / "game.js").read_text(encoding="utf-8")

assets = {
    "hero": data_url(BASE / "assets/game/hero_head.png", "image/png"),
    "chaser": data_url(BASE / "assets/game/chaser_sheet.png", "image/png"),
    "poster": data_url(BASE / "assets/game/chaser_photo.jpg", "image/jpeg"),
    "cutout": data_url(BASE / "assets/game/chaser_cutout.png", "image/png"),
}

if "</script" in js.lower():
    raise SystemExit("game.js contains a </script> sequence; cannot inline safely")

html = html.replace(
    '<link rel="stylesheet" href="style.css">',
    "<style>\n" + css + "\n</style>",
)
bundle = (
    "<script>\nwindow.__YUXI_ASSETS = "
    + json.dumps(assets, ensure_ascii=False)
    + ";\n</script>\n<script>\n"
    + js
    + "\n</script>"
)
html = html.replace('<script src="game.js"></script>', bundle)

out = ROOT / "玉玺快跑.html"
out.write_text(html, encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size / 1024 / 1024:.2f} MB)")
