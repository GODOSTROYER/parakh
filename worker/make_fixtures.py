"""Generate test fixtures: a printed question paper and a handwriting-style
answer sheet exercising the edge cases (out-of-order, unanswered, sub-parts,
multi-page answer, stray writing)."""

import os
import urllib.request

import fitz

HERE = os.path.dirname(__file__)
FIX = os.path.join(HERE, "..", "fixtures")
os.makedirs(FIX, exist_ok=True)

CAVEAT = os.path.join(FIX, "Caveat.ttf")
if not os.path.exists(CAVEAT):
    urllib.request.urlretrieve(
        "https://github.com/google/fonts/raw/main/ofl/caveat/Caveat%5Bwght%5D.ttf",
        CAVEAT,
    )

W, H = 595, 842  # A4


def qp():
    doc = fitz.open()
    page = doc.new_page(width=W, height=H)
    y = 60
    page.insert_text((150, y), "Class 10 Science - Unit Test", fontsize=16, fontname="hebo")
    y += 24
    page.insert_text((200, y), "Time: 1 hour    Max Marks: 20", fontsize=10)
    y += 40
    qs = [
        ("1.", "Which blood vessel carries blood away from the heart?", "[2]"),
        ("2.", "Which organelle is primarily involved in photosynthesis?", "[2]"),
        ("3.", "State Newton's second law of motion and give its SI unit.", "[3]"),
        ("4.", "Describe the process of transpiration in plants and name two factors that increase its rate.", "[5]"),
    ]
    for n, t, m in qs:
        page.insert_text((60, y), n, fontsize=12, fontname="hebo")
        rect = fitz.Rect(85, y - 12, 480, y + 60)
        page.insert_textbox(rect, t, fontsize=12, fontname="helv")
        page.insert_text((500, y), m, fontsize=12, fontname="hebo")
        y += 66
    page.insert_text((60, y), "5.", fontsize=12, fontname="hebo")
    page.insert_textbox(
        fitz.Rect(85, y - 12, 480, y + 40),
        "A potted plant kept in the dark for 48 hours is brought into sunlight.",
        fontsize=12,
    )
    y += 34
    page.insert_text((85, y), "(a)", fontsize=12, fontname="hebo")
    page.insert_textbox(
        fitz.Rect(115, y - 12, 480, y + 40),
        "Why did the leaves stop producing starch in the dark?",
        fontsize=12,
    )
    page.insert_text((500, y), "[3]", fontsize=12, fontname="hebo")
    y += 40
    page.insert_text((85, y), "(b)", fontsize=12, fontname="hebo")
    page.insert_textbox(
        fitz.Rect(115, y - 12, 480, y + 40),
        "Name the test used to detect starch in a leaf.",
        fontsize=12,
    )
    page.insert_text((500, y), "[2]", fontsize=12, fontname="hebo")
    y += 44
    page.insert_text((60, y), "6.", fontsize=12, fontname="hebo")
    page.insert_textbox(
        fitz.Rect(85, y - 12, 480, y + 30),
        "Define osmosis with one example.",
        fontsize=12,
    )
    page.insert_text((500, y), "[2]", fontsize=12, fontname="hebo")
    y += 30
    page.insert_text((250, y), "OR", fontsize=12, fontname="hebo")
    y += 22
    page.insert_text((60, y), "7.", fontsize=12, fontname="hebo")
    page.insert_textbox(
        fitz.Rect(85, y - 12, 480, y + 30),
        "Define diffusion with one example.",
        fontsize=12,
    )
    page.insert_text((500, y), "[2]", fontsize=12, fontname="hebo")
    y += 44
    page.insert_text((60, y), "8.", fontsize=12, fontname="hebo")
    page.insert_textbox(
        fitz.Rect(85, y - 12, 480, y + 30),
        "Draw a labelled diagram of a plant cell showing the cell wall and nucleus.",
        fontsize=12,
    )
    page.insert_text((500, y), "[3]", fontsize=12, fontname="hebo")
    doc.save(os.path.join(FIX, "sample_qp.pdf"))
    doc.close()


def hand(page, pos, text, size=15):
    page.insert_textbox(
        fitz.Rect(pos[0], pos[1], W - 50, pos[1] + 120),
        text,
        fontsize=size,
        fontname="caveat",
        fontfile=CAVEAT,
        color=(0.1, 0.1, 0.35),
    )


def answers():
    doc = fitz.open()
    p1 = doc.new_page(width=W, height=H)
    for x in [(50, 40, "Name: Aarav Sharma"), (350, 40, "Roll No: 17")]:
        hand(p1, (x[0], x[1]), x[2], 14)
    hand(p1, (50, 85), "Ans 2.  The chloroplast is the organelle involved in photosynthesis. It contains chlorophyll which absorbs light energy.")
    hand(p1, (50, 135), "Ans 1.  The artery carries blood away from the heart. The aorta is the largest artery.")
    hand(p1, (50, 180), "Ans 5 (b)  The iodine test is used. Iodine turns blue-black when starch is present.")
    hand(p1, (50, 225), "Ans 5 (a)  In the dark there is no light energy, so photosynthesis stops and no new starch is made. The stored starch gets used up by the plant.")
    hand(p1, (50, 295), "Ans 4.  Transpiration is the loss of water as water vapour from the leaves of a plant through the stomata. Water evaporates from the mesophyll cells and diffuses out.")
    hand(p1, (50, 365), "It creates a suction pull that helps water move up the xylem from the roots.")
    hand(p1, (50, 410), "Ans 6.  Osmosis is the movement of water from a dilute solution to a concentrated solution through a semi-permeable membrane. Example: raisins swell in water.")
    # stray note that matches no question
    hand(p1, (50, 480), "(remember to revise diagrams for next test!!)", 13)

    p2 = doc.new_page(width=W, height=H)
    hand(p2, (50, 60), "Ans 4 continued.  Two factors that increase the rate of transpiration are: 1. Higher temperature  2. Wind / air movement. Dry air also increases it.")
    # Q8: an actual drawn diagram (rectangle cell wall, inner membrane, nucleus)
    hand(p2, (50, 150), "Ans 8.  Diagram of a plant cell:")
    ink = (0.1, 0.1, 0.35)
    p2.draw_rect(fitz.Rect(120, 190, 380, 370), color=ink, width=1.5)
    p2.draw_rect(fitz.Rect(132, 200, 368, 360), color=ink, width=0.8)
    p2.draw_circle(fitz.Point(250, 280), 38, color=ink, width=1.2)
    p2.draw_circle(fitz.Point(250, 280), 10, color=ink, width=0.8)
    p2.draw_line(fitz.Point(120, 210), fitz.Point(70, 205), color=ink, width=0.8)
    hand(p2, (30, 195), "cell wall", 12)
    p2.draw_line(fitz.Point(288, 280), fitz.Point(420, 270), color=ink, width=0.8)
    hand(p2, (422, 262), "nucleus", 12)
    doc.save(os.path.join(FIX, "sample_answers.pdf"))
    doc.close()


qp()
answers()
print("fixtures written to", os.path.abspath(FIX))
