#!/usr/bin/env python3
"""Copy the website's data snapshot into the native mini program."""
from pathlib import Path
import json

root = Path(__file__).resolve().parent.parent
source = root / "docs" / "data.json"
target = root / "miniprogram" / "data" / "models.js"
raw = source.read_text(encoding="utf-8")
json.loads(raw)
target.write_text("module.exports = " + raw.rstrip() + ";\n", encoding="utf-8")
print(f"Updated {target.relative_to(root)} from {source.relative_to(root)}")
