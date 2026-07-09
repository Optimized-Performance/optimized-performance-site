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

// Syngyn black & gold (matches the storefront + label rebrand). Gold #F5A623,
// black bg, warm-tan/gray secondary text. Buttons = gold with BLACK text.
const C = {
  bg: '#000000', card: '#0A0A0B', cardTop: '#000000', border: '#2A2620',
  ink: '#F5F3EC', soft: '#C7B291', mute: '#8A8272',
  accent: '#F5A623', accentDeep: '#A66A12', accentDark: '#000000', accentBright: '#FCD667',
  hiBg: '#17110A', hiBorder: '#6B4A12', hiSoft: '#FCD667',
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://syngyn.co';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Exported for callers building rich content blocks (extraHtml) with customer
// data — always escape customer-supplied values (names, addresses) with this.
export function escapeHtml(s) { return esc(s); }
export const EMAIL_FONT = FONT;

// Reusable bordered detail table for transactional emails — order items,
// payment recipient/amount/memo, refund details. rows = [{ label, value,
// strong?, accent? }]; label/value are trusted inline HTML (escape customer
// values first). Left-aligned regardless of the email's align.
export function emailDetailTable(rows = []) {
  const cell = (extra) => `padding:12px 18px;font-family:${FONT};font-size:14px;${extra}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.border};border-radius:12px;overflow:hidden;margin:6px 0 18px;text-align:left;">
    ${rows.map((r, i) => {
      const bb = i < rows.length - 1 ? `border-bottom:1px solid ${C.border};` : '';
      const lc = r.strong ? C.ink : C.soft;
      const vc = r.accent ? C.accent : (r.strong ? C.ink : C.soft);
      const fw = r.strong ? 'font-weight:700;' : '';
      return `<tr><td style="${cell(`${bb}color:${lc};${fw}`)}">${r.label}</td><td align="right" style="${cell(`${bb}color:${vc};${fw}`)}">${r.value}</td></tr>`;
    }).join('')}
  </table>`;
}

// Product-showcase grid for marketing emails — 2-up cards, each: thumbnail,
// name (+ dosage), price (+ optional compareAt strikethrough), gold SHOP NOW
// button linking to the PDP. products = [{ name, dosage, price, compareAt?,
// imageUrl, url }]. Table-based + inline-styled for email clients.
export function emailProductGrid(products = [], { ctaText = 'Shop now' } = {}) {
  const list = (Array.isArray(products) ? products : []).filter((p) => p && p.url)
  if (!list.length) return ''
  const card = (p) => {
    if (!p) return `<td width="50%" bgcolor="${C.card}" style="padding:8px;background-color:${C.card};">&nbsp;</td>`
    const priceLine = p.compareAt && Number(p.compareAt) > Number(p.price)
      ? `<span style="color:${C.accentBright};font-weight:700;">$${Number(p.price).toFixed(2)}</span> <span style="color:${C.mute};text-decoration:line-through;font-size:13px;">$${Number(p.compareAt).toFixed(2)}</span>`
      : `<span style="color:${C.ink};font-weight:700;">$${Number(p.price).toFixed(2)}</span>`
    const img = p.imageUrl
      ? `<img src="${p.imageUrl}" alt="${esc(p.name)}" width="100%" style="width:100%;max-width:252px;height:auto;display:block;border-radius:10px;border:1px solid ${C.border};" />`
      : `<div style="height:180px;background:${C.card};border:1px solid ${C.border};border-radius:10px;"></div>`
    return `<td width="50%" valign="top" bgcolor="${C.card}" style="padding:8px;background-color:${C.card};">
      <a href="${p.url}" target="_blank" style="text-decoration:none;">${img}</a>
      <div style="font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};margin:12px 0 3px;">${esc(p.name)}${p.dosage ? ` <span style="color:${C.accent};font-size:12px;">${esc(p.dosage)}</span>` : ''}</div>
      <div style="font-family:${FONT};font-size:15px;margin:0 0 10px;">${priceLine}</div>
      <a href="${p.url}" target="_blank" style="display:inline-block;padding:9px 22px;background-color:${C.accent};color:${C.accentDark};font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:8px;">${esc(ctaText)}</a>
    </td>`
  }
  let rows = ''
  for (let i = 0; i < list.length; i += 2) {
    rows += `<tr>${card(list[i])}${card(list[i + 1])}</tr>`
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px;text-align:left;">${rows}</table>`
}

export function renderBrandedEmail({
  preheader = '', eyebrow = '', heading = '', align = 'left',
  paragraphs = [], highlight = null, extraHtml = '', heroImageUrl = '',
  cta = null, ctaSub = '', trust = [], note = '', footerLines = [],
} = {}) {
  const ta = align === 'center' ? 'center' : 'left';

  // Default brand hero header: any email without an explicit heroImageUrl falls
  // back to EMAIL_HERO_URL, so the designed banner heads every automated email.
  // Broadcasts still override per-send. Unset → the gold logo header (safe).
  const hero = heroImageUrl || process.env.EMAIL_HERO_URL || '';

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
         <tr><td align="center" style="border-radius:12px;background-color:${C.accent};background-image:linear-gradient(135deg,${C.accentBright},${C.accent});box-shadow:0 2px 14px rgba(245,166,35,0.3);">
           <a href="${cta.url}" target="_blank" style="display:inline-block;padding:16px 46px;font-family:${FONT};font-size:16px;font-weight:800;color:${C.accentDark};text-decoration:none;border-radius:12px;letter-spacing:0.3px;">${esc(cta.text)} &rarr;</a>
         </td></tr>
       </table>`
    : '';
  const ctaSubHtml = ctaSub ? `<div style="font-family:${FONT};font-size:12px;color:${C.mute};margin:12px 0 0;">${esc(ctaSub)}</div>` : '';

  // Trust row — equal columns, hairline top border.
  const trustHtml = trust && trust.length
    ? `<tr><td bgcolor="${C.card}" style="padding:0 28px;background-color:${C.card};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.border};"><tr>
         ${trust.map((t) => `<td align="center" style="padding:16px 6px;font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${C.mute};line-height:1.4;">${esc(t)}</td>`).join('')}
       </tr></table></td></tr>`
    : '';

  const noteHtml = note ? `<p style="margin:18px 0 0;color:${C.mute};font-size:13px;line-height:1.6;text-align:${ta};">${note}</p>` : '';
  const footer = footerLines.map((l) => `<div style="margin:0 0 5px;">${l}</div>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};font-size:1px;line-height:1px;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};background-color:${C.bg};">
  <tr><td align="center" bgcolor="${C.bg}" style="padding:36px 16px;background-color:${C.bg};">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="width:600px;max-width:100%;background:${C.card};background-color:${C.card};border:1px solid ${C.border};border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.5);">
      ${hero
        ? // Full-bleed hero (carries its own branding) — replaces band + logo.
          `<tr><td bgcolor="${C.card}" style="font-size:0;line-height:0;background-color:${C.card};"><img src="${hero}" alt="Syngyn" width="600" style="width:100%;max-width:600px;height:auto;display:block;border:0;outline:none;text-decoration:none;" /></td></tr>`
        : // Default: gold accent band + logo header.
          `<tr><td style="height:4px;font-size:0;line-height:0;background-color:${C.accent};background-image:linear-gradient(90deg,${C.accentDeep},${C.accent},${C.accentDeep});">&nbsp;</td></tr>
      <tr><td style="background-color:${C.cardTop};padding:28px 40px 24px;text-align:center;border-bottom:1px solid ${C.border};">
        <img src="${SITE_URL}/syngyn-logo.png" alt="Syngyn" width="180" style="width:180px;max-width:62%;height:auto;display:inline-block;border:0;outline:none;text-decoration:none;" />
        <div style="font-family:${FONT};font-size:10px;font-weight:600;letter-spacing:3px;color:${C.mute};margin-top:10px;text-transform:uppercase;">Analytical Reference Materials</div>
      </td></tr>`}
      <!-- body -->
      <tr><td bgcolor="${C.card}" style="padding:34px 40px 30px;background-color:${C.card};font-family:${FONT};text-align:${ta};">
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
      <tr><td bgcolor="${C.cardTop}" style="padding:22px 40px 30px;border-top:1px solid ${C.border};background-color:${C.cardTop};font-family:${FONT};font-size:12px;line-height:1.65;color:${C.mute};text-align:center;">
        ${footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
