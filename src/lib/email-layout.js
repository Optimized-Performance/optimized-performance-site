// Branded HTML email layout — premium, matches the storefront's dark aesthetic.
// Table-based + fully INLINE styles for email-client compatibility (clients
// strip <style>, ignore flex/grid, don't load the site's custom fonts, and
// Outlook ignores CSS gradients — so: tables, system font stack, and a solid
// background-color FALLBACK behind every gradient). Reusable across promo +
// transactional emails via the params below.
//
// renderBrandedEmail({
//   preheader, eyebrow, heading, align ('center'|'left'),
//   paragraphs[], highlight {label,value,sub}, extraHtml,
//   cta {text,url}, ctaSub, trust[], note, footerLines[]
// })
// paragraphs / extraHtml / footerLines may contain trusted inline HTML (we
// control them); eyebrow / heading / cta.text / highlight.* are escaped.

const C = {
  bg: '#08090C', card: '#121418', cardTop: '#16191F', border: '#24272D',
  ink: '#F5F3EC', soft: '#B6B4AC', mute: '#6E6D68',
  accent: '#2BC9DE', accentDeep: '#0E7C8B', accentDark: '#06222A',
  hiBg: '#0C1E22', hiBorder: '#1D525C', hiSoft: '#7FD6E2',
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderBrandedEmail({
  preheader = '', eyebrow = '', heading = '', align = 'left',
  paragraphs = [], highlight = null, extraHtml = '',
  cta = null, ctaSub = '', trust = [], note = '', footerLines = [],
} = {}) {
  const ta = align === 'center' ? 'center' : 'left';

  const eyebrowHtml = eyebrow
    ? `<div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:${C.accent};margin:0 0 12px;">${esc(eyebrow)}</div>`
    : '';

  const headingHtml = heading
    ? `<h1 style="margin:0 0 18px;color:${C.ink};font-size:27px;line-height:1.28;font-weight:800;letter-spacing:-0.2px;">${esc(heading)}</h1>`
    : '';

  const para = paragraphs
    .map((p) => `<p style="margin:0 0 16px;color:${C.soft};font-size:15px;line-height:1.65;">${p}</p>`)
    .join('');

  // Discount "medallion" — the visual centerpiece. Cyan-tinted dark panel with
  // a big value, on a centered table so it sits as a contained block.
  const highlightHtml = highlight
    ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:6px auto 22px;">
         <tr><td style="background-color:${C.hiBg};border:1px solid ${C.hiBorder};border-radius:16px;padding:22px 48px;text-align:center;">
           ${highlight.label ? `<div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${C.hiSoft};">${esc(highlight.label)}</div>` : ''}
           <div style="font-family:${FONT};font-size:38px;font-weight:800;color:${C.accent};line-height:1;margin:7px 0;letter-spacing:-0.5px;">${esc(highlight.value)}</div>
           ${highlight.sub ? `<div style="font-family:${FONT};font-size:12.5px;color:${C.soft};line-height:1.5;">${esc(highlight.sub)}</div>` : ''}
         </td></tr>
       </table>`
    : '';

  // Bulletproof-ish gradient button (solid bgcolor fallback for Outlook).
  const ctaBlock = cta && cta.url
    ? `<table role="presentation" align="${ta === 'center' ? 'center' : 'left'}" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0;">
         <tr><td align="center" style="border-radius:12px;background-color:${C.accent};background-image:linear-gradient(135deg,${C.accent},${C.accentDeep});box-shadow:0 2px 14px rgba(43,201,222,0.25);">
           <a href="${cta.url}" target="_blank" style="display:inline-block;padding:16px 46px;font-family:${FONT};font-size:16px;font-weight:700;color:${C.accentDark};text-decoration:none;border-radius:12px;letter-spacing:0.3px;">${esc(cta.text)} &rarr;</a>
         </td></tr>
       </table>`
    : '';
  const ctaSubHtml = ctaSub ? `<div style="font-family:${FONT};font-size:12px;color:${C.mute};margin:12px 0 0;">${esc(ctaSub)}</div>` : '';

  // Trust row — equal columns, hairline top border.
  const trustHtml = trust && trust.length
    ? `<tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.border};"><tr>
         ${trust.map((t) => `<td align="center" style="padding:16px 6px;font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${C.mute};line-height:1.4;">${esc(t)}</td>`).join('')}
       </tr></table></td></tr>`
    : '';

  const noteHtml = note ? `<p style="margin:18px 0 0;color:${C.mute};font-size:13px;line-height:1.6;text-align:${ta};">${note}</p>` : '';
  const footer = footerLines.map((l) => `<div style="margin:0 0 5px;">${l}</div>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};font-size:1px;line-height:1px;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
  <tr><td align="center" style="padding:36px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${C.card};border:1px solid ${C.border};border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.5);">
      <!-- accent band -->
      <tr><td style="height:4px;font-size:0;line-height:0;background-color:${C.accent};background-image:linear-gradient(90deg,${C.accentDeep},${C.accent},${C.accentDeep});">&nbsp;</td></tr>
      <!-- header -->
      <tr><td style="background-color:${C.cardTop};padding:30px 40px 26px;text-align:center;border-bottom:1px solid ${C.border};">
        <div style="font-family:${FONT};font-size:15px;font-weight:800;letter-spacing:4px;color:${C.ink};">OPTIMIZED&nbsp;PERFORMANCE</div>
        <div style="font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:3px;color:${C.mute};margin-top:7px;text-transform:uppercase;">Research Peptides</div>
      </td></tr>
      <!-- body -->
      <tr><td style="padding:34px 40px 30px;font-family:${FONT};text-align:${ta};">
        ${eyebrowHtml}
        ${headingHtml}
        ${para}
        ${highlightHtml}
        ${extraHtml}
        ${ctaBlock}
        ${ctaSubHtml}
        ${noteHtml}
      </td></tr>
      ${trustHtml}
      <!-- footer -->
      <tr><td style="padding:22px 40px 30px;border-top:1px solid ${C.border};background-color:${C.cardTop};font-family:${FONT};font-size:12px;line-height:1.65;color:${C.mute};text-align:center;">
        ${footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
