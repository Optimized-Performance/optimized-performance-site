// OPP primitives: Logo, Vial, Icon. All use currentColor / CSS vars so they
// adapt to the laboratory theme.

export function Logo({ size = 28, full = false }) {
  if (!full) {
    return (
      <svg viewBox="-50 -50 100 100" width={size} height={size} aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <polygon points="0,-42 36.4,-21 36.4,21 0,42 -36.4,21 -36.4,-21" opacity="0.35" />
          <polygon points="0,-26 22.5,-13 22.5,13 0,26 -22.5,13 -22.5,-13" opacity="0.7" />
          <circle cx="0" cy="0" r="3" fill="currentColor" stroke="none" />
        </g>
      </svg>
    );
  }
  // Full lockup: hex mark + "OPP" + wordmark
  return (
    <svg viewBox="-70 -70 140 190" width={size * 0.93} height={size} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <polygon points="0,-42 36.4,-21 36.4,21 0,42 -36.4,21 -36.4,-21" opacity="0.35" />
        <polygon points="0,-26 22.5,-13 22.5,13 0,26 -22.5,13 -22.5,-13" opacity="0.7" />
        <circle cx="0" cy="0" r="3" fill="currentColor" stroke="none" />
      </g>
      <line x1="-45" y1="60" x2="45" y2="60" stroke="currentColor" strokeWidth="0.4" opacity="0.4" />
      <text x="0" y="84" textAnchor="middle" fontFamily="var(--font-display)"
            fontSize="22" fontWeight="600" letterSpacing="10" fill="currentColor">OPP</text>
      <text x="0" y="102" textAnchor="middle" fontFamily="var(--font-mono)"
            fontSize="5" letterSpacing="2" fill="currentColor" opacity="0.6">
        OPTIMIZED  PERFORMANCE  PEPTIDES
      </text>
      <line x1="-35" y1="108" x2="35" y2="108" stroke="currentColor" strokeWidth="0.3" opacity="0.3" />
    </svg>
  );
}

// Vial renderer — prefers a real product image at /vials/<sku>.png.
// Falls back to a lightweight SVG placeholder when the image isn't present.
// Drop per-SKU PNGs into public/vials/ and they'll pick up automatically.
import { useState } from 'react';

export function Vial({ label = '—', dosage = '', size = 220, purity, kit = false, sku, subtitle = 'Research Peptide', image }) {
  const lowerSku = sku ? String(sku).toLowerCase() : null;
  const candidates = image
    ? [image]
    : lowerSku
    ? [`/vials/${lowerSku}.jpg`, `/vials/${lowerSku}.png`]
    : [];
  const [idx, setIdx] = useState(0);
  const src = candidates[idx];

  if (src) {
    return (
      <img
        src={src}
        alt={`${label} ${dosage} vial`}
        width={size}
        height={size}
        onError={() => setIdx(idx + 1)}
        style={{
          display: 'block',
          width: size,
          height: size,
          objectFit: 'contain',
          maxWidth: '100%',
        }}
      />
    );
  }

  return <VialFallback label={label} dosage={dosage} size={size} purity={purity} kit={kit} sku={sku} subtitle={subtitle} />;
}

function VialFallback({ label = '—', dosage = '', size = 220, purity, kit = false, sku, subtitle = 'Research Peptide' }) {
  // Tiny thumbnails: simplified render (cap + glass + small label) — text gets illegible below ~80px
  const tiny = size < 80;

  if (kit) {
    return (
      <svg viewBox="0 0 280 300" width={size} height={(size * 300) / 280} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="kitGlass" x1="0" x2="1">
            <stop offset="0" stopColor="#2a3340" stopOpacity="0.9" />
            <stop offset="0.35" stopColor="#e8eef5" stopOpacity="0.18" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="0.65" stopColor="#e8eef5" stopOpacity="0.18" />
            <stop offset="1" stopColor="#2a3340" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="kitCap" x1="0" x2="1">
            <stop offset="0" stopColor="#6a6f76" />
            <stop offset="0.5" stopColor="#d4d8de" />
            <stop offset="1" stopColor="#6a6f76" />
          </linearGradient>
        </defs>
        <text x="16" y="22" fontSize="8" fill="var(--inkSoft)" fontFamily="var(--font-mono)" letterSpacing="1">KIT · 10 VIALS</text>
        {[0, 1].map((row) =>
          [0, 1, 2, 3, 4].map((i) => {
            const x = 20 + i * 50;
            const y = 40 + row * 130;
            return (
              <g key={`${row}-${i}`}>
                <rect x={x + 8} y={y} width="26" height="10" rx="1.5" fill="url(#kitCap)" />
                <rect x={x + 4} y={y + 16} width="34" height="100" rx="3" fill="url(#kitGlass)" stroke="#3a4450" strokeWidth="0.5" />
                <rect x={x + 4} y={y + 42} width="34" height="60" fill="#0D1B2A" />
                <text x={x + 21} y={y + 68} textAnchor="middle" fontSize="5.5" fill="#FFFFFF" fontFamily="var(--font-display)" fontWeight="700">{label.split(' ')[0]}</text>
                <text x={x + 21} y={y + 82} textAnchor="middle" fontSize="7" fill="#00B4D8" fontFamily="var(--font-display)" fontWeight="700">{dosage}</text>
                <rect x={x + 6} y={y + 65} width="2" height="30" fill="#FFFFFF" opacity="0.2" />
              </g>
            );
          })
        )}
      </svg>
    );
  }

  if (tiny) {
    // Simplified thumb — cap + glass + label block with just the name + dosage
    return (
      <svg viewBox="0 0 100 160" width={size} height={(size * 160) / 100} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="tinyGlass" x1="0" x2="1">
            <stop offset="0" stopColor="#2a3340" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#2a3340" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="tinyCap" x1="0" x2="1">
            <stop offset="0" stopColor="#6a6f76" />
            <stop offset="0.5" stopColor="#d4d8de" />
            <stop offset="1" stopColor="#6a6f76" />
          </linearGradient>
        </defs>
        <rect x="34" y="6" width="32" height="14" rx="2" fill="url(#tinyCap)" />
        <rect x="28" y="24" width="44" height="126" rx="4" fill="url(#tinyGlass)" stroke="#3a4450" strokeWidth="0.5" />
        <rect x="28" y="50" width="44" height="74" fill="#0D1B2A" />
        <text x="50" y="82" textAnchor="middle" fontSize="9" fill="#FFFFFF" fontFamily="var(--font-display)" fontWeight="700">{label.split(' ')[0]}</text>
        <text x="50" y="104" textAnchor="middle" fontSize="10" fill="#00B4D8" fontFamily="var(--font-display)" fontWeight="700">{dosage}</text>
        <rect x="30" y="78" width="3" height="40" fill="#FFFFFF" opacity="0.2" />
      </svg>
    );
  }

  // Full photo-like render
  const vw = 220, vh = 320;
  const skuLine = sku ? String(sku).toUpperCase() : '';

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width={size} height={(size * vh) / vw} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="glassH" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#1f2732" stopOpacity="0.95" />
          <stop offset="0.08" stopColor="#2a3340" stopOpacity="0.7" />
          <stop offset="0.3" stopColor="#c0c8d2" stopOpacity="0.18" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="0.7" stopColor="#c0c8d2" stopOpacity="0.18" />
          <stop offset="0.92" stopColor="#2a3340" stopOpacity="0.7" />
          <stop offset="1" stopColor="#1f2732" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="cap" x1="0" x2="1">
          <stop offset="0" stopColor="#5a6068" />
          <stop offset="0.18" stopColor="#9aa0a8" />
          <stop offset="0.38" stopColor="#d8dce2" />
          <stop offset="0.5" stopColor="#eaedf1" />
          <stop offset="0.62" stopColor="#d8dce2" />
          <stop offset="0.82" stopColor="#9aa0a8" />
          <stop offset="1" stopColor="#5a6068" />
        </linearGradient>
        <linearGradient id="capTop" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#c8ccd2" />
          <stop offset="1" stopColor="#8a9098" />
        </linearGradient>
      </defs>

      {/* Floor shadow */}
      <ellipse cx={vw / 2} cy={vh - 6} rx="70" ry="7" fill="#000" opacity="0.55" />

      {/* Cap — top nub + main crimp */}
      <rect x="80" y="14" width="60" height="6" rx="1" fill="url(#capTop)" />
      <rect x="72" y="20" width="76" height="36" rx="2" fill="url(#cap)" />
      {/* Crimp seam lines */}
      <line x1="72" y1="28" x2="148" y2="28" stroke="#4a5058" strokeWidth="0.4" opacity="0.6" />
      <line x1="72" y1="50" x2="148" y2="50" stroke="#4a5058" strokeWidth="0.4" opacity="0.6" />
      {/* Cap shadow on glass neck */}
      <rect x="74" y="55" width="72" height="3" fill="#1a1f28" opacity="0.5" />

      {/* Glass body — rounded bottom */}
      <path
        d="M 62 58 L 158 58 L 158 290 Q 158 300 148 300 L 72 300 Q 62 300 62 290 Z"
        fill="url(#glassH)"
        stroke="#3a4450"
        strokeWidth="0.6"
      />

      {/* Label — dark navy */}
      <rect x="62" y="104" width="96" height="168" fill="#0D1B2A" />
      {/* Label top & bottom thin accent lines */}
      <rect x="62" y="104" width="96" height="1" fill="#00B4D8" opacity="0.4" />
      <rect x="62" y="271" width="96" height="1" fill="#00B4D8" opacity="0.4" />

      {/* Hex logo watermark — vertical left edge */}
      <g transform={`translate(74 186) rotate(-90)`} opacity="0.55">
        <g fill="none" stroke="#00B4D8" strokeWidth="1" strokeLinejoin="round">
          <polygon points="0,-14 12.1,-7 12.1,7 0,14 -12.1,7 -12.1,-7" opacity="0.55" />
          <polygon points="0,-8 7,-4 7,4 0,8 -7,4 -7,-4" opacity="0.85" />
          <circle r="1.3" fill="#00B4D8" stroke="none" />
        </g>
      </g>
      {/* Small "OPTIMIZED PERFORMANCE" text vertical */}
      <text
        transform="translate(70 220) rotate(-90)"
        fontSize="3.5" fill="#8a96a8"
        fontFamily="var(--font-display)"
        letterSpacing="1.3"
      >OPTIMIZED PERFORMANCE</text>

      {/* Product name */}
      <text x="106" y="136" fontSize="17" fill="#FFFFFF"
            fontFamily="var(--font-display)" fontWeight="700" letterSpacing="-0.4">
        {label}
      </text>

      {/* Horizontal rule */}
      <line x1="106" y1="143" x2="152" y2="143" stroke="#ffffff" strokeWidth="0.4" opacity="0.3" />

      {/* Subtitle */}
      <text x="106" y="154" fontSize="5.5" fill="#c0c8d2"
            fontFamily="var(--font-display)" fontWeight="500">
        {subtitle}
      </text>

      {/* Dosage — large cyan */}
      <text x="106" y="180" fontSize="14" fill="#00B4D8"
            fontFamily="var(--font-display)" fontWeight="700" letterSpacing="-0.2">
        {dosage}
      </text>
      {/* Format text right of dosage */}
      <text x="138" y="180" fontSize="4.5" fill="#8a96a8"
            fontFamily="var(--font-display)" fontWeight="400">
        Lyophilized Powder
      </text>

      {/* Purity */}
      <text x="106" y="196" fontSize="6" fill="#FFFFFF"
            fontFamily="var(--font-display)" fontWeight="600">
        Purity: &gt;{purity ? Math.floor(purity) : 99}%
      </text>
      {/* Store at right */}
      <text x="138" y="196" fontSize="4.5" fill="#8a96a8"
            fontFamily="var(--font-display)" fontWeight="400">
        Store at −20°C
      </text>

      {/* Thin divider */}
      <line x1="106" y1="206" x2="152" y2="206" stroke="#00B4D8" strokeWidth="0.4" opacity="0.5" />

      {/* RUO */}
      <text x="106" y="218" fontSize="5" fill="#FFFFFF"
            fontFamily="var(--font-display)" fontWeight="600" letterSpacing="0.6">
        FOR RESEARCH USE ONLY
      </text>

      {/* Lot line */}
      <text x="106" y="234" fontSize="4.5" fill="#8a96a8"
            fontFamily="var(--font-display)" fontWeight="400">
        Lot: ___________
      </text>

      {/* Divider before footer */}
      <line x1="106" y1="252" x2="152" y2="252" stroke="#ffffff" strokeWidth="0.3" opacity="0.15" />

      {/* SKU footer */}
      <text x="106" y="262" fontSize="3.8" fill="#8a96a8"
            fontFamily="var(--font-mono)" letterSpacing="0.4">
        {skuLine || 'OPP'} | 2 mL vial
      </text>

      {/* Specular highlight on glass — left edge */}
      <rect x="65" y="62" width="3" height="224" fill="#FFFFFF" opacity="0.28" />
      {/* Small top-right highlight */}
      <rect x="150" y="62" width="1.5" height="110" fill="#FFFFFF" opacity="0.18" />

      {/* Bottom meniscus shadow */}
      <rect x="62" y="286" width="96" height="4" fill="#0a0f18" opacity="0.5" />
    </svg>
  );
}

const iconPaths = {
  shield: (<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>),
  truck: (<><path d="M1 3h15v13H1z" /><path d="M16 8h4l3 3v5h-7" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>),
  lock: (<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  flask: (<><path d="M9 3h6" /><path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /></>),
  doc: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>),
  chevron: <path d="m9 18 6-6-6-6" />,
  chevDown: <path d="m6 9 6 6 6-6" />,
  chevLeft: <path d="m15 18-6-6 6-6" />,
  plus: (<><path d="M12 5v14" /><path d="M5 12h14" /></>),
  minus: <path d="M5 12h14" />,
  x: (<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  cart: (<><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  check: <path d="M20 6 9 17l-5-5" />,
  arrow: (<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>),
  download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>),
  dot: <circle cx="12" cy="12" r="3" fill="currentColor" />,
  beaker: (<><path d="M4.5 3h15" /><path d="M6 3v7L3 20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2l-3-10V3" /><path d="M6 14h12" /></>),
  temp: <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />,
  info: (<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>),
  filter: <path d="M3 6h18M7 12h10M10 18h4" />,
  card: (<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>),
  menu: (<><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>),
  trash: (<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></>),
  edit: (<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>),
  refresh: (<><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>),
};

export function Icon({ name, size = 18, stroke = 1.5, className = '' }) {
  const path = iconPaths[name] || null;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      {path}
    </svg>
  );
}
