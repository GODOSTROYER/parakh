"""Minimal self-check for the grounding parser: python worker/test_parse.py"""

import os

os.environ["SKIP_MODEL"] = "1"
from main import parse_grounding

SAMPLE = (
    "<|ref|>title<|/ref|><|det|>[[100, 50, 900, 120]]<|/det|>\n# Unit Test\n"
    "<|ref|>text<|/ref|><|det|>[[80, 150, 920, 300], [80, 310, 920, 400]]<|/det|>\n"
    "Ans 2. The chloroplast...\n"
    "<|ref|>image<|/ref|><|det|>[[100, 420, 500, 700]]<|/det|>\n"
)

clean, regions = parse_grounding(SAMPLE)
assert len(regions) == 4, regions  # 1 + 2 (two boxes) + 1
assert regions[0]["label"] == "title"
assert regions[0]["text"] == "# Unit Test"
assert abs(regions[0]["bbox"][0] - 100 / 999) < 1e-9
assert regions[1]["text"].startswith("Ans 2.")
assert regions[1]["bbox"] != regions[2]["bbox"]  # both boxes kept
assert "<|" not in clean and "Unit Test" in clean
print("parse_grounding OK")
