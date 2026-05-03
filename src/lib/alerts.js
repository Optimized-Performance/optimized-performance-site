// Alert utilities for inventory and order notifications
// Configure ALERT_EMAIL, TWILIO_*, and SENDGRID_API_KEY in environment variables to enable

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
        from: { email: process.env.FROM_EMAIL || 'alerts@optimizedperformancepeptides.com' },
        subject,
        content: [{ type: 'text/plain', value: body }],
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
function detectCarrierAndUrl(tracking) {
  const t = String(tracking || '').replace(/\s/g, '').toUpperCase();
  if (!t) return { carrier: 'Carrier', url: '' };

  // UPS
  if (/^1Z[A-Z0-9]{16}$/.test(t)) {
    return { carrier: 'UPS', url: `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}` };
  }
  // FedEx (12, 15, 20, or 22 digits)
  if (/^\d{12}$|^\d{15}$|^\d{20}$|^\d{22}$/.test(t)) {
    return { carrier: 'FedEx', url: `https://www.fedex.com/fedextrack/?tracknumbers=${encodeURIComponent(t)}` };
  }
  // USPS (most: 20-22 digits, or 13-char w/ letters)
  if (/^9[2-5]\d{20}$/.test(t) || /^[A-Z]{2}\d{9}US$/.test(t)) {
    return { carrier: 'USPS', url: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}` };
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

  const body = [
    `Your order has shipped.`,
    ``,
    `Order #: ${order.order_number}`,
    `Carrier: ${carrier}`,
    `Tracking #: ${order.tracking}`,
    url ? `Track: ${url}` : ``,
    ``,
    `If anything is off when it arrives — wrong item, damage, missing pieces — email`,
    `admin@optimizedperformancepeptides.com or call (831) 218-5147 the same day.`,
    `Direct refunds are faster than disputes; please reach out to us first.`,
    ``,
    `Charge appears on your statement as: OPTIMIZED PERFORMANCE INC`,
    ``,
    `For research use only.`,
    `— Optimized Performance`,
  ].filter(Boolean).join('\n');

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: order.customer_email }] }],
        from: { email: process.env.FROM_EMAIL || 'orders@optimizedperformancepeptides.com' },
        subject: `Shipped — ${order.order_number}`,
        content: [{ type: 'text/plain', value: body }],
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
    `admin@optimizedperformancepeptides.com or call (831) 218-5147 and we'll`,
    `look into it. We'd much rather sort out a delivery issue together than`,
    `have you file a dispute with your card company.`,
    ``,
    `— Optimized Performance`,
  ].filter(Boolean).join('\n');

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: order.customer_email }] }],
        from: { email: process.env.FROM_EMAIL || 'orders@optimizedperformancepeptides.com' },
        subject: `Checking in on order ${order.order_number}`,
        content: [{ type: 'text/plain', value: body }],
      }),
    });
  } catch (err) {
    console.error('[alerts] Delivery follow-up failed:', err.message);
  }
}

// Used by the email bot for both auto-replies (after classification) and
// admin-approved drafts (from the Inbox tab).
export async function sendCustomerReply({ to_email, subject, body, reply_to }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error('SENDGRID_API_KEY not configured');
  if (!to_email || !subject || !body) throw new Error('to_email, subject, body required');

  const fromEmail = process.env.FROM_EMAIL || 'orders@optimizedperformancepeptides.com';
  const replyTo = reply_to || 'admin@optimizedperformancepeptides.com';

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to_email }] }],
      from: { email: fromEmail, name: 'Optimized Performance' },
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

export async function sendOrderConfirmation(order) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || !order.customer_email) {
    console.log('[alerts] Order confirmation skipped (not configured) — order:', order.order_number);
    return;
  }

  const itemLines = order.items.map(i =>
    `• ${i.name || i.sku} x${i.quantity} — $${(i.price * i.quantity).toFixed(2)}`
  ).join('\n');

  const body = [
    `Thank you for your order!`,
    ``,
    `Order #: ${order.order_number}`,
    ``,
    itemLines,
    ``,
    `Total: $${order.total.toFixed(2)}`,
    ``,
    `Shipping to: ${order.shipping_address}, ${order.city}, ${order.state} ${order.zip}`,
    ``,
    `For research use only.`,
    `— Optimized Performance`,
  ].join('\n');

  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: order.customer_email }] }],
        from: { email: process.env.FROM_EMAIL || 'orders@optimizedperformancepeptides.com' },
        subject: `Order Confirmed — ${order.order_number}`,
        content: [{ type: 'text/plain', value: body }],
      }),
    });
  } catch (err) {
    console.error('[alerts] Order confirmation failed:', err.message);
  }
}
