const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const labelsDir = path.join(__dirname);

const peptides = [
  { file: 'bpc-157', name: 'BPC-157', desc: 'Body Protection Compound', dosage: '5 mg' },
  { file: 'tb-500', name: 'TB-500', desc: 'Thymosin Beta-4 Fragment', dosage: '5 mg' },
  { file: 'pt-141', name: 'PT-141', desc: 'Bremelanotide', dosage: '10 mg' },
  { file: 'cjc-1295', name: 'CJC-1295', desc: 'Mod GRF (No DAC)', dosage: '5 mg' },
  { file: 'ipamorelin', name: 'Ipamorelin', desc: 'GH Secretagogue', dosage: '5 mg' },
  { file: 'ghrp-2', name: 'GHRP-2', desc: 'GH Releasing Peptide-2', dosage: '5 mg' },
];

function makeSvg({ name, desc, dosage }) {
  // Adjust x offset for "Lyophilized Powder" based on dosage text width
  const lyoX = dosage.length > 4 ? 175 : 170;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1.5in" height="0.5in" viewBox="0 0 432 144">
  <rect x="2" y="2" width="428" height="140" rx="6" ry="6" fill="none" stroke="#0D1B2A" stroke-width="2"/>
  <line x1="100" y1="12" x2="100" y2="132" stroke="#0D1B2A" stroke-width="1" opacity="0.4"/>
  <g transform="translate(52, 52)">
    <polygon points="0,-28 24.2,-14 24.2,14 0,28 -24.2,14 -24.2,-14" fill="none" stroke="#0D1B2A" stroke-width="1.5" opacity="0.3"/>
    <polygon points="0,-18 15.6,-9 15.6,9 0,18 -15.6,9 -15.6,-9" fill="none" stroke="#0D1B2A" stroke-width="1.5" opacity="0.6"/>
    <polygon points="0,-10 8.7,-5 8.7,5 0,10 -8.7,5 -8.7,-5" fill="none" stroke="#0D1B2A" stroke-width="1.5" opacity="0.85"/>
    <circle cx="0" cy="-28" r="2" fill="#0D1B2A"/>
    <circle cx="24.2" cy="-14" r="2" fill="#0D1B2A" opacity="0.85"/>
    <circle cx="24.2" cy="14" r="2" fill="#0D1B2A" opacity="0.85"/>
    <circle cx="0" cy="28" r="2" fill="#0D1B2A"/>
    <circle cx="-24.2" cy="14" r="2" fill="#0D1B2A" opacity="0.85"/>
    <circle cx="-24.2" cy="-14" r="2" fill="#0D1B2A" opacity="0.85"/>
    <circle cx="0" cy="0" r="3" fill="#0D1B2A"/>
    <circle cx="0" cy="0" r="1.5" fill="white"/>
    <polygon points="0,-25 6,-18 -6,-18" fill="none" stroke="#0D1B2A" stroke-width="1" opacity="0.7"/>
    <polygon points="0,25 6,18 -6,18" fill="none" stroke="#0D1B2A" stroke-width="1" opacity="0.7"/>
  </g>
  <text x="52" y="96" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="8" font-weight="700" fill="#0D1B2A" letter-spacing="1.5">OPTIMIZED</text>
  <text x="52" y="106" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="6" font-weight="400" fill="#0D1B2A" letter-spacing="2" opacity="0.7">PERFORMANCE</text>
  <text x="118" y="38" font-family="'Helvetica Neue', Arial, sans-serif" font-size="28" font-weight="800" fill="#0D1B2A" letter-spacing="1.5">${name}</text>
  <line x1="118" y1="46" x2="320" y2="46" stroke="#0D1B2A" stroke-width="0.75" opacity="0.35"/>
  <text x="118" y="62" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="400" fill="#0D1B2A" opacity="0.65" letter-spacing="0.5">${desc}</text>
  <text x="118" y="80" font-family="'Helvetica Neue', Arial, sans-serif" font-size="12" font-weight="700" fill="#0D1B2A" letter-spacing="0.5">${dosage}</text>
  <text x="${lyoX}" y="80" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="400" fill="#0D1B2A" opacity="0.6">Lyophilized Powder</text>
  <text x="118" y="96" font-family="'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="600" fill="#0D1B2A" opacity="0.75" letter-spacing="0.3">Purity: &gt;98%</text>
  <text x="220" y="96" font-family="'Helvetica Neue', Arial, sans-serif" font-size="8" font-weight="400" fill="#0D1B2A" opacity="0.55">Store at -20&#xB0;C</text>
  <line x1="118" y1="106" x2="420" y2="106" stroke="#0D1B2A" stroke-width="0.5" opacity="0.25"/>
  <text x="118" y="120" font-family="'Helvetica Neue', Arial, sans-serif" font-size="7" font-weight="600" fill="#0D1B2A" opacity="0.6" letter-spacing="0.8">FOR RESEARCH USE ONLY</text>
  <text x="118" y="133" font-family="'Helvetica Neue', Arial, sans-serif" font-size="7" font-weight="400" fill="#0D1B2A" opacity="0.45">Lot: __________</text>
  <text x="420" y="133" text-anchor="end" font-family="'Helvetica Neue', Arial, sans-serif" font-size="7" font-weight="400" fill="#0D1B2A" opacity="0.45">2 mL vial</text>
</svg>`;
}

async function generate() {
  for (const p of peptides) {
    const svg = makeSvg(p);
    const svgPath = path.join(labelsDir, `${p.file}-vial-label.svg`);
    const jpgPath = path.join(labelsDir, `${p.file}-vial-label.jpg`);

    fs.writeFileSync(svgPath, svg);

    await sharp(Buffer.from(svg), { density: 300 })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 95 })
      .toFile(jpgPath);

    console.log(`Created: ${p.file}-vial-label.svg + .jpg`);
  }
  console.log('\nAll labels generated.');
}

generate().catch(console.error);
