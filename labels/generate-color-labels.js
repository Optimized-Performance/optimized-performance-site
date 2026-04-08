const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const labelsDir = path.join(__dirname);

const peptides = [
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
  { file: 'retatrutide-10mg', name: 'Retatrutide', desc: 'GLP-1/GIP/Glucagon Triple Agonist', dosage: '10 mg', sku: 'OP-RET-10MG' },
  { file: 'retatrutide-20mg', name: 'Retatrutide', desc: 'GLP-1/GIP/Glucagon Triple Agonist', dosage: '20 mg', sku: 'OP-RET-20MG' },
];

function makeSvg({ name, desc, dosage, sku }) {
  const fontSize = name.length > 10 ? 22 : name.length > 7 ? 26 : 30;
  const lyoX = dosage.length > 5 ? 185 : 178;
  const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeDesc = desc.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1.5in" height="0.75in" viewBox="0 0 432 216">
  <!-- Dark navy background -->
  <rect x="0" y="0" width="432" height="216" rx="6" fill="#0D1B2A"/>
  <rect x="2" y="2" width="428" height="212" rx="5" fill="none" stroke="#00B4D8" stroke-width="1" opacity="0.4"/>

  <!-- Left divider -->
  <line x1="110" y1="16" x2="110" y2="200" stroke="#00B4D8" stroke-width="0.8" opacity="0.25"/>

  <!-- Mandala logo -->
  <g transform="translate(56, 78)">
    <polygon points="0,-34 29.4,-17 29.4,17 0,34 -29.4,17 -29.4,-17" fill="none" stroke="#00B4D8" stroke-width="1.2" opacity="0.25"/>
    <polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" fill="none" stroke="#00B4D8" stroke-width="1.2" opacity="0.5"/>
    <polygon points="0,-12 10.4,-6 10.4,6 0,12 -10.4,6 -10.4,-6" fill="none" stroke="#00B4D8" stroke-width="1.5" opacity="0.8"/>
    <circle cx="0" cy="-34" r="2.5" fill="#00B4D8" opacity="0.6"/>
    <circle cx="29.4" cy="-17" r="2.5" fill="#00B4D8" opacity="0.5"/>
    <circle cx="29.4" cy="17" r="2.5" fill="#0077B6" opacity="0.5"/>
    <circle cx="0" cy="34" r="2.5" fill="#0077B6" opacity="0.6"/>
    <circle cx="-29.4" cy="17" r="2.5" fill="#0077B6" opacity="0.5"/>
    <circle cx="-29.4" cy="-17" r="2.5" fill="#00B4D8" opacity="0.5"/>
    <circle cx="0" cy="0" r="4" fill="#00B4D8"/>
    <circle cx="0" cy="0" r="2" fill="#0D1B2A"/>
    <polygon points="0,-30 7,-22 -7,-22" fill="none" stroke="#00B4D8" stroke-width="0.8" opacity="0.6"/>
    <polygon points="0,30 7,22 -7,22" fill="none" stroke="#0077B6" stroke-width="0.8" opacity="0.6"/>
  </g>

  <!-- Brand text -->
  <text x="56" y="132" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="700" fill="#FFFFFF" letter-spacing="1.8">OPTIMIZED</text>
  <text x="56" y="144" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="6.5" font-weight="400" fill="#90CAF9" letter-spacing="2.2">PERFORMANCE</text>

  <!-- Product name -->
  <text x="128" y="52" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="#FFFFFF" letter-spacing="1.5">${safeName}</text>

  <!-- Cyan accent line -->
  <line x1="128" y1="60" x2="300" y2="60" stroke="#00B4D8" stroke-width="1.5" opacity="0.6"/>

  <!-- Descriptor -->
  <text x="128" y="80" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="400" fill="#90CAF9" letter-spacing="0.5">${safeDesc}</text>

  <!-- Dosage + format -->
  <text x="128" y="104" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" font-weight="700" fill="#00B4D8" letter-spacing="0.5">${dosage}</text>
  <text x="${lyoX}" y="104" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="400" fill="#7BA3C4">Lyophilized Powder</text>

  <!-- Purity + storage -->
  <text x="128" y="124" font-family="'Helvetica Neue', Arial, sans-serif" font-size="10" font-weight="600" fill="#FFFFFF" opacity="0.85" letter-spacing="0.3">Purity: &gt;99%</text>
  <text x="240" y="124" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="400" fill="#7BA3C4">Store at -20&#xB0;C</text>

  <!-- Divider -->
  <line x1="128" y1="138" x2="420" y2="138" stroke="#00B4D8" stroke-width="0.5" opacity="0.2"/>

  <!-- RUO -->
  <text x="128" y="156" font-family="'Helvetica Neue', Arial, sans-serif" font-size="8" font-weight="600" fill="#00B4D8" opacity="0.7" letter-spacing="0.8">FOR RESEARCH USE ONLY</text>

  <!-- Lot + SKU -->
  <text x="128" y="176" font-family="'Helvetica Neue', Arial, sans-serif" font-size="8" font-weight="400" fill="#7BA3C4" opacity="0.5">Lot: __________</text>
  <text x="420" y="176" text-anchor="end" font-family="'Helvetica Neue', Arial, sans-serif" font-size="7" font-weight="400" fill="#7BA3C4" opacity="0.4">${sku} | 2 mL vial</text>
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
  console.log(`\nDone — ${peptides.length} color labels generated.`);
}

generate().catch(console.error);
