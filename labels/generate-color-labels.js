const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const labelsDir = path.join(__dirname);

const peptides = [
  { file: 'glp-1-10mg', name: 'GLP-1', desc: 'GLP-1 Receptor Agonist', dosage: '10 mg', sku: 'OP-GLP1-10MG' },
  { file: 'glp-3-10mg', name: 'GLP-3', desc: 'Triple Agonist Peptide', dosage: '10 mg', sku: 'OP-GLP3-10MG' },
  { file: 'glp-3-20mg', name: 'GLP-3', desc: 'Triple Agonist Peptide', dosage: '20 mg', sku: 'OP-GLP3-20MG' },
  { file: 'bpc-157-5mg', name: 'BPC-157', desc: 'Body Protection Compound', dosage: '5 mg', sku: 'OP-BPC-5MG' },
  { file: 'bpc-157-10mg', name: 'BPC-157', desc: 'Body Protection Compound', dosage: '10 mg', sku: 'OP-BPC-10MG' },
  { file: 'tb-500-5mg', name: 'TB-500', desc: 'Thymosin Beta-4 Fragment', dosage: '5 mg', sku: 'OP-TB500-5MG' },
  { file: 'tb-500-10mg', name: 'TB-500', desc: 'Thymosin Beta-4 Fragment', dosage: '10 mg', sku: 'OP-TB500-10MG' },
  { file: 'combo-bpc-tb-ghk', name: 'BPC+TB+GHK', desc: 'Triple Peptide Stack', dosage: '70 mg', sku: 'OP-COMBO-70MG' },
  { file: 'ipamorelin-5mg', name: 'Ipamorelin', desc: 'GH Secretagogue', dosage: '5 mg', sku: 'OP-IPA-5MG' },
  { file: 'hgh-191aa-10iu', name: 'HGH 191AA', desc: 'Somatropin 191AA', dosage: '10 IU', sku: 'OP-HGH-10IU' },
  { file: 'mt2-5mg', name: 'MT-2', desc: 'Melanotan II', dosage: '5 mg', sku: 'OP-MT2-5MG' },
  { file: 'nad-500mg', name: 'NAD+', desc: 'Nicotinamide Adenine Dinucleotide', dosage: '500 mg', sku: 'OP-NAD-500MG' },
];

const DEFAULT_VIAL = '3 mL vial';

// Tinctures / oral solutions ship in 1 oz amber dropper bottles, not lyo vials.
// Different label format (2.25" x 1.25" vs 1.5" x 0.75"), different fields
// (concentration + total dose + volume + room-temp storage), no reconstitution.
// Brand text drops "PEPTIDES" since these are not peptides.
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

// Oral ancillary / PCT tablets ship in 30cc HDPE packer bottles (count-based
// SKUs, not 30-day supplies — RUO wall). Bigger wrap label than the vials:
// 3.5" x 1.25" (33-400 packer). Fields are strength + count + room-temp
// storage (no reconstitution, no -20C). Brand text drops "PEPTIDES" since
// these aren't peptides. Cohort-gated SKUs, so no public code name.
const tablets = [
  { file: 'tamoxifen-20mg', name: 'Tamoxifen', descriptor: 'Estrogen Receptor Modulator (SERM)', strength: '20 mg', count: '30 Tablets', sku: 'OP-TAM-20MG' },
  { file: 'anastrozole-1mg', name: 'Anastrozole', descriptor: 'Aromatase Inhibitor (AI)', strength: '1 mg', count: '30 Tablets', sku: 'OP-ANA-1MG' },
  { file: 'telmisartan-40mg', name: 'Telmisartan', descriptor: 'Angiotensin II Receptor Blocker', strength: '40 mg', count: '30 Tablets', sku: 'OP-TEL-40MG' },
];

function makeSvg({ name, desc, dosage, sku, vial = DEFAULT_VIAL }) {
  const fontSize = name.length > 10 ? 22 : name.length > 7 ? 26 : 30;
  const lyoX = dosage.length > 5 ? 185 : 178;
  const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeDesc = desc.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1.5in" height="0.75in" viewBox="0 0 432 216">
  <!-- Dark navy background -->
  <rect x="0" y="0" width="432" height="216" rx="6" fill="#0D1B2A"/>
  <rect x="2" y="2" width="428" height="212" rx="5" fill="none" stroke="#00B4D8" stroke-width="1" opacity="0.4"/>

  <!-- Left divider -->
  <line x1="110" y1="14" x2="110" y2="202" stroke="#00B4D8" stroke-width="0.8" opacity="0.25"/>

  <!-- Mandala logo -->
  <g transform="translate(56, 70)">
    <polygon points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15" fill="none" stroke="#00B4D8" stroke-width="1.2" opacity="0.25"/>
    <polygon points="0,-19.5 16.9,-9.75 16.9,9.75 0,19.5 -16.9,9.75 -16.9,-9.75" fill="none" stroke="#00B4D8" stroke-width="1.2" opacity="0.5"/>
    <polygon points="0,-10.5 9.1,-5.25 9.1,5.25 0,10.5 -9.1,5.25 -9.1,-5.25" fill="none" stroke="#00B4D8" stroke-width="1.5" opacity="0.8"/>
    <circle cx="0" cy="-30" r="2.2" fill="#00B4D8" opacity="0.6"/>
    <circle cx="26" cy="-15" r="2.2" fill="#00B4D8" opacity="0.5"/>
    <circle cx="26" cy="15" r="2.2" fill="#0077B6" opacity="0.5"/>
    <circle cx="0" cy="30" r="2.2" fill="#0077B6" opacity="0.6"/>
    <circle cx="-26" cy="15" r="2.2" fill="#0077B6" opacity="0.5"/>
    <circle cx="-26" cy="-15" r="2.2" fill="#00B4D8" opacity="0.5"/>
    <circle cx="0" cy="0" r="3.5" fill="#00B4D8"/>
    <circle cx="0" cy="0" r="1.8" fill="#0D1B2A"/>
    <polygon points="0,-26 6,-19 -6,-19" fill="none" stroke="#00B4D8" stroke-width="0.8" opacity="0.6"/>
    <polygon points="0,26 6,19 -6,19" fill="none" stroke="#0077B6" stroke-width="0.8" opacity="0.6"/>
  </g>

  <!-- Brand text -->
  <text x="56" y="124" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="700" fill="#FFFFFF" letter-spacing="2.4">SYNGYN</text>
  <text x="56" y="136" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="6" font-weight="400" fill="#90CAF9" letter-spacing="1.8">ANALYTICAL</text>
  <text x="56" y="146" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="6" font-weight="400" fill="#90CAF9" letter-spacing="1.8">REFERENCE</text>

  <!-- Product name -->
  <text x="128" y="46" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="#FFFFFF" letter-spacing="1.5">${safeName}</text>

  <!-- Cyan accent line -->
  <line x1="128" y1="54" x2="300" y2="54" stroke="#00B4D8" stroke-width="1.5" opacity="0.6"/>

  <!-- Descriptor -->
  <text x="128" y="72" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="400" fill="#90CAF9" letter-spacing="0.5">${safeDesc}</text>

  <!-- Dosage + format -->
  <text x="128" y="92" font-family="'Helvetica Neue', Arial, sans-serif" font-size="13" font-weight="700" fill="#00B4D8" letter-spacing="0.5">${dosage}</text>
  <text x="${lyoX}" y="92" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="400" fill="#7BA3C4">Lyophilized Powder</text>

  <!-- Purity + storage -->
  <text x="128" y="109" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="600" fill="#FFFFFF" opacity="0.85" letter-spacing="0.3">Purity per COA</text>
  <text x="240" y="109" font-family="'Helvetica Neue', Arial, sans-serif" font-size="8.5" font-weight="400" fill="#7BA3C4">Store at -20&#xB0;C</text>

  <!-- Divider -->
  <line x1="128" y1="119" x2="420" y2="119" stroke="#00B4D8" stroke-width="0.5" opacity="0.2"/>

  <!-- RUO header (high-contrast red) -->
  <text x="128" y="134" font-family="'Helvetica Neue', Arial, sans-serif" font-size="8.5" font-weight="700" fill="#FF4D6D" letter-spacing="0.8">FOR RESEARCH USE ONLY</text>

  <!-- RUO supporting disclaimer -->
  <text x="128" y="147" font-family="'Helvetica Neue', Arial, sans-serif" font-size="6.5" font-weight="500" fill="#FF8FA3" letter-spacing="0.2">Not for human consumption. Not a drug, food, or cosmetic.</text>

  <!-- Lot / MFG / EXP stamp area -->
  <text x="128" y="170" font-family="'Helvetica Neue', Arial, sans-serif" font-size="7.5" font-weight="400" fill="#7BA3C4" opacity="0.6">Lot: _______</text>
  <text x="220" y="170" font-family="'Helvetica Neue', Arial, sans-serif" font-size="7.5" font-weight="400" fill="#7BA3C4" opacity="0.6">MFG: _______</text>
  <text x="320" y="170" font-family="'Helvetica Neue', Arial, sans-serif" font-size="7.5" font-weight="400" fill="#7BA3C4" opacity="0.6">EXP: _______</text>

  <!-- Footer: website + SKU + vial -->
  <text x="128" y="190" font-family="'Helvetica Neue', Arial, sans-serif" font-size="7" font-weight="500" fill="#90CAF9" opacity="0.75" letter-spacing="0.3">syngyn.co</text>
  <text x="420" y="190" text-anchor="end" font-family="'Helvetica Neue', Arial, sans-serif" font-size="7" font-weight="400" fill="#7BA3C4" opacity="0.55">${sku} | ${vial}</text>
</svg>`;
}

// Tincture / oral-solution label template.
// 2.25" x 1.25" landscape, navy + cyan palette matching the peptide labels.
// Brand mark is "OPTIMIZED PERFORMANCE" (no "PEPTIDES" / no "RESEARCH" —
// these aren't peptides). ViewBox 648 x 360 = 288 units/inch (same scale as
// the 1.5"x0.75" peptide labels for consistent stroke + type weight).
function makeTinctureSvg({ name, descriptor, concentration, totalDose, volume, sku, storage = 'Store at room temperature' }) {
  const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeDesc = descriptor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Product name auto-shrinks for long compound names
  const nameSize = name.length > 12 ? 40 : name.length > 8 ? 48 : 56;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="2.25in" height="1.25in" viewBox="0 0 648 360">
  <!-- Dark navy background w/ thin cyan inset frame -->
  <rect x="0" y="0" width="648" height="360" rx="10" fill="#0D1B2A"/>
  <rect x="3" y="3" width="642" height="354" rx="8" fill="none" stroke="#00B4D8" stroke-width="1.2" opacity="0.4"/>

  <!-- Left brand column divider -->
  <line x1="160" y1="24" x2="160" y2="336" stroke="#00B4D8" stroke-width="0.9" opacity="0.25"/>

  <!-- Mandala logo (scaled ~1.5x from peptide label) -->
  <g transform="translate(80, 120)">
    <polygon points="0,-44 38,-22 38,22 0,44 -38,22 -38,-22" fill="none" stroke="#00B4D8" stroke-width="1.4" opacity="0.25"/>
    <polygon points="0,-28.6 24.8,-14.3 24.8,14.3 0,28.6 -24.8,14.3 -24.8,-14.3" fill="none" stroke="#00B4D8" stroke-width="1.4" opacity="0.5"/>
    <polygon points="0,-15.4 13.4,-7.7 13.4,7.7 0,15.4 -13.4,7.7 -13.4,-7.7" fill="none" stroke="#00B4D8" stroke-width="1.7" opacity="0.8"/>
    <circle cx="0" cy="-44" r="3.2" fill="#00B4D8" opacity="0.6"/>
    <circle cx="38" cy="-22" r="3.2" fill="#00B4D8" opacity="0.5"/>
    <circle cx="38" cy="22" r="3.2" fill="#0077B6" opacity="0.5"/>
    <circle cx="0" cy="44" r="3.2" fill="#0077B6" opacity="0.6"/>
    <circle cx="-38" cy="22" r="3.2" fill="#0077B6" opacity="0.5"/>
    <circle cx="-38" cy="-22" r="3.2" fill="#00B4D8" opacity="0.5"/>
    <circle cx="0" cy="0" r="5" fill="#00B4D8"/>
    <circle cx="0" cy="0" r="2.6" fill="#0D1B2A"/>
    <polygon points="0,-38 9,-28 -9,-28" fill="none" stroke="#00B4D8" stroke-width="1" opacity="0.6"/>
    <polygon points="0,38 9,28 -9,28" fill="none" stroke="#0077B6" stroke-width="1" opacity="0.6"/>
  </g>

  <!-- Brand text (no "PEPTIDES", no "RESEARCH") -->
  <text x="80" y="206" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="16" font-weight="700" fill="#FFFFFF" letter-spacing="2.6">SYNGYN</text>
  <text x="80" y="224" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="8" font-weight="400" fill="#90CAF9" letter-spacing="1.4">ANALYTICAL REFERENCE</text>

  <!-- Product name + descriptor -->
  <text x="184" y="68" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${nameSize}" font-weight="800" fill="#FFFFFF" letter-spacing="1.5">${safeName}</text>
  <line x1="184" y1="80" x2="500" y2="80" stroke="#00B4D8" stroke-width="2" opacity="0.6"/>
  <text x="184" y="104" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="500" fill="#90CAF9" letter-spacing="1">${safeDesc} · Oral Solution</text>

  <!-- Concentration band (highlighted — most important customer-facing number) -->
  <rect x="184" y="120" width="320" height="38" rx="4" fill="#00B4D8" opacity="0.18"/>
  <rect x="184" y="120" width="320" height="38" rx="4" fill="none" stroke="#00B4D8" stroke-width="1" opacity="0.7"/>
  <text x="200" y="146" font-family="'Helvetica Neue', Arial, sans-serif" font-size="22" font-weight="800" fill="#00B4D8" letter-spacing="0.8">${concentration}</text>
  <text x="350" y="146" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="500" fill="#FFFFFF" opacity="0.85">${totalDose} · ${volume}</text>

  <!-- Storage line -->
  <text x="184" y="184" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="500" fill="#7BA3C4" letter-spacing="0.3">${storage} · Keep sealed · Avoid heat &amp; light</text>

  <!-- Divider -->
  <line x1="184" y1="200" x2="636" y2="200" stroke="#00B4D8" stroke-width="0.6" opacity="0.25"/>

  <!-- RUO header (red, high contrast — same treatment as peptide labels) -->
  <text x="184" y="232" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="700" fill="#FF4D6D" letter-spacing="1">FOR RESEARCH USE ONLY</text>
  <text x="184" y="254" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="500" fill="#FF8FA3" letter-spacing="0.3">Not for human consumption. Not a drug, food, or cosmetic.</text>

  <!-- Lot / batch info is carried on a separate Phomemo QR sticker per OPP's
       two-sticker labeling protocol — this Avery label is brand-only. -->

  <!-- Footer: website + SKU -->
  <text x="184" y="316" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="500" fill="#90CAF9" opacity="0.78" letter-spacing="0.4">syngyn.co</text>
  <text x="636" y="316" text-anchor="end" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="500" fill="#7BA3C4" opacity="0.72">${sku} · ${volume} Dropper Bottle</text>
</svg>`;
}

// Tablet / oral-ancillary label template.
// 3.5" x 1.25" landscape wrap for a 30cc 33-400 packer bottle. ViewBox
// 1008 x 360 = 288 units/inch (same scale as the vial + tincture labels for
// consistent stroke + type weight). Brand mark is "OPTIMIZED PERFORMANCE"
// (no "PEPTIDES"). Lot/MFG/EXP carried on the separate Phomemo QR sticker per
// the two-sticker protocol — this Avery label is brand-only.
function makeTabletSvg({ name, descriptor, strength, count, sku, storage = 'Store at room temperature' }) {
  const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeDesc = descriptor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const nameSize = name.length > 12 ? 40 : name.length > 8 ? 48 : 56;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="3.5in" height="1.25in" viewBox="0 0 1008 360">
  <!-- Dark navy background w/ thin cyan inset frame -->
  <rect x="0" y="0" width="1008" height="360" rx="10" fill="#0D1B2A"/>
  <rect x="3" y="3" width="1002" height="354" rx="8" fill="none" stroke="#00B4D8" stroke-width="1.2" opacity="0.4"/>

  <!-- Left brand column divider -->
  <line x1="160" y1="24" x2="160" y2="336" stroke="#00B4D8" stroke-width="0.9" opacity="0.25"/>

  <!-- Mandala logo (scaled ~1.5x from peptide label) -->
  <g transform="translate(80, 120)">
    <polygon points="0,-44 38,-22 38,22 0,44 -38,22 -38,-22" fill="none" stroke="#00B4D8" stroke-width="1.4" opacity="0.25"/>
    <polygon points="0,-28.6 24.8,-14.3 24.8,14.3 0,28.6 -24.8,14.3 -24.8,-14.3" fill="none" stroke="#00B4D8" stroke-width="1.4" opacity="0.5"/>
    <polygon points="0,-15.4 13.4,-7.7 13.4,7.7 0,15.4 -13.4,7.7 -13.4,-7.7" fill="none" stroke="#00B4D8" stroke-width="1.7" opacity="0.8"/>
    <circle cx="0" cy="-44" r="3.2" fill="#00B4D8" opacity="0.6"/>
    <circle cx="38" cy="-22" r="3.2" fill="#00B4D8" opacity="0.5"/>
    <circle cx="38" cy="22" r="3.2" fill="#0077B6" opacity="0.5"/>
    <circle cx="0" cy="44" r="3.2" fill="#0077B6" opacity="0.6"/>
    <circle cx="-38" cy="22" r="3.2" fill="#0077B6" opacity="0.5"/>
    <circle cx="-38" cy="-22" r="3.2" fill="#00B4D8" opacity="0.5"/>
    <circle cx="0" cy="0" r="5" fill="#00B4D8"/>
    <circle cx="0" cy="0" r="2.6" fill="#0D1B2A"/>
    <polygon points="0,-38 9,-28 -9,-28" fill="none" stroke="#00B4D8" stroke-width="1" opacity="0.6"/>
    <polygon points="0,38 9,28 -9,28" fill="none" stroke="#0077B6" stroke-width="1" opacity="0.6"/>
  </g>

  <!-- Brand text (no "PEPTIDES") -->
  <text x="80" y="206" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="16" font-weight="700" fill="#FFFFFF" letter-spacing="2.6">SYNGYN</text>
  <text x="80" y="224" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="8" font-weight="400" fill="#90CAF9" letter-spacing="1.4">ANALYTICAL REFERENCE</text>

  <!-- Product name + descriptor -->
  <text x="184" y="72" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${nameSize}" font-weight="800" fill="#FFFFFF" letter-spacing="1.5">${safeName}</text>
  <line x1="184" y1="84" x2="620" y2="84" stroke="#00B4D8" stroke-width="2" opacity="0.6"/>
  <text x="184" y="108" font-family="'Helvetica Neue', Arial, sans-serif" font-size="13" font-weight="500" fill="#90CAF9" letter-spacing="0.8">${safeDesc} &#xB7; Oral Tablets</text>

  <!-- Strength band (highlighted — key customer-facing number) -->
  <rect x="184" y="128" width="380" height="44" rx="4" fill="#00B4D8" opacity="0.18"/>
  <rect x="184" y="128" width="380" height="44" rx="4" fill="none" stroke="#00B4D8" stroke-width="1" opacity="0.7"/>
  <text x="204" y="158" font-family="'Helvetica Neue', Arial, sans-serif" font-size="24" font-weight="800" fill="#00B4D8" letter-spacing="0.8">${strength}</text>
  <text x="360" y="158" font-family="'Helvetica Neue', Arial, sans-serif" font-size="15" font-weight="500" fill="#FFFFFF" opacity="0.85">${count}</text>

  <!-- Storage line -->
  <text x="184" y="198" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="500" fill="#7BA3C4" letter-spacing="0.3">${storage} &#xB7; Keep sealed &#xB7; Avoid heat &amp; light</text>

  <!-- Divider -->
  <line x1="184" y1="214" x2="980" y2="214" stroke="#00B4D8" stroke-width="0.6" opacity="0.25"/>

  <!-- RUO header (red, high contrast) -->
  <text x="184" y="246" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="700" fill="#FF4D6D" letter-spacing="1">FOR RESEARCH USE ONLY</text>
  <text x="184" y="268" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="500" fill="#FF8FA3" letter-spacing="0.3">Not for human consumption. Not a drug, food, or cosmetic.</text>

  <!-- Footer: website + SKU + count -->
  <text x="184" y="330" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="500" fill="#90CAF9" opacity="0.78" letter-spacing="0.4">syngyn.co</text>
  <text x="980" y="330" text-anchor="end" font-family="'Helvetica Neue', Arial, sans-serif" font-size="11" font-weight="500" fill="#7BA3C4" opacity="0.72">${sku} &#xB7; ${count}</text>
</svg>`;
}

async function generate() {
  for (const p of peptides) {
    const svg = makeSvg(p);
    const svgPath = path.join(labelsDir, `${p.file}-color-label.svg`);
    const jpgPath = path.join(labelsDir, `${p.file}-color-label.jpg`);

    fs.writeFileSync(svgPath, svg);

    await sharp(Buffer.from(svg), { density: 300 })
      .jpeg({ quality: 95 })
      .toFile(jpgPath);

    console.log(`Created: ${p.file}-color-label .svg + .jpg`);
  }

  for (const t of tinctures) {
    const svg = makeTinctureSvg(t);
    const svgPath = path.join(labelsDir, `${t.file}-color-label.svg`);
    const jpgPath = path.join(labelsDir, `${t.file}-color-label.jpg`);

    fs.writeFileSync(svgPath, svg);

    await sharp(Buffer.from(svg), { density: 300 })
      .jpeg({ quality: 95 })
      .toFile(jpgPath);

    console.log(`Created: ${t.file}-color-label .svg + .jpg (tincture)`);
  }

  for (const tab of tablets) {
    const svg = makeTabletSvg(tab);
    const svgPath = path.join(labelsDir, `${tab.file}-color-label.svg`);
    const jpgPath = path.join(labelsDir, `${tab.file}-color-label.jpg`);

    fs.writeFileSync(svgPath, svg);

    await sharp(Buffer.from(svg), { density: 300 })
      .jpeg({ quality: 95 })
      .toFile(jpgPath);

    console.log(`Created: ${tab.file}-color-label .svg + .jpg (tablet)`);
  }

  console.log(`\nDone — ${peptides.length} peptide + ${tinctures.length} tincture + ${tablets.length} tablet labels generated.`);
}

generate().catch(console.error);
