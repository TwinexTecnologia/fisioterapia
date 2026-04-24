import base64
import json
from pathlib import Path


def main() -> None:
    obj = json.loads(Path("protocol.generated.json").read_text(encoding="utf-8"))
    minified = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    b64 = base64.b64encode(minified.encode("utf-8")).decode("ascii")
    chunk = 1000
    parts = [b64[i : i + chunk] for i in range(0, len(b64), chunk)]

    out = "const EMBEDDED_PROTOCOL_B64 = [\n"
    out += "".join(f'  \"{p}\",\n' for p in parts)
    out += "].join(\"\");\n"

    Path("protocol.b64.js.txt").write_text(out, encoding="utf-8")


if __name__ == "__main__":
    main()
