"""
generate-labels-2x4-3-4ths.py

Generates 12 individual print-ready PDFs at Avery WePrint size 2/3" x 1-3/4"
(0.667" x 1.75") with 1/16" bleed on all sides.

Output: avery-pdfs-1.75x0.667/<sku>-color-label.pdf  (one PDF per SKU)

These are the upload files for the Avery WePrint reorder after the 2"x4-3/4"
labels arrived too big for the 3 mL vials (2026-05-09).

Run:  python generate-labels-2x4-3-4ths.py
"""

from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.units import inch

LABELS_DIR = Path(__file__).resolve().parent
OUT_DIR = LABELS_DIR / "avery-pdfs-1.75x0.667"
OUT_DIR.mkdir(exist_ok=True)

# Trim size + bleed
TRIM_W = 1.75 * inch
TRIM_H = 0.667 * inch
BLEED = (1.0 / 16.0) * inch
PAGE_W = TRIM_W + 2 * BLEED
PAGE_H = TRIM_H + 2 * BLEED

# Colors (matches existing color-label palette)
BG = HexColor("#0D1B2A")        # dark navy
ACCENT = HexColor("#00B4D8")    # cyan
ACCENT_DEEP = HexColor("#0077B6")
TEXT = HexColor("#FFFFFF")
TEXT_DIM = HexColor("#90CAF9")
TEXT_MUTED = HexColor("#7BA3C4")
RUO_RED = HexColor("#FF4D6D")
RUO_PINK = HexColor("#FF8FA3")

PEPTIDES = [
    {"file": "glp-3-10mg",       "name": "GLP-3",       "desc": "Triple Agonist Peptide",          "dosage": "10 mg",  "sku": "OP-GLP3-10MG"},
    {"file": "glp-3-20mg",       "name": "GLP-3",       "desc": "Triple Agonist Peptide",          "dosage": "20 mg",  "sku": "OP-GLP3-20MG"},
    {"file": "bpc-157-5mg",      "name": "BPC-157",     "desc": "Body Protection Compound",        "dosage": "5 mg",   "sku": "OP-BPC-5MG"},
    {"file": "bpc-157-10mg",     "name": "BPC-157",     "desc": "Body Protection Compound",        "dosage": "10 mg",  "sku": "OP-BPC-10MG"},
    {"file": "tb-500-5mg",       "name": "TB-500",      "desc": "Thymosin Beta-4 Fragment",        "dosage": "5 mg",   "sku": "OP-TB500-5MG"},
    {"file": "tb-500-10mg",      "name": "TB-500",      "desc": "Thymosin Beta-4 Fragment",        "dosage": "10 mg",  "sku": "OP-TB500-10MG"},
    {"file": "combo-bpc-tb-ghk", "name": "BPC+TB+GHK",  "desc": "Triple Peptide Stack",            "dosage": "70 mg",  "sku": "OP-COMBO-70MG"},
    {"file": "ipamorelin-5mg",   "name": "Ipamorelin",  "desc": "GH Secretagogue",                 "dosage": "5 mg",   "sku": "OP-IPA-5MG"},
    {"file": "hgh-191aa-10iu",   "name": "HGH 191AA",   "desc": "Somatropin 191AA",                "dosage": "10 IU",  "sku": "OP-HGH-10IU"},
    {"file": "mt2-5mg",          "name": "MT-2",        "desc": "Melanotan II",                    "dosage": "5 mg",   "sku": "OP-MT2-5MG"},
    {"file": "motsc-10mg",       "name": "MOTS-C",      "desc": "Mitochondrial-Derived Peptide",   "dosage": "10 mg",  "sku": "OP-MOTSC-10MG"},
    {"file": "nad-500mg",        "name": "NAD+",        "desc": "Nicotinamide Adenine Dinucleotide","dosage": "500 mg", "sku": "OP-NAD-500MG"},
]

VIAL = "3 mL vial"


def draw_mandala(c, cx, cy, scale=1.0):
    """Hexagonal mandala icon (matches existing color label)."""
    s = scale
    # Outer hexagon
    c.setStrokeColor(ACCENT)
    c.setLineWidth(0.5 * s)
    c.setStrokeAlpha(0.30)
    pts_outer = [(0, -10*s), (8.7*s, -5*s), (8.7*s, 5*s), (0, 10*s), (-8.7*s, 5*s), (-8.7*s, -5*s)]
    p = c.beginPath()
    p.moveTo(cx + pts_outer[0][0], cy + pts_outer[0][1])
    for x, y in pts_outer[1:]:
        p.lineTo(cx + x, cy + y)
    p.close()
    c.drawPath(p, stroke=1, fill=0)
    # Mid hexagon
    c.setStrokeAlpha(0.55)
    pts_mid = [(0, -6.5*s), (5.6*s, -3.25*s), (5.6*s, 3.25*s), (0, 6.5*s), (-5.6*s, 3.25*s), (-5.6*s, -3.25*s)]
    p = c.beginPath()
    p.moveTo(cx + pts_mid[0][0], cy + pts_mid[0][1])
    for x, y in pts_mid[1:]:
        p.lineTo(cx + x, cy + y)
    p.close()
    c.drawPath(p, stroke=1, fill=0)
    # Inner hexagon
    c.setStrokeAlpha(0.85)
    c.setLineWidth(0.7 * s)
    pts_in = [(0, -3.5*s), (3.0*s, -1.75*s), (3.0*s, 1.75*s), (0, 3.5*s), (-3.0*s, 1.75*s), (-3.0*s, -1.75*s)]
    p = c.beginPath()
    p.moveTo(cx + pts_in[0][0], cy + pts_in[0][1])
    for x, y in pts_in[1:]:
        p.lineTo(cx + x, cy + y)
    p.close()
    c.drawPath(p, stroke=1, fill=0)
    # Center dot
    c.setStrokeAlpha(1.0)
    c.setFillColor(ACCENT)
    c.circle(cx, cy, 1.2 * s, stroke=0, fill=1)
    c.setFillColor(BG)
    c.circle(cx, cy, 0.6 * s, stroke=0, fill=1)


def draw_label(c, p):
    """Render a single label at (0,0). Bleed already applied via page size."""
    # Draw at offset = bleed so trim area starts at (BLEED, BLEED)
    ox = BLEED
    oy = BLEED

    # Background extends to full bleed (so trim doesn't show paper)
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    # Inner border (inside trim)
    c.setStrokeColor(ACCENT)
    c.setLineWidth(0.4)
    c.setStrokeAlpha(0.4)
    c.roundRect(ox + 1.5, oy + 1.5, TRIM_W - 3, TRIM_H - 3, 2, stroke=1, fill=0)
    c.setStrokeAlpha(1.0)

    # Layout: left logo block (0.45in wide) | right info block
    LOGO_W = 0.40 * inch
    DIV_X = ox + LOGO_W

    # Left divider
    c.setStrokeColor(ACCENT)
    c.setLineWidth(0.3)
    c.setStrokeAlpha(0.25)
    c.line(DIV_X, oy + 0.04 * inch, DIV_X, oy + TRIM_H - 0.04 * inch)
    c.setStrokeAlpha(1.0)

    # Mandala logo (centered in left block, upper portion)
    cx = ox + LOGO_W / 2
    cy = oy + TRIM_H * 0.62
    draw_mandala(c, cx, cy, scale=1.0)

    # Brand text (under logo, in left block)
    c.setFillColor(TEXT)
    c.setFont("Helvetica-Bold", 4.5)
    text = "OPTIMIZED"
    tw = c.stringWidth(text, "Helvetica-Bold", 4.5)
    c.drawString(cx - tw/2, oy + TRIM_H * 0.32, text)
    c.setFillColor(TEXT_DIM)
    c.setFont("Helvetica", 3.3)
    text2 = "PERFORMANCE"
    tw2 = c.stringWidth(text2, "Helvetica", 3.3)
    c.drawString(cx - tw2/2, oy + TRIM_H * 0.22, text2)
    text3 = "PEPTIDES"
    tw3 = c.stringWidth(text3, "Helvetica", 3.3)
    c.drawString(cx - tw3/2, oy + TRIM_H * 0.13, text3)

    # Right info block
    rx = DIV_X + 0.04 * inch  # right block left edge with small gap

    # Product name (top of right block) — baseline computed so text top has
    # ~0.05" breathing room from the trim edge.
    name = p["name"]
    name_size = 10.5 if len(name) > 10 else 12 if len(name) > 7 else 14
    # Approx ascent of Helvetica = 0.74 * font_size
    ascent = 0.74 * name_size
    top_margin = 0.06 * inch
    name_y = oy + TRIM_H - top_margin - ascent
    c.setFillColor(TEXT)
    c.setFont("Helvetica-Bold", name_size)
    c.drawString(rx, name_y, name)

    # Cyan accent line under name
    c.setStrokeColor(ACCENT)
    c.setLineWidth(0.5)
    c.setStrokeAlpha(0.6)
    accent_y = name_y - 0.025 * inch
    c.line(rx, accent_y, rx + 1.05 * inch, accent_y)
    c.setStrokeAlpha(1.0)

    # Descriptor
    desc_y = accent_y - 0.075 * inch
    c.setFillColor(TEXT_DIM)
    c.setFont("Helvetica", 4.2)
    c.drawString(rx, desc_y, p["desc"])

    # Dosage
    dosage_y = desc_y - 0.075 * inch
    c.setFillColor(ACCENT)
    c.setFont("Helvetica-Bold", 6)
    c.drawString(rx, dosage_y, p["dosage"])

    # Form factor
    c.setFillColor(TEXT_MUTED)
    c.setFont("Helvetica", 4)
    dosage_w = c.stringWidth(p["dosage"], "Helvetica-Bold", 6)
    c.drawString(rx + dosage_w + 4, dosage_y, "Lyophilized Powder")

    # Storage line
    c.setFillColor(TEXT_MUTED)
    c.setFont("Helvetica", 4)
    storage_y = dosage_y - 0.07 * inch
    c.drawString(rx, storage_y, "Purity per COA  |  Store at -20°C")

    # Divider before RUO
    c.setStrokeColor(ACCENT)
    c.setLineWidth(0.25)
    c.setStrokeAlpha(0.2)
    ruo_div_y = storage_y - 0.035 * inch
    c.line(rx, ruo_div_y, ox + TRIM_W - 0.05 * inch, ruo_div_y)
    c.setStrokeAlpha(1.0)

    # RUO header
    c.setFillColor(RUO_RED)
    c.setFont("Helvetica-Bold", 4.6)
    ruo_y = ruo_div_y - 0.06 * inch
    c.drawString(rx, ruo_y, "FOR RESEARCH USE ONLY")

    # RUO sub-disclaimer (last element on label — SKU/lot/COA on separate sticker)
    c.setFillColor(RUO_PINK)
    c.setFont("Helvetica", 3.2)
    c.drawString(rx, ruo_y - 0.05 * inch, "Not for human consumption. Not a drug, food, or cosmetic.")


def main():
    print(f"Generating {len(PEPTIDES)} labels at {TRIM_W/inch:.4f}\" x {TRIM_H/inch:.4f}\" + 1/16\" bleed")
    print(f"Page size (with bleed): {PAGE_W/inch:.4f}\" x {PAGE_H/inch:.4f}\"")
    print(f"Output dir: {OUT_DIR}")
    print()
    for p in PEPTIDES:
        out = OUT_DIR / f"{p['file']}-color-label.pdf"
        c = canvas.Canvas(str(out), pagesize=(PAGE_W, PAGE_H))
        draw_label(c, p)
        c.showPage()
        c.save()
        size_kb = out.stat().st_size / 1024
        print(f"  {p['file']:24s} -> {out.name} ({size_kb:.0f} KB)")
    print()
    print(f"Done. {len(PEPTIDES)} files in {OUT_DIR}")


if __name__ == "__main__":
    main()
