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
        from: { email: process.env.FROM_EMAIL || 'alerts@optimizedperformance.com' },
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
        from: { email: process.env.FROM_EMAIL || 'orders@optimizedperformance.com' },
        subject: `Order Confirmed — ${order.order_number}`,
        content: [{ type: 'text/plain', value: body }],
      }),
    });
  } catch (err) {
    console.error('[alerts] Order confirmation failed:', err.message);
  }
}
