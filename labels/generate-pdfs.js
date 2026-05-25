// Generate Avery WePrint-ready vector PDFs from the SVG color labels.
//
// Per-format page sizing (trim + 1/16" bleed each side):
//   peptide-vial:     1.5"  x 0.75" trim -> 1.625" x 0.875" page
//   tincture-dropper: 2.25" x 1.25" trim -> 2.375" x 1.375" page
//
// Vector content, base-14 Helvetica (auto-embedded), no rasterization.

const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const fs = require('fs');
const path = require('path');

const labelsDir = __dirname;
const outDir = path.join(labelsDir, 'avery-pdfs');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

// Bleed is shared across formats — 1/16" matches Avery WePrint templates.
const BLEED = 0.0625 * 72;   // 4.5 pt

// Background colors for the bleed area (must match the SVG's outer fill).
const COLOR_NAVY = '#0D1B2A';
const COLOR_WHITE = '#FFFFFF';

const variants = [
  { suffix: 'color-label', bg: COLOR_NAVY },
];

// Each format defines its trim dimensions and the SKUs that print at that size.
// Page size is computed as trim + 2*bleed in the loop below.
const formats = [
  {
    name: 'peptide-vial',
    trimW: 1.5 * 72,   // 108 pt
    trimH: 0.75 * 72,  // 54 pt
    skus: [
      'glp-3-10mg', 'glp-3-20mg',
      'bpc-157-5mg', 'bpc-157-10mg',
      'tb-500-5mg', 'tb-500-10mg',
      'combo-bpc-tb-ghk',
      'ipamorelin-5mg',
      'hgh-191aa-10iu',
      'mt2-5mg',
      'nad-500mg',
    ],
  },
  {
    name: 'tincture-dropper',
    trimW: 2.25 * 72,  // 162 pt
    trimH: 1.25 * 72,  // 90 pt
    skus: [
      'tadalafil-20mg',
    ],
  },
];

function buildPdf(svgPath, pdfPath, bgColor, sku, variant, trimW, trimH) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const pageW = trimW + 2 * BLEED;
  const pageH = trimH + 2 * BLEED;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [pageW, pageH],
      margin: 0,
      info: {
        Title: `OPP ${sku} ${variant}`,
        Author: 'Optimized Performance Peptides',
        Producer: 'OPP Label Generator',
        Creator: 'pdfkit + svg-to-pdfkit',
      },
    });

    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // Fill the entire bleed area with the SVG's outer color so any over-cut
    // by the printer leaves a clean color edge, not white paper.
    doc.rect(0, 0, pageW, pageH).fill(bgColor);

    // Place SVG inset by the bleed amount on each side. The SVG's own outer
    // rounded rect now sits at the trim line; rounded corners cut cleanly.
    SVGtoPDF(doc, svg, BLEED, BLEED, {
      width: trimW,
      height: trimH,
      preserveAspectRatio: 'xMidYMid meet',
    });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function generate() {
  let count = 0;
  for (const fmt of formats) {
    for (const sku of fmt.skus) {
      for (const v of variants) {
        const svgPath = path.join(labelsDir, `${sku}-${v.suffix}.svg`);
        if (!fs.existsSync(svgPath)) {
          console.warn(`  skip ${sku}-${v.suffix} (no SVG)`);
          continue;
        }
        const pdfPath = path.join(outDir, `${sku}-${v.suffix}.pdf`);
        await buildPdf(svgPath, pdfPath, v.bg, sku, v.suffix, fmt.trimW, fmt.trimH);
        const trimIn = `${fmt.trimW / 72}" x ${fmt.trimH / 72}"`;
        console.log(`  ${path.basename(pdfPath)}  [${fmt.name} ${trimIn}]`);
        count++;
      }
    }
  }
  console.log(`\nDone — ${count} PDFs written to ${outDir}`);
}

generate().catch(err => { console.error(err); process.exit(1); });
