// Branded HTML email layout — matches the storefront's dark aesthetic (deep
// near-black background, cream ink, cyan accent). Table-based + fully INLINE
// styles for email-client compatibility (clients strip <style>, ignore flex/
// grid, and don't load the site's custom fonts — so a web-safe stack + tables).
// Reusable across transactional + recovery emails: pass the content in.
//
// renderBrandedEmail({ preheader, heading, paragraphs[], cta:{text,url}, note, footerLines[] })
//   paragraphs / footerLines may contain trusted inline HTML (we control them);
//   heading / preheader / cta.text are escaped.

const C = {
  bg: '#0A0B0E', card: '#121418', border: '#24272D',
  ink: '#F5F3EC', soft: '#B6B4AC', mute: '#6E6D68', accent: '#22B8CF',
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderBrandedEmail({ preheader = '', heading = '', paragraphs = [], cta = null, note = '', footerLines = [] } = {}) {
  const para = paragraphs
    .map((p) => `<p style="margin:0 0 16px;color:${C.soft};font-size:15px;line-height:1.6;">${p}</p>`)
    .join('');

  // Bulletproof-ish button: a padded anchor on a rounded table cell. Renders
  // cleanly in Gmail/Apple Mail/mobile; degrades to a tappable link elsewhere.
  const ctaBlock = cta && cta.url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 6px;"><tr>
         <td align="center" style="border-radius:10px;background:${C.accent};">
           <a href="${cta.url}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${FONT};font-size:16px;font-weight:700;color:#06222a;text-decoration:none;border-radius:10px;letter-spacing:0.2px;">${esc(cta.text)} &rarr;</a>
         </td></tr></table>`
    : '';

  const noteBlock = note ? `<p style="margin:14px 0 0;color:${C.mute};font-size:13px;line-height:1.6;">${note}</p>` : '';
  const footer = footerLines.map((l) => `<div style="margin:0 0 5px;">${l}</div>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};font-size:1px;line-height:1px;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${C.card};border:1px solid ${C.border};border-radius:16px;overflow:hidden;">
      <tr><td style="padding:30px 36px 0;">
        <div style="font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:3px;color:${C.ink};">OPTIMIZED&nbsp;PERFORMANCE</div>
        <div style="height:2px;width:46px;background:${C.accent};margin-top:9px;font-size:0;line-height:0;">&nbsp;</div>
      </td></tr>
      <tr><td style="padding:24px 36px 32px;font-family:${FONT};">
        <h1 style="margin:0 0 16px;color:${C.ink};font-size:23px;line-height:1.3;font-weight:700;">${esc(heading)}</h1>
        ${para}
        ${ctaBlock}
        ${noteBlock}
      </td></tr>
      <tr><td style="padding:18px 36px 28px;border-top:1px solid ${C.border};font-family:${FONT};font-size:12px;line-height:1.6;color:${C.mute};">
        ${footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
