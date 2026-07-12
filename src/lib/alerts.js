// Alert utilities for inventory and order notifications
// Configure ALERT_EMAIL, TWILIO_*, and SENDGRID_API_KEY in environment variables to enable

import { RECOVERY_DISCOUNT_PCT } from './recovery-config';
import { renderBrandedEmail, emailDetailTable, escapeHtml, EMAIL_FONT } from './email-layout';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://syngyn.co';

// Shared footer for branded customer emails. Exported for the customer
// account emails (lib/customer-emails.js) so every customer-facing send
// carries the identical footer.
export function emailFooterLines() {
  return [
    `Syngyn${process.env.MARKETING_POSTAL_ADDRESS ? ' &middot; ' + process.env.MARKETING_POSTAL_ADDRESS : ''}`,
    `<a href="mailto:support@syngyn.co" style="color:#6E6D68;text-decoration:underline;">support@syngyn.co</a> &middot; (831) 218-5147`,
    `For research use only. Not for human consumption.`,
  ];
}

// Build the customer-facing order lookup URL with email pre-filled so the
// link in their email is one click — no retyping the order number or email
// to see status. The page still requires the email match server-side.
function orderLookupUrl(order) {
  if (!order?.order_number) return '';
  const params = new URLSearchParams();
  if (order.customer_email) params.set('email', order.customer_email);
  const qs = params.toString();
  return `${SITE_URL}/orders/${encodeURIComponent(order.order_number)}${qs ? '?' + qs : ''}`;
}

export async function sendEmailAlert(items, level) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const toEmail = process.env.ALERT_EMAIL;
  if (!apiKey || !toEmail) {
    console.log(`[alerts] Email alert skipped (not configured) — ${level}:`, items.map(i => i.product || i.sku).join(', '));
    return;
  }

  const subject = level === 'critical'
    ? `CRITICAL: ${items.length} product(s) at critical stock`
    : `Reorder Alert: ${items.length} product(s) need restocking`;

  const body = items.map(i =>
    `• ${i.product || i.sku} — ${i.stock} units remaining`
  ).join('\n');

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: process.env.FROM_EMAIL || 'alerts@syngyn.co' },
        subject,
        content: [{ type: 'text/plain', value: body }],
        // Click tracking OFF — consistent with customer/marketing sends; the
        // branded-link SSL (url####.syngyn.co) isn't provisioned.
        tracking_settings: { click_tracking: { enable: false, enable_text: false } },
      }),
    });
  } catch (err) {
    console.error('[alerts] Email send failed:', err.message);
  }
}

export async function sendSmsAlert(items, level) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const toNumber = process.env.ALERT_PHONE;
  if (!accountSid || !authToken || !fromNumber || !toNumber) {
    console.log(`[alerts] SMS alert skipped (not configured) — ${level}:`, items.map(i => i.product || i.sku).join(', '));
    return;
  }

  const prefix = level === 'critical' ? 'CRITICAL STOCK' : 'REORDER';
  const msg = `[OP ${prefix}] ${items.map(i => `${i.product || i.sku}: ${i.stock} left`).join(', ')}`;

  try {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: toNumber, From: fromNumber, Body: msg }),
    });
  } catch (err) {
    console.error('[alerts] SMS send failed:', err.message);
  }
}

// Best-effort carrier detection from tracking number formats.
// Returns a carrier name + a tracking URL the customer can click.
// Falls back to a universal tracker if format is unrecognized.
// USPS must be checked BEFORE FedEx: USPS IMpb numbers are 20-34 digits
// starting 92-95, which the bare FedEx length patterns also match.
export function detectCarrierAndUrl(tracking) {
  const t = String(tracking || '').replace(/\s/g, '').toUpperCase();
  if (!t) return { carrier: 'Carrier', url: '' };

  // UPS
  if (/^1Z[A-Z0-9]{16}$/.test(t)) {
    return { carrier: 'UPS', url: `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}` };
  }
  // USPS (IMpb: 20-34 digits starting 92-95, or 13-char international w/ letters)
  if (/^9[2-5]\d{18,32}$/.test(t) || /^[A-Z]{2}\d{9}US$/.test(t)) {
    return { carrier: 'USPS', url: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}` };
  }
  // FedEx (12, 15, 20, or 22 digits)
  if (/^\d{12}$|^\d{15}$|^\d{20}$|^\d{22}$/.test(t)) {
    return { carrier: 'FedEx', url: `https://www.fedex.com/fedextrack/?tracknumbers=${encodeURIComponent(t)}` };
  }
  // DHL Express
  if (/^\d{10}$|^\d{11}$/.test(t)) {
    return { carrier: 'DHL', url: `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(t)}` };
  }
  // Universal fallback (auto-detects carrier on the receiving side)
  return { carrier: 'Carrier', url: `https://parcelsapp.com/en/tracking/${encodeURIComponent(t)}` };
}

export async function sendShipmentNotification(order) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || !order.customer_email) {
    console.log('[alerts] Shipment notification skipped (not configured) — order:', order.order_number);
    return;
  }
  if (!order.tracking) {
    console.log('[alerts] Shipment notification skipped (no tracking) — order:', order.order_number);
    return;
  }

  const { carrier, url } = detectCarrierAndUrl(order.tracking);
  const lookupUrl = orderLookupUrl(order);

  const body = [
    `Your order has shipped.`,
    ``,
    `Order #: ${order.order_number}`,
    `Carrier: ${carrier}`,
    `Tracking #: ${order.tracking}`,
    url ? `Track: ${url}` : ``,
    lookupUrl ? `Order details: ${lookupUrl}` : ``,
    ``,
    `If anything is off when it arrives — wrong item, damage, missing pieces — email`,
    `support@syngyn.co or call (831) 218-5147 the same day.`,
    `Direct refunds are faster than disputes; please reach out to us first.`,
    ``,
    `Charge appears on your statement as: SYNGYN INC`,
    ``,
    `For research use only.`,
    `— Syngyn`,
  ].filter(Boolean).join('\n');

  const html = renderBrandedEmail({
    preheader: `Your order ${order.order_number} is on the way.`,
    eyebrow: 'On its way',
    heading: 'Your order has shipped',
    paragraphs: [`Order <strong style="color:#F5F3EC;">${escapeHtml(order.order_number)}</strong> is on its way via ${escapeHtml(carrier)}.`],
    extraHtml: emailDetailTable([
      { label: 'Carrier', value: escapeHtml(carrier) },
      { label: 'Tracking #', value: escapeHtml(order.tracking), strong: true },
    ]),
    cta: url ? { text: 'Track shipment', url } : (lookupUrl ? { text: 'View order', url: lookupUrl } : null),
    note: `Anything off when it arrives — wrong item, damage, missing pieces? Email support@syngyn.co or call (831) 218-5147 the same day. Direct refunds are faster than disputes — please reach out first. Charge appears as SYNGYN`,
    trust: ['Tracked delivery', 'COA-verified', 'Same-day support'],
    footerLines: emailFooterLines(),
  });

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: order.customer_email }] }],
        from: { email: process.env.FROM_EMAIL || 'orders@syngyn.co' },
        subject: `Shipped — ${order.order_number}`,
        content: [
          { type: 'text/plain', value: body },
          { type: 'text/html', value: html },
        ],
      }),
    });
  } catch (err) {
    console.error('[alerts] Shipment notification failed:', err.message);
  }
}

export async function sendDeliveryFollowup(order) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || !order.customer_email) {
    console.log('[alerts] Delivery follow-up skipped (not configured) — order:', order.order_number);
    return;
  }

  const { url } = detectCarrierAndUrl(order.tracking);

  const body = [
    `Just checking in — your order shipped about a week ago.`,
    ``,
    `Order #: ${order.order_number}`,
    order.tracking ? `Tracking #: ${order.tracking}` : '',
    url ? `Track: ${url}` : '',
    ``,
    `If it's already arrived, you can ignore this. If not, email`,
    `support@syngyn.co or call (831) 218-5147 and we'll`,
    `look into it. We'd much rather sort out a delivery issue together than`,
    `have you file a dispute with your card company.`,
    ``,
    `— Syngyn`,
  ].filter(Boolean).join('\n');

  const html = renderBrandedEmail({
    preheader: `Did order ${order.order_number} arrive OK?`,
    eyebrow: 'Checking in',
    heading: 'Did everything arrive OK?',
    paragraphs: [`Your order <strong style="color:#F5F3EC;">${escapeHtml(order.order_number)}</strong> shipped about a week ago — if it's already here, you can ignore this.`],
    extraHtml: order.tracking ? emailDetailTable([{ label: 'Tracking #', value: escapeHtml(order.tracking), strong: true }]) : '',
    cta: url ? { text: 'Track shipment', url } : null,
    note: `Not here yet? Email support@syngyn.co or call (831) 218-5147 and we'll look into it — we'd much rather sort out a delivery issue together than have you file a dispute.`,
    footerLines: emailFooterLines(),
  });

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: order.customer_email }] }],
        from: { email: process.env.FROM_EMAIL || 'orders@syngyn.co' },
        subject: `Checking in on order ${order.order_number}`,
        content: [
          { type: 'text/plain', value: body },
          { type: 'text/html', value: html },
        ],
      }),
    });
  } catch (err) {
    console.error('[alerts] Delivery follow-up failed:', err.message);
  }
}

// Sent ~1 hour after an instant-rail order stalls in 'awaiting_payment' (the
// checkout was started but the card/PayPal/crypto capture never landed — a
// timeout, a bail, a closed tab). Goal: recapture the missed sale. Offers an
// extra discount via a one-click recovery link that pre-applies it at checkout
// and stacks on top of whatever affiliate code the customer wants to use.
// `recoverUrl` is built by the cron with a signed token (lib/recovery).
export async function sendPaymentRecoveryNudge(order, recoverUrl) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || !order.customer_email) {
    console.log('[alerts] Payment-recovery nudge skipped (not configured) — order:', order.order_number);
    return;
  }
  if (!recoverUrl) {
    console.log('[alerts] Payment-recovery nudge skipped (no recover URL) — order:', order.order_number);
    return;
  }

  const body = [
    `Hey — looks like you started an order with us but didn't finish.`,
    ``,
    `No worries, your spot's still here — and to make it easy, here's`,
    `${RECOVERY_DISCOUNT_PCT}% off your order, applied automatically when you click through.`,
    ``,
    `Finish your order (discount applied automatically):`,
    `${recoverUrl}`,
    ``,
    `Prefer not to use a card? You can also pay with Zelle or crypto for an`,
    `additional discount at checkout.`,
    ``,
    `Questions or want a hand? Reply to this email or call (831) 218-5147.`,
    ``,
    `For research use only.`,
    `— Syngyn`,
  ].join('\n');

  // Branded HTML version (matches the storefront). Plain-text above stays as the
  // multipart fallback for clients that don't render HTML.
  const html = renderBrandedEmail({
    preheader: `Your order's still saved — here's ${RECOVERY_DISCOUNT_PCT}% off to finish up.`,
    align: 'center',
    eyebrow: 'Your cart is waiting',
    heading: 'Pick up where you left off',
    paragraphs: [
      `You started an order but didn't finish — no rush, your spot is still saved. Here's a little extra to make wrapping up easy.`,
    ],
    highlight: {
      label: 'Save',
      value: `${RECOVERY_DISCOUNT_PCT}% OFF`,
      sub: 'Applied automatically at checkout',
    },
    cta: { text: 'Complete your order', url: recoverUrl },
    ctaSub: 'Discount applied automatically at checkout.',
    trust: ['Encrypted checkout', 'Ships in 1 business day', 'COA-verified'],
    note: `Prefer not to use a card? Pay with Zelle or crypto for an additional discount. Questions? Just reply to this email or call (831) 218-5147.`,
    footerLines: [
      `Syngyn${process.env.MARKETING_POSTAL_ADDRESS ? ' &middot; ' + process.env.MARKETING_POSTAL_ADDRESS : ''}`,
      `<a href="mailto:support@syngyn.co" style="color:#6E6D68;text-decoration:underline;">support@syngyn.co</a> &middot; (831) 218-5147`,
      `For research use only. Not for human consumption.`,
    ],
  });

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: order.customer_email }] }],
        from: { email: process.env.FROM_EMAIL || 'orders@syngyn.co', name: 'Syngyn' },
        reply_to: { email: 'support@syngyn.co' },
        subject: `Still want these? Here's ${RECOVERY_DISCOUNT_PCT}% off to finish up`,
        content: [
          { type: 'text/plain', value: body },
          { type: 'text/html', value: html },
        ],
      }),
    });
  } catch (err) {
    console.error('[alerts] Payment-recovery nudge failed:', err.message);
  }
}

// Used by the email bot for both auto-replies (after classification) and
// admin-approved drafts (from the Inbox tab).
export async function sendCustomerReply({ to_email, subject, body, reply_to }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error('SENDGRID_API_KEY not configured');
  if (!to_email || !subject || !body) throw new Error('to_email, subject, body required');

  const fromEmail = process.env.FROM_EMAIL || 'orders@syngyn.co';
  const replyTo = reply_to || 'support@syngyn.co';

  // BCC the admin mailbox on every customer reply (manual + bot auto-replies) so
  // there's a record of what went out in our OWN inbox. SendGrid sends never hit
  // the Gmail "Sent" folder, which made replies look like they'd failed; this
  // gives one auditable copy. SendGrid rejects a personalization where the same
  // address is in both `to` and `bcc`, so skip the BCC if they collide.
  const bccEmail = process.env.REPLY_BCC_EMAIL || replyTo;
  const personalization = { to: [{ email: to_email }] };
  if (bccEmail && bccEmail.toLowerCase() !== String(to_email).toLowerCase()) {
    personalization.bcc = [{ email: bccEmail }];
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [personalization],
      from: { email: fromEmail, name: 'Syngyn' },
      reply_to: { email: replyTo },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`SendGrid send failed ${res.status}: ${errText.slice(0, 300)}`);
  }
  return true;
}

export async function sendRefundNotification(order, { amount, reason }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || !order.customer_email) {
    console.log('[alerts] Refund notification skipped (not configured) — order:', order.order_number);
    return;
  }

  const refundAmount = Number(amount || order.refund_amount || order.total || 0).toFixed(2);
  const lookupUrl = orderLookupUrl(order);
  const body = [
    `Your order has been refunded.`,
    ``,
    `Order #: ${order.order_number}`,
    `Refund amount: $${refundAmount}`,
    reason ? `Reason: ${reason}` : ``,
    lookupUrl ? `Order details: ${lookupUrl}` : ``,
    ``,
    `The refund has been initiated to your original payment method. It typically posts`,
    `to your statement within 5–10 business days, depending on your bank.`,
    ``,
    `If you don't see the refund within that window, email`,
    `support@syngyn.co with your order number and we'll look it up.`,
    ``,
    `— Syngyn`,
  ].filter(Boolean).join('\n');

  const html = renderBrandedEmail({
    preheader: `Refund of $${refundAmount} processed for order ${order.order_number}.`,
    align: 'center',
    eyebrow: 'Refund processed',
    heading: 'Your refund is on the way',
    paragraphs: [`We've refunded order <strong style="color:#F5F3EC;">${escapeHtml(order.order_number)}</strong> to your original payment method. It typically posts within 5–10 business days, depending on your bank.`],
    highlight: { label: 'Refunded', value: `$${refundAmount}`, sub: reason ? escapeHtml(reason) : 'To your original payment method' },
    cta: lookupUrl ? { text: 'View order', url: lookupUrl } : null,
    note: `Don't see it within that window? Email support@syngyn.co with your order number and we'll look it up.`,
    footerLines: emailFooterLines(),
  });

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: order.customer_email }] }],
        from: { email: process.env.FROM_EMAIL || 'orders@syngyn.co' },
        subject: `Refund processed — ${order.order_number}`,
        content: [
          { type: 'text/plain', value: body },
          { type: 'text/html', value: html },
        ],
      }),
    });
  } catch (err) {
    console.error('[alerts] Refund notification failed:', err.message);
  }
}

export async function sendOrderConfirmation(order) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || !order.customer_email) {
    console.log('[alerts] Order confirmation skipped (not configured) — order:', order.order_number);
    return;
  }

  const itemLines = order.items.map(i =>
    `• ${i.name || i.sku} x${i.quantity} — $${(i.price * i.quantity).toFixed(2)}`
  ).join('\n');

  const lookupUrl = orderLookupUrl(order);

  // Rebrand transition notice — products ship with the pre-rebrand logo/labels
  // while stock catches up. Default ON; set REBRAND_NOTICE=false in the env to
  // drop it once the new labels are on everything.
  const showRebrandNotice = process.env.REBRAND_NOTICE !== 'false';
  const rebrandNotice = `Heads-up during our rebrand: your order may arrive with our previous (pre-Syngyn) logo and labels while we transition our packaging. The product inside is exactly the same, COA-verified — thanks for bearing with us through this transition.`;

  const body = [
    `Thank you for your order!`,
    ``,
    `Order #: ${order.order_number}`,
    ``,
    itemLines,
    ``,
    `Total: $${order.total.toFixed(2)}`,
    ``,
    `Shipping to: ${order.shipping_address}, ${order.city}, ${order.state} ${order.zip}${order.country && order.country !== 'US' ? ', ' + order.country : ''}`,
    ``,
    showRebrandNotice ? rebrandNotice : ``,
    showRebrandNotice ? `` : ``,
    lookupUrl ? `Track this order: ${lookupUrl}` : ``,
    lookupUrl ? `` : ``,
    `For research use only.`,
    `— Syngyn`,
  ].filter(Boolean).join('\n');

  const detailsHtml = emailDetailTable([
    ...order.items.map((i) => ({
      label: `${escapeHtml(i.name || i.sku)} <span style="color:#6E6D68;">&times;${i.quantity}</span>`,
      value: `$${(i.price * i.quantity).toFixed(2)}`,
    })),
    { label: 'Total', value: `$${order.total.toFixed(2)}`, strong: true, accent: true },
  ]) + `<div style="font-family:${EMAIL_FONT};font-size:13px;color:#6E6D68;line-height:1.5;">Shipping to: ${escapeHtml(order.shipping_address)}, ${escapeHtml(order.city)}, ${escapeHtml(order.state)} ${escapeHtml(order.zip)}${order.country && order.country !== 'US' ? ', ' + escapeHtml(order.country) : ''}</div>`;
  const html = renderBrandedEmail({
    preheader: `Order ${order.order_number} confirmed — thank you!`,
    eyebrow: 'Order confirmed',
    heading: 'Thank you for your order',
    paragraphs: [
      `We've got it — order <strong style="color:#F5F3EC;">${escapeHtml(order.order_number)}</strong> is confirmed, and we'll ship within 1 business day.`,
      ...(showRebrandNotice ? [rebrandNotice] : []),
    ],
    extraHtml: detailsHtml,
    cta: lookupUrl ? { text: 'Track your order', url: lookupUrl } : null,
    trust: ['Ships in 1 business day', 'COA-verified', 'Encrypted checkout'],
    footerLines: emailFooterLines(),
  });

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: order.customer_email }] }],
        from: { email: process.env.FROM_EMAIL || 'orders@syngyn.co' },
        subject: `Order Confirmed — ${order.order_number}`,
        content: [
          { type: 'text/plain', value: body },
          { type: 'text/html', value: html },
        ],
      }),
    });
  } catch (err) {
    console.error('[alerts] Order confirmation failed:', err.message);
  }
}

// Internal owner alert — fires on every completed sale (from finalizeOrder).
// Recipients come from ORDER_ALERT_TO (comma-separated: Matt + Tris), falling
// back to ALERT_EMAIL so a missing env var still reaches at least the operator.
// Fire-and-forget: never throws, never blocks finalization.
export async function sendOrderCompletedOwnerAlert(order) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const recipients = (process.env.ORDER_ALERT_TO || process.env.ALERT_EMAIL || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!apiKey || recipients.length === 0) {
    console.log('[alerts] Owner sale alert skipped (not configured) — order:', order.order_number);
    return;
  }

  const total = Number(order.total || 0).toFixed(2);
  const items = Array.isArray(order.items) ? order.items : [];
  const itemLines = items.map((i) => `• ${i.name || i.sku} x${i.quantity} — $${((Number(i.price) || 0) * (Number(i.quantity) || 0)).toFixed(2)}`).join('\n');
  const rail = order.payment_method || 'unknown';
  const ref = order.affiliate_code ? order.affiliate_code : 'DIRECT';

  const body = [
    `New completed sale — $${total}`,
    ``,
    `Order #: ${order.order_number}`,
    `Customer: ${order.customer_name || ''} (${order.customer_email || ''})`,
    `Rail: ${rail} · Ref: ${ref}`,
    ``,
    itemLines,
    ``,
    `Total: $${total}`,
    `Ship to: ${order.shipping_address || ''}, ${order.city || ''}, ${order.state || ''} ${order.zip || ''}${order.country && order.country !== 'US' ? ', ' + order.country : ''}`,
  ].join('\n');

  const detailsHtml = emailDetailTable([
    ...items.map((i) => ({
      label: `${escapeHtml(i.name || i.sku)} <span style="color:#6E6D68;">&times;${i.quantity}</span>`,
      value: `$${((Number(i.price) || 0) * (Number(i.quantity) || 0)).toFixed(2)}`,
    })),
    { label: 'Total', value: `$${total}`, strong: true, accent: true },
    { label: 'Rail', value: escapeHtml(rail) },
    { label: 'Ref', value: escapeHtml(ref) },
  ]) + `<div style="font-family:${EMAIL_FONT};font-size:13px;color:#6E6D68;line-height:1.5;">${escapeHtml(order.customer_name || '')} &middot; ${escapeHtml(order.customer_email || '')}<br/>Ship to: ${escapeHtml(order.shipping_address || '')}, ${escapeHtml(order.city || '')}, ${escapeHtml(order.state || '')} ${escapeHtml(order.zip || '')}${order.country && order.country !== 'US' ? ', ' + escapeHtml(order.country) : ''}</div>`;
  const html = renderBrandedEmail({
    preheader: `New sale ${order.order_number} — $${total}`,
    eyebrow: 'Internal · New sale',
    heading: `New sale — $${total}`,
    paragraphs: [`Order <strong style="color:#F5F3EC;">${escapeHtml(order.order_number)}</strong> just completed.`],
    extraHtml: detailsHtml,
    footerLines: emailFooterLines(),
  });

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: recipients.map((email) => ({ email })) }],
        from: { email: process.env.FROM_EMAIL || 'orders@syngyn.co', name: 'Syngyn Sales' },
        subject: `New sale — ${order.order_number} — $${total}`,
        content: [
          { type: 'text/plain', value: body },
          { type: 'text/html', value: html },
        ],
        tracking_settings: { click_tracking: { enable: false, enable_text: false } },
      }),
    });
  } catch (err) {
    console.error('[alerts] Owner sale alert failed:', err.message);
  }
}

// Sent at order creation when paymentMethod === 'zelle'. Customer needs the
// recipient + amount + memo to complete payment from their bank app.
// Recipient is the Zelle identifier registered against BoA-1990; defaults to
// the admin@ email so a missing env var doesn't break the flow.
export const ZELLE_RECIPIENT = process.env.ZELLE_RECIPIENT || 'support@syngyn.co';

export async function sendZelleInstructions(order) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || !order.customer_email) {
    console.log('[alerts] Zelle instructions skipped (not configured) — order:', order.order_number);
    return;
  }

  const body = [
    `Your order is reserved — complete it with a Zelle payment.`,
    ``,
    `Order #: ${order.order_number}`,
    `Amount: $${Number(order.total).toFixed(2)}`,
    ``,
    `In your bank's Zelle screen, send to:`,
    `  ${ZELLE_RECIPIENT}`,
    ``,
    `IMPORTANT: put your order number in the memo so we can match the`,
    `payment to your order:`,
    `  ${order.order_number}`,
    ``,
    `Once we see the deposit (usually within a few hours during business`,
    `days), we'll confirm your order and ship within 1 business day.`,
    ``,
    `If you don't complete the Zelle within 72 hours, your order will be`,
    `cancelled and any reserved inventory released.`,
    ``,
    `Questions: reply to this email or call (831) 218-5147.`,
    ``,
    `For research use only.`,
    `— Syngyn`,
  ].join('\n');

  const html = renderBrandedEmail({
    preheader: `Send your Zelle to complete order ${order.order_number}.`,
    align: 'center',
    eyebrow: 'Almost done',
    heading: 'Complete your Zelle payment',
    paragraphs: [`Your order is reserved. Send the Zelle below from your bank app — we'll ship within 1 business day of the deposit landing.`],
    extraHtml: `<div style="text-align:center;margin:2px 0 18px;"><img src="${SITE_URL}/zelle-qr.png" alt="Scan with your bank app to pay Syngyn Inc by Zelle" width="220" style="width:220px;max-width:72%;height:auto;border-radius:12px;border:1px solid #24272D;background:#ffffff;padding:6px;"><div style="font-family:${EMAIL_FONT};font-size:12px;color:#6E6D68;margin-top:9px;">Scan with your bank app, or send manually below</div></div>` + emailDetailTable([
      { label: 'Send to', value: escapeHtml(ZELLE_RECIPIENT), strong: true },
      { label: 'Amount', value: `$${Number(order.total).toFixed(2)}`, strong: true, accent: true },
      { label: 'Memo (required)', value: escapeHtml(order.order_number), strong: true },
    ]),
    note: `Put your order number in the Zelle memo so we can match the payment. Order is reserved up to 72 hours, then released. Questions? Reply or call (831) 218-5147.`,
    footerLines: emailFooterLines(),
  });

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: order.customer_email }] }],
        from: { email: process.env.FROM_EMAIL || 'orders@syngyn.co' },
        subject: `Complete your Zelle payment — ${order.order_number}`,
        content: [
          { type: 'text/plain', value: body },
          { type: 'text/html', value: html },
        ],
      }),
    });
  } catch (err) {
    console.error('[alerts] Zelle instructions failed:', err.message);
  }
}

// Sent at order creation when paymentMethod === 'venmo'. Mirrors the Zelle
// flow — recipient + amount + memo so the customer can complete from the
// Venmo app. Handle is the Venmo Business username registered to BoA-1990;
// default kept stable so a missing env var doesn't break the flow.
export const VENMO_BUSINESS_HANDLE = process.env.VENMO_BUSINESS_HANDLE || 'optimizedperformance';

export async function sendVenmoInstructions(order) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || !order.customer_email) {
    console.log('[alerts] Venmo instructions skipped (not configured) — order:', order.order_number);
    return;
  }

  const body = [
    `Your order is reserved — complete it with a Venmo payment.`,
    ``,
    `Order #: ${order.order_number}`,
    `Amount: $${Number(order.total).toFixed(2)}`,
    ``,
    `Open the Venmo app and send to:`,
    `  @${VENMO_BUSINESS_HANDLE}`,
    ``,
    `IMPORTANT: put ONLY your order number in the note field so we can`,
    `match the payment to your order:`,
    `  ${order.order_number}`,
    ``,
    `Pay from your Venmo balance, bank account, or debit card — all free.`,
    `Credit card funding adds a 3% Venmo fee paid by you (not Optimized`,
    `Performance).`,
    ``,
    `Once we confirm the payment (usually within a few hours during`,
    `business days), we'll ship within 1 business day.`,
    ``,
    `If you don't complete the Venmo within 72 hours, your order will be`,
    `cancelled and any reserved inventory released.`,
    ``,
    `Questions: reply to this email or call (831) 218-5147.`,
    ``,
    `For research use only.`,
    `— Syngyn`,
  ].join('\n');

  const venmoUrl = `https://venmo.com/?txn=pay&audience=private&recipients=${VENMO_BUSINESS_HANDLE}&amount=${Number(order.total).toFixed(2)}&note=${encodeURIComponent(order.order_number)}`;
  const html = renderBrandedEmail({
    preheader: `Send your Venmo to complete order ${order.order_number}.`,
    align: 'center',
    eyebrow: 'Almost done',
    heading: 'Complete your Venmo payment',
    paragraphs: [`Your order is reserved. Tap below to open Venmo with the amount and note prefilled — we'll ship within 1 business day of payment landing.`],
    extraHtml: emailDetailTable([
      { label: 'Send to', value: `@${escapeHtml(VENMO_BUSINESS_HANDLE)}`, strong: true },
      { label: 'Amount', value: `$${Number(order.total).toFixed(2)}`, strong: true, accent: true },
      { label: 'Note (required)', value: escapeHtml(order.order_number), strong: true },
    ]),
    cta: { text: 'Open Venmo', url: venmoUrl },
    ctaSub: 'Opens the app with the amount + note prefilled.',
    note: `Put ONLY your order number in the note. Pay from balance, bank, or debit (free); credit-card funding adds Venmo's 3% fee. Reserved up to 72 hours. Questions? Reply or call (831) 218-5147.`,
    footerLines: emailFooterLines(),
  });

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: order.customer_email }] }],
        from: { email: process.env.FROM_EMAIL || 'orders@syngyn.co' },
        subject: `Complete your Venmo payment — ${order.order_number}`,
        content: [
          { type: 'text/plain', value: body },
          { type: 'text/html', value: html },
        ],
      }),
    });
  } catch (err) {
    console.error('[alerts] Venmo instructions failed:', err.message);
  }
}
