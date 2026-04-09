export default function Logo({ size = 40, full = false }) {
  const s = size;
  const cx = 50, cy = 42;

  // Hexagon helper
  const hex = (r, offsetAngle = 0) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 6 - Math.PI / 2 + offsetAngle;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });

  const outerR = 28;
  const midR = 17;
  const innerR = 9;

  const outerPts = hex(outerR);
  const midPts = hex(midR);
  const innerPts = hex(innerR);

  const outerPath = outerPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + ' Z';
  const midPath = midPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + ' Z';
  const innerPath = innerPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + ' Z';

  // Triangle accents at top and bottom
  const triSize = 3.5;
  const topTri = [
    [cx, cy - outerR + 0.5],
    [cx - triSize, cy - outerR + triSize + 1.5],
    [cx + triSize, cy - outerR + triSize + 1.5],
  ];
  const botTri = [
    [cx, cy + outerR - 0.5],
    [cx - triSize, cy + outerR - triSize - 1.5],
    [cx + triSize, cy + outerR - triSize - 1.5],
  ];

  // Connectors from mid to outer vertices
  const connectors = midPts.map(([mx, my], i) => {
    const [ox, oy] = outerPts[i];
    return { x1: mx, y1: my, x2: ox, y2: oy };
  });

  const iconViewBox = full ? '-30 0 160 140' : '0 0 100 84';
  const iconWidth = full ? s * 0.93 : s * 1.19;
  const iconHeight = full ? s : s * 1;

  // Shared font
  const ff = 'var(--font-jakarta), system-ui, sans-serif';

  return (
    <svg viewBox={iconViewBox} width={iconWidth} height={iconHeight}>
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00B4D8" />
          <stop offset="100%" stopColor="#0077B6" />
        </linearGradient>
        <linearGradient id="innerFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0077B6" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#08111A" />
        </linearGradient>
        <linearGradient id="initGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#00B4D8" />
        </linearGradient>
        <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00B4D8" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00B4D8" stopOpacity="0" />
        </radialGradient>
        {/* Thin gold accent for premium feel */}
        <linearGradient id="premiumLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00B4D8" stopOpacity="0" />
          <stop offset="20%" stopColor="#00B4D8" stopOpacity="0.6" />
          <stop offset="80%" stopColor="#00B4D8" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#00B4D8" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Subtle glow */}
      <circle cx={cx} cy={cy} r={outerR + 5} fill="url(#centerGlow)" />

      {/* Outer hexagon — thin premium stroke */}
      <path d={outerPath} fill="none" stroke="#0077B6" strokeWidth="1.2" opacity="0.8" />

      {/* Connector lines — very subtle */}
      {connectors.map((c, i) => (
        <line key={`conn${i}`} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
          stroke="#0077B6" strokeWidth="0.7" opacity="0.35" />
      ))}

      {/* Mid hexagon */}
      <path d={midPath} fill="none" stroke="url(#logoGrad)" strokeWidth="1.8" />

      {/* Inner hexagon — filled */}
      <path d={innerPath} fill="url(#innerFill)" stroke="url(#logoGrad)" strokeWidth="1.8" />

      {/* Center circle */}
      <circle cx={cx} cy={cy} r="3.5" fill="#08111A" stroke="url(#logoGrad)" strokeWidth="1.2" />
      <circle cx={cx} cy={cy} r="1.5" fill="#00B4D8" />

      {/* Triangle accents */}
      <polygon points={topTri.map(p => p.join(',')).join(' ')}
        fill="none" stroke="#00B4D8" strokeWidth="1" opacity="0.8" />
      <polygon points={botTri.map(p => p.join(',')).join(' ')}
        fill="none" stroke="#00B4D8" strokeWidth="1" opacity="0.8" />

      {/* Outer vertex nodes — small, refined */}
      {outerPts.map(([x, y], i) => (
        <circle key={`ov${i}`} cx={x} cy={y} r="2.5" fill="#00B4D8" />
      ))}

      {/* Mid vertex nodes */}
      {midPts.map(([x, y], i) => (
        <circle key={`mv${i}`} cx={x} cy={y} r="1.2" fill="#00B4D8" opacity="0.6" />
      ))}

      {full && (
        <>
          {/* Thin separator line */}
          <line x1={cx - 35} y1={cy + outerR + 10} x2={cx + 35} y2={cy + outerR + 10}
            stroke="url(#premiumLine)" strokeWidth="0.6" />

          {/* OPP — large, bold initials */}
          <text x={cx} y={cy + outerR + 28} textAnchor="middle"
            fontFamily={ff} fontSize="22" fontWeight="800"
            letterSpacing="10" fill="url(#initGrad)">
            OPP
          </text>

          {/* OPTIMIZED PERFORMANCE PEPTIDES — small elegant text */}
          <text x={cx} y={cy + outerR + 40} textAnchor="middle"
            fontFamily={ff} fontSize="4.5" fontWeight="400"
            letterSpacing="2" fill="#5A8A9A">
            OPTIMIZED  PERFORMANCE  PEPTIDES
          </text>

          {/* Bottom accent line */}
          <line x1={cx - 30} y1={cy + outerR + 44} x2={cx + 30} y2={cy + outerR + 44}
            stroke="url(#premiumLine)" strokeWidth="0.4" />
        </>
      )}
    </svg>
  );
}
