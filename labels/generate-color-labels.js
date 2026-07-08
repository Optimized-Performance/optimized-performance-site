const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const labelsDir = path.join(__dirname);

// ── Syngyn black & gold brand (2026-07 rebrand) ──────────────────────────────
// Labels are black stock with the real gold Syngyn logo (base64-embedded so
// sharp/librsvg rasterizes it) replacing the old hex-mandala + text lockup.
const C = {
  bg: '#000000',
  gold: '#F5A623',
  goldBright: '#FCD667',
  goldDeep: '#A66A12',
  white: '#FFFFFF',
  descriptor: '#C7B291', // warm tan — secondary text
  muted: '#8A8272',      // warm gray — tertiary / footer
  ruo: '#FF4D6D',
  ruoSoft: '#FF8FA3',
};

// Logo: black-bg source blends seamlessly onto the black label. Embedded once.
const LOGO_DATA_URI =
  'data:image/png;base64,' +
  fs.readFileSync(path.join(labelsDir, 'Syngynlogo.png')).toString('base64');

// Full logo placed in the brand column. w = width; height derives from the
// ~1.25:1 art (h = w * 0.8). xlink:href for max librsvg compatibility.
function logo(x, y, w) {
  const h = Math.round(w * 0.8);
  return `<image xlink:href="${LOGO_DATA_URI}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" />`;
}

const peptides = [
  { file: 'glp-1-10mg', name: 'GLP-1', desc: 'GLP-1 Receptor Agonist', dosage: '10 mg', sku: 'OP-GLP1-10MG' },
  { file: 'glp-3-10mg', name: 'GLP-RT3', desc: 'Triple Agonist Peptide', dosage: '10 mg', sku: 'OP-GLP-RT3-10MG' },
  { file: 'glp-3-20mg', name: 'GLP-RT3', desc: 'Triple Agonist Peptide', dosage: '20 mg', sku: 'OP-GLP-RT3-20MG' },
  { file: 'bpc-157-5mg', name: 'BPC-157', desc: 'Body Protection Compound', dosage: '5 mg', sku: 'OP-BPC-5MG' },
  { file: 'bpc-157-10mg', name: 'BPC-157', desc: 'Body Protection Compound', dosage: '10 mg', sku: 'OP-BPC-10MG' },
  { file: 'tb-500-5mg', name: 'TB-500', desc: 'Thymosin Beta-4 Fragment', dosage: '5 mg', sku: 'OP-TB500-5MG' },
  { file: 'tb-500-10mg', name: 'TB-500', desc: 'Thymosin Beta-4 Fragment', dosage: '10 mg', sku: 'OP-TB500-10MG' },
  { file: 'combo-bpc-tb-ghk', name: 'BPC+TB+GHK', desc: 'Triple Peptide Stack', dosage: '70 mg', sku: 'OP-COMBO-70MG' },
  { file: 'ipamorelin-5mg', name: 'Ipamorelin', desc: 'GH Secretagogue', dosage: '5 mg', sku: 'OP-IPA-5MG' },
  { file: 'hgh-191aa-10iu', name: 'HGH 191AA', desc: 'Somatropin 191AA', dosage: '10 IU', sku: 'OP-HGH-10IU' },
  { file: 'hgh-191aa-24iu', name: 'HGH 191AA', desc: 'Somatropin 191AA', dosage: '24 IU', sku: 'OP-HGH-24IU' },
  { file: 'mt2-5mg', name: 'MT-2', desc: 'Melanotan II', dosage: '5 mg', sku: 'OP-MT2-5MG' },
  { file: 'motsc-10mg', name: 'MOTS-C', desc: 'Mitochondrial-Derived Peptide', dosage: '10 mg', sku: 'OP-MOTSC-10MG' },
  { file: 'nad-500mg', name: 'NAD+', desc: 'Nicotinamide Adenine Dinucleotide', dosage: '500 mg', sku: 'OP-NAD-500MG' },
  // ── 2026-07 expansion: 14 new peptide SKUs ──────────────────────────────────
  { file: 'pt-141-10mg', name: 'PT-141', desc: 'Melanocortin Receptor Agonist', dosage: '10 mg', sku: 'OP-PT141-10MG' },
  { file: 'dsip-10mg', name: 'DSIP', desc: 'Delta Sleep-Inducing Peptide', dosage: '10 mg', sku: 'OP-DSIP-10MG' },
  { file: 'selank-10mg', name: 'Selank', desc: 'Anxiolytic Peptide (Tuftsin Analog)', dosage: '10 mg', sku: 'OP-SELANK-10MG' },
  { file: 'epithalon-10mg', name: 'Epithalon', desc: 'Telomerase-Activating Peptide', dosage: '10 mg', sku: 'OP-EPI-10MG' },
  { file: 'semax-10mg', name: 'Semax', desc: 'Nootropic Peptide (ACTH Fragment)', dosage: '10 mg', sku: 'OP-SEMAX-10MG' },
  { file: 'ss-31-10mg', name: 'SS-31', desc: 'Mitochondria-Targeted Peptide', dosage: '10 mg', sku: 'OP-SS31-10MG' },
  { file: 'cjc-1295-dac-2mg', name: 'CJC-1295 DAC', desc: 'GHRH Analog', dosage: '2 mg', sku: 'OP-CJC-DAC-2MG' },
  { file: 'tesamorelin-5mg', name: 'Tesamorelin', desc: 'GHRH Analog', dosage: '5 mg', sku: 'OP-TESA-5MG' },
  { file: 'ghk-cu-50mg', name: 'GHK-Cu', desc: 'Copper Tripeptide', dosage: '50 mg', sku: 'OP-GHKCU-50MG' },
  { file: 'kpv-10mg', name: 'KPV', desc: 'Anti-Inflammatory Tripeptide', dosage: '10 mg', sku: 'OP-KPV-10MG' },
  { file: 'adamax-5mg', name: 'Adamax', desc: 'Semax-Family Nootropic', dosage: '5 mg', sku: 'OP-ADAMAX-5MG' },
  { file: 'klow-80mg', name: 'KLOW', desc: 'BPC+TB+GHK-Cu+KPV Stack', dosage: '80 mg', sku: 'OP-KLOW-80MG' },
  { file: 'sermorelin-5mg', name: 'Sermorelin', desc: 'GHRH Analog', dosage: '5 mg', sku: 'OP-SERM-5MG' },
  { file: 'igf-1-lr3-1mg', name: 'IGF-1 LR3', desc: 'Insulin-Like Growth Factor', dosage: '1 mg', sku: 'OP-IGF1LR3-1MG' },
];

const DEFAULT_VIAL = '3 mL vial';

const tinctures = [
  {
    file: 'tadalafil-20mg',
    name: 'Tadalafil',
    descriptor: 'PDE5 Inhibitor',
    concentration: '20 mg/mL',
    totalDose: '600 mg',
    volume: '30 mL',
    sku: 'OP-TAD-20MG',
  },
];

const tablets = [
  { file: 'tamoxifen-20mg', name: 'Tamoxifen', descriptor: 'Estrogen Receptor Modulator (SERM)', strength: '20 mg', count: '30 Tablets', sku: 'OP-TAM-20MG' },
  { file: 'anastrozole-1mg', name: 'Anastrozole', descriptor: 'Aromatase Inhibitor (AI)', strength: '1 mg', count: '30 Tablets', sku: 'OP-ANA-1MG' },
  { file: 'telmisartan-40mg', name: 'Telmisartan', descriptor: 'Angiotensin II Receptor Blocker', strength: '40 mg', count: '30 Tablets', sku: 'OP-TEL-40MG' },
];

// ── Peptide vial label — 1.5" x 0.75" (viewBox 432 x 216) ────────────────────
function makeSvg({ name, desc, dosage, sku, vial = DEFAULT_VIAL }) {
  const fontSize = name.length > 10 ? 22 : name.length > 7 ? 26 : 30;
  const lyoX = dosage.length > 5 ? 185 : 178;
  const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeDesc = desc.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1.5in" height="0.75in" viewBox="0 0 432 216">
  <rect x="0" y="0" width="432" height="216" rx="6" fill="${C.bg}"/>
  <rect x="2" y="2" width="428" height="212" rx="5" fill="none" stroke="${C.gold}" stroke-width="1" opacity="0.4"/>

  <!-- Left divider -->
  <line x1="112" y1="14" x2="112" y2="202" stroke="${C.gold}" stroke-width="0.8" opacity="0.25"/>

  <!-- Full Syngyn logo (brand column) -->
  ${logo(6, 66, 100)}

  <!-- Product name -->
  <text x="130" y="46" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${C.white}" letter-spacing="1.5">${safeName}</text>

  <!-- Gold accent line -->
  <line x1="130" y1="54" x2="300" y2="54" stroke="${C.gold}" stroke-width="1.5" opacity="0.7"/>

  <!-- Descriptor -->
  <text x="130" y="72" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="400" fill="${C.descriptor}" letter-spacing="0.5">${safeDesc}</text>

  <!-- Dosage + format -->
  <text x="130" y="92" font-family="'Helvetica Neue', Arial, sans-serif" font-size="13" font-weight="700" fill="${C.gold}" letter-spacing="0.5">${dosage}</text>
  <text x="${lyoX}" y="92" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="400" fill="${C.muted}">Lyophilized Powder</text>

  <!-- Purity + storage -->
  <text x="130" y="109" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="600" fill="${C.white}" opacity="0.9" letter-spacing="0.3">Purity per COA</text>
  <text x="242" y="109" font-family="'Helvetica Neue', Arial, sans-serif" font-size="8.5" font-weight="400" fill="${C.muted}">Store at -20&#xB0;C</text>

  <line x1="130" y1="119" x2="420" y2="119" stroke="${C.gold}" stroke-width="0.5" opacity="0.2"/>

  <!-- RUO -->
  <text x="130" y="134" font-family="'Helvetica Neue', Arial, sans-serif" font-size="8.5" font-weight="700" fill="${C.ruo}" letter-spacing="0.8">FOR RESEARCH USE ONLY</text>
  <text x="130" y="147" font-family="'Helvetica Neue', Arial, sans-serif" font-size="6.5" font-weight="500" fill="${C.ruoSoft}" letter-spacing="0.2">Not for human consumption. Not a drug, food, or cosmetic.</text>

  <!-- Lot / MFG / EXP carried on the separate Phomemo QR sticker (two-sticker
       protocol) — this Avery label is brand-only. -->

  <!-- Footer -->
  <text x="130" y="190" font-family="'Helvetica Neue', Arial, sans-serif" font-size="7" font-weight="500" fill="${C.descriptor}" opacity="0.85" letter-spacing="0.3">syngyn.co</text>
  <text x="420" y="190" text-anchor="end" font-family="'Helvetica Neue', Arial, sans-serif" font-size="7" font-weight="400" fill="${C.muted}" opacity="0.7">${sku} | ${vial}</text>
</svg>`;
}

// ── Tincture / oral-solution label — 2.25" x 1.25" (viewBox 648 x 360) ───────
function makeTinctureSvg({ name, descriptor, concentration, totalDose, volume, sku, storage = 'Store at room temperature' }) {
  const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeDesc = descriptor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const nameSize = name.length > 12 ? 40 : name.length > 8 ? 48 : 56;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="2.25in" height="1.25in" viewBox="0 0 648 360">
  <rect x="0" y="0" width="648" height="360" rx="10" fill="${C.bg}"/>
  <rect x="3" y="3" width="642" height="354" rx="8" fill="none" stroke="${C.gold}" stroke-width="1.2" opacity="0.4"/>

  <line x1="164" y1="24" x2="164" y2="336" stroke="${C.gold}" stroke-width="0.9" opacity="0.25"/>

  <!-- Full Syngyn logo -->
  ${logo(12, 122, 144)}

  <!-- Product name + descriptor -->
  <text x="186" y="68" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${nameSize}" font-weight="800" fill="${C.white}" letter-spacing="1.5">${safeName}</text>
  <line x1="186" y1="80" x2="500" y2="80" stroke="${C.gold}" stroke-width="2" opacity="0.7"/>
  <text x="186" y="104" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="500" fill="${C.descriptor}" letter-spacing="1">${safeDesc} &#xB7; Oral Solution</text>

  <!-- Concentration band -->
  <rect x="186" y="120" width="320" height="38" rx="4" fill="${C.gold}" opacity="0.16"/>
  <rect x="186" y="120" width="320" height="38" rx="4" fill="none" stroke="${C.gold}" stroke-width="1" opacity="0.7"/>
  <text x="202" y="146" font-family="'Helvetica Neue', Arial, sans-serif" font-size="22" font-weight="800" fill="${C.gold}" letter-spacing="0.8">${concentration}</text>
  <text x="352" y="146" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="500" fill="${C.white}" opacity="0.9">${totalDose} &#xB7; ${volume}</text>

  <text x="186" y="184" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="500" fill="${C.muted}" letter-spacing="0.3">${storage} &#xB7; Keep sealed &#xB7; Avoid heat &amp; light</text>

  <line x1="186" y1="200" x2="636" y2="200" stroke="${C.gold}" stroke-width="0.6" opacity="0.25"/>

  <!-- RUO -->
  <text x="186" y="232" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="700" fill="${C.ruo}" letter-spacing="1">FOR RESEARCH USE ONLY</text>
  <text x="186" y="254" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="500" fill="${C.ruoSoft}" letter-spacing="0.3">Not for human consumption. Not a drug, food, or cosmetic.</text>

  <!-- Footer -->
  <text x="186" y="316" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="500" fill="${C.descriptor}" opacity="0.85" letter-spacing="0.4">syngyn.co</text>
  <text x="636" y="316" text-anchor="end" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="500" fill="${C.muted}" opacity="0.75">${sku} &#xB7; ${volume} Dropper Bottle</text>
</svg>`;
}

// ── Tablet / oral-ancillary label — 3.5" x 1.25" (viewBox 1008 x 360) ────────
function makeTabletSvg({ name, descriptor, strength, count, sku, storage = 'Store at room temperature' }) {
  const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeDesc = descriptor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const nameSize = name.length > 12 ? 40 : name.length > 8 ? 48 : 56;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="3.5in" height="1.25in" viewBox="0 0 1008 360">
  <rect x="0" y="0" width="1008" height="360" rx="10" fill="${C.bg}"/>
  <rect x="3" y="3" width="1002" height="354" rx="8" fill="none" stroke="${C.gold}" stroke-width="1.2" opacity="0.4"/>

  <line x1="164" y1="24" x2="164" y2="336" stroke="${C.gold}" stroke-width="0.9" opacity="0.25"/>

  <!-- Full Syngyn logo -->
  ${logo(12, 122, 144)}

  <!-- Product name + descriptor -->
  <text x="186" y="72" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${nameSize}" font-weight="800" fill="${C.white}" letter-spacing="1.5">${safeName}</text>
  <line x1="186" y1="84" x2="620" y2="84" stroke="${C.gold}" stroke-width="2" opacity="0.7"/>
  <text x="186" y="108" font-family="'Helvetica Neue', Arial, sans-serif" font-size="13" font-weight="500" fill="${C.descriptor}" letter-spacing="0.8">${safeDesc} &#xB7; Oral Tablets</text>

  <!-- Strength band -->
  <rect x="186" y="128" width="380" height="44" rx="4" fill="${C.gold}" opacity="0.16"/>
  <rect x="186" y="128" width="380" height="44" rx="4" fill="none" stroke="${C.gold}" stroke-width="1" opacity="0.7"/>
  <text x="206" y="158" font-family="'Helvetica Neue', Arial, sans-serif" font-size="24" font-weight="800" fill="${C.gold}" letter-spacing="0.8">${strength}</text>
  <text x="362" y="158" font-family="'Helvetica Neue', Arial, sans-serif" font-size="15" font-weight="500" fill="${C.white}" opacity="0.9">${count}</text>

  <text x="186" y="198" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="500" fill="${C.muted}" letter-spacing="0.3">${storage} &#xB7; Keep sealed &#xB7; Avoid heat &amp; light</text>

  <line x1="186" y1="214" x2="980" y2="214" stroke="${C.gold}" stroke-width="0.6" opacity="0.25"/>

  <!-- RUO -->
  <text x="186" y="246" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="700" fill="${C.ruo}" letter-spacing="1">FOR RESEARCH USE ONLY</text>
  <text x="186" y="268" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="500" fill="${C.ruoSoft}" letter-spacing="0.3">Not for human consumption. Not a drug, food, or cosmetic.</text>

  <!-- Footer -->
  <text x="186" y="330" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="500" fill="${C.descriptor}" opacity="0.85" letter-spacing="0.4">syngyn.co</text>
  <text x="980" y="330" text-anchor="end" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="500" fill="${C.muted}" opacity="0.75">${sku} &#xB7; ${count}</text>
</svg>`;
}

async function render(svg, file, kind) {
  const svgPath = path.join(labelsDir, `${file}-color-label.svg`);
  const jpgPath = path.join(labelsDir, `${file}-color-label.jpg`);
  fs.writeFileSync(svgPath, svg);
  await sharp(Buffer.from(svg), { density: 300 }).jpeg({ quality: 95 }).toFile(jpgPath);
  console.log(`Created: ${file}-color-label .svg + .jpg${kind ? ` (${kind})` : ''}`);
}

async function generate() {
  for (const p of peptides) await render(makeSvg(p), p.file);
  for (const t of tinctures) await render(makeTinctureSvg(t), t.file, 'tincture');
  for (const tab of tablets) await render(makeTabletSvg(tab), tab.file, 'tablet');
  console.log(`\nDone — ${peptides.length} peptide + ${tinctures.length} tincture + ${tablets.length} tablet labels (Syngyn black & gold).`);
}

generate().catch(console.error);
