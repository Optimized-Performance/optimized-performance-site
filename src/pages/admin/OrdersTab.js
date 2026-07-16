import { Fragment, useEffect, useState } from 'react';
import { calcCommission } from '../../lib/commission';

// localStorage key for the most recent ShipCheer export's order_numbers.
// Used by Bulk Tracking Paste so admin can paste tracking #s in row order
// without re-selecting which orders. Persists across page reloads.
const SHIPCHEER_SNAPSHOT_KEY = 'opp_shipcheer_last_export';

// Forward-flow status order. 'cancelled' is a terminal state reached via the
// Cancel button, not part of the normal progression.
const STATUSES = ['pending', 'packed', 'shipped', 'fulfilled'];
const ALL_STATUSES = [...STATUSES, 'cancelled'];

// Chosen shipping tier → packing-desk label (v36). Speed the customer paid for;
// every order ships insulated + ice pack regardless.
const SHIPPING_METHOD_LABELS = {
  ground: 'Ground (UPS Ground)',
  twoday: '2-Day (UPS 2nd Day Air)',
  overnight: 'Overnight (UPS Next Day Air)',
  canada: 'Canada ($50 flat)',
};
const STATUS_LABELS = {
  pending: 'Pending',
  packed: 'Packed',
  shipped: 'Shipped',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
};
const STATUS_CLASSES = {
  pending: 'bg-warning/10 text-warning border-warning/30',
  packed: 'bg-accent-soft text-accent-strong border-accent/30',
  shipped: 'bg-ink/10 text-ink border-ink/30',
  fulfilled: 'bg-success/10 text-success border-success/30',
  cancelled: 'bg-danger/10 text-danger border-danger/30',
};

// Velocity-engine output. Set by /api/orders/create from src/lib/fraud-checks.js.
// 'flagged' = soft trigger, payment allowed, admin should review pre-ship.
// 'blocked' = hard trigger (24h address velocity), no payment processed.
// 'cleared' = admin reviewed and approved for fulfillment.
const FRAUD_REASON_LABELS = {
  address_velocity_24h_other_identity:
    '24h address velocity — same shipping address as a different customer in the last day',
  address_velocity_30d_other_identity:
    '30d address velocity — same shipping address as a different customer in the last month',
  ip_velocity_24h_multi_address:
    'IP velocity — same source IP placing orders to multiple addresses',
  email_pattern_low_trust:
    'Low-trust email pattern — letters-only firstname+lastname on a free provider (synthetic-identity signature)',
  velocity_check_error:
    'Velocity check failed at order time — verify this order manually',
};

// Preorder helpers — operate on the per-item metadata persisted in the orders
// table's items JSON column (set by /api/orders/create from the checkout flow).
function hasPreorderItems(order) {
  return (order?.items || []).some((item) => item?.isPreorder);
}

function getPreorderItems(order) {
  return (order?.items || []).filter((item) => item?.isPreorder);
}

function latestPreorderShipDateISO(order) {
  const dates = getPreorderItems(order)
    .map((item) => item.preorderShipDate)
    .filter(Boolean);
  if (dates.length === 0) return null;
  // ISO YYYY-MM-DD strings sort lexicographically as dates
  return [...dates].sort()[dates.length - 1];
}

function formatShipDate(iso) {
  if (!iso) return null;
  try {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

// "Ready to ship" is a derived filter — paid + clean fraud + not yet
// shipped/fulfilled/cancelled. Mirrors the eligibility logic on the server-
// side ShipCheer export and pick list endpoints so all three views agree.
function isReadyToShip(order) {
  if (order.payment_status !== 'completed') return false;
  if (order.fraud_status === 'blocked') return false;
  const status = order.fulfillment_status || 'pending';
  return !['shipped', 'fulfilled', 'cancelled'].includes(status);
}

// "Awaiting Zelle" — payment_method='zelle' AND payment_status='pending'.
// These are the orders to reconcile against incoming Zelle deposits in
// BoA-1990. One-click "Mark Zelle Paid" runs the same finalizePaidOrder
// helper as the card + crypto webhooks.
function isAwaitingZelle(order) {
  return order.payment_method === 'zelle' && order.payment_status === 'pending';
}

// "Awaiting Venmo" — same shape as Zelle, against Venmo Business deposits
// (@optimizedperformance → daily sweep to BoA-1990). One-click "Mark Venmo
// Paid" runs the same finalizePaidOrder helper.
function isAwaitingVenmo(order) {
  return order.payment_method === 'venmo' && order.payment_status === 'pending';
}

// "Awaiting Payment" — instant-rail orders that haven't been captured yet
// (paypal/card/crypto). v17 split these out of 'pending' so the verification
// queue isn't polluted by abandoned carts. Webhook will flip to 'completed',
// or the 48h sweep cron flips to 'abandoned'.
function isAwaitingPayment(order) {
  return order.payment_status === 'awaiting_payment';
}

// "Abandoned" — awaiting_payment orders that aged out at 48h without a
// capture webhook. Kept for cart-abandonment analytics + fraud forensics.
function isAbandoned(order) {
  return order.payment_status === 'abandoned';
}

export default function OrdersTab({ products = [], showSaveMsg, token }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ready_to_ship');
  const [preorderOnly, setPreorderOnly] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pickListOpen, setPickListOpen] = useState(false);
  const [pickListData, setPickListData] = useState(null);
  const [pickListLoading, setPickListLoading] = useState(false);
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkPasteSnapshot, setBulkPasteSnapshot] = useState(null);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [bulkPasteSubmitting, setBulkPasteSubmitting] = useState(false);

  // Manual order entry (off-platform Zelle/Venmo/cash payments).
  const MANUAL_FORM_BLANK = {
    name: '', email: '', address: '', city: '', state: '', zip: '',
    affiliateCode: '', paymentMethod: 'zelle', priceOverride: '', sendConfirmation: true,
    lines: [{ productId: '', quantity: 1 }],
  };
  const [labelBuying, setLabelBuying] = useState(null); // order id mid-purchase (Shippo)
  const [resending, setResending] = useState(null); // { id, kind } mid-resend
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualForm, setManualForm] = useState(MANUAL_FORM_BLANK);

  // Order editing (add/remove items → recompute → invoice the balance or comp).
  const [editOrder, setEditOrder] = useState(null);      // the order being edited (null = closed)
  const [addrEdit, setAddrEdit] = useState(null);        // { orderId, name, address, city, state, zip } | null
  const [addrSaving, setAddrSaving] = useState(false);
  const [editLines, setEditLines] = useState([]);        // [{ id, sku, name, price, quantity, comp }]
  const [editChargeMethod, setEditChargeMethod] = useState('card');
  const [editSendInvoice, setEditSendInvoice] = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editAddSku, setEditAddSku] = useState('');

  // Windowing-lite: only render the first N rows of the filtered list. "All"
  // holds hundreds of orders; rendering every one as a block card made mobile
  // Safari drop frames compositing the scroll ("jumps around" on the All
  // filter while short filters were smooth). Show-more appends in pages.
  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, preorderOnly]);

  useEffect(() => {
    fetchOrders();
  }, []);

  // Sellable products for the manual-order picker (exclude nothing — admin can
  // enter any catalog SKU, incl. preorder/coming-soon).
  const manualCatalogSubtotal = manualForm.lines.reduce((sum, line) => {
    const p = products.find((x) => x.id === line.productId);
    return sum + (p ? p.price * (parseInt(line.quantity) || 0) : 0);
  }, 0);

  function setManualField(field, value) {
    setManualForm((f) => ({ ...f, [field]: value }));
  }
  function setManualLine(idx, field, value) {
    setManualForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)),
    }));
  }
  function addManualLine() {
    setManualForm((f) => ({ ...f, lines: [...f.lines, { productId: '', quantity: 1 }] }));
  }
  function removeManualLine(idx) {
    setManualForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
  }

  // ── order editing ──────────────────────────────────────────────────────────
  function openEdit(order) {
    setEditOrder(order);
    setEditLines(
      (order.items || []).map((it) => ({
        id: it.id,
        sku: it.sku,
        name: it.name,
        price: Number(it.price) || 0,
        quantity: Number(it.quantity) || 1,
        comp: !!it.comp,
      }))
    );
    setEditChargeMethod('card');
    setEditSendInvoice(true);
    setEditAddSku('');
  }
  function setEditLine(idx, field, value) {
    setEditLines((lines) => lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }
  function removeEditLine(idx) {
    setEditLines((lines) => lines.filter((_, i) => i !== idx));
  }
  function addEditLine() {
    const p = products.find((x) => x.id === editAddSku);
    if (!p) return;
    setEditLines((lines) => {
      const existing = lines.findIndex((l) => l.id === p.id);
      if (existing >= 0) return lines.map((l, i) => (i === existing ? { ...l, quantity: l.quantity + 1 } : l));
      return [...lines, { id: p.id, sku: p.sku, name: p.dosage ? `${p.name} ${p.dosage}` : p.name, price: Number(p.price) || 0, quantity: 1, comp: false }];
    });
    setEditAddSku('');
  }
  // Client-side ITEMS subtotal estimate for the modal only (non-comp lines).
  // The authoritative total, discounts, shipping + balance are computed
  // server-side on save — this is just a sanity preview.
  const editSubtotalEst = editLines.reduce((s, l) => s + (l.comp ? 0 : (Number(l.price) || 0) * (parseInt(l.quantity, 10) || 0)), 0);
  const editPaid = editOrder ? (Number(editOrder.amount_paid || 0) || Number(editOrder.total || 0)) : 0;
  const editBalanceEst = Math.max(0, editSubtotalEst - editPaid);

  async function submitEdit() {
    if (!editOrder || editSubmitting) return;
    const items = editLines
      .filter((l) => (l.id || l.sku) && (parseInt(l.quantity, 10) || 0) > 0)
      .map((l) => ({ id: l.id, sku: l.sku, quantity: parseInt(l.quantity, 10), comp: !!l.comp }));
    if (items.length === 0) {
      showSaveMsg('An order needs at least one item. To empty it, refund/cancel instead.');
      return;
    }
    setEditSubmitting(true);
    try {
      const res = await fetch('/api/admin/orders/edit', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: editOrder.id, items, chargeMethod: editChargeMethod, sendInvoice: editSendInvoice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showSaveMsg(`Edit failed: ${data.error || res.status}`);
        setEditSubmitting(false);
        return;
      }
      await fetchOrders({ silent: true });
      showSaveMsg(data.message || 'Order updated.');
      setEditOrder(null);
    } catch (e) {
      showSaveMsg(`Edit failed: ${e.message}`);
    }
    setEditSubmitting(false);
  }

  // Shipping-address edit — replaces the paper-notes workflow when a customer
  // sends a corrected address. Server validates against the order's country
  // (US state / CA province+postal) and stamps edit_history.
  function startAddrEdit(order) {
    setAddrEdit({
      orderId: order.id,
      name: order.customer_name || '',
      address: order.shipping_address || '',
      city: order.city || '',
      state: order.state || '',
      zip: order.zip || '',
    });
  }

  async function saveAddrEdit(order) {
    if (!addrEdit || addrSaving) return;
    const { name, address, city, state, zip } = addrEdit;
    if (!name.trim() || !address.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      showSaveMsg('Fill in recipient name and the full address.');
      return;
    }
    setAddrSaving(true);
    try {
      const res = await fetch('/api/admin/orders/edit-address', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: order.id, name, address, city, state, zip }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showSaveMsg(`Address edit failed: ${data.error || res.status}`);
        setAddrSaving(false);
        return;
      }
      await fetchOrders({ silent: true });
      showSaveMsg(data.message || 'Shipping address updated.');
      setAddrEdit(null);
    } catch (e) {
      showSaveMsg(`Address edit failed: ${e.message}`);
    }
    setAddrSaving(false);
  }

  async function markBalancePaid(order) {
    if (!window.confirm(`Confirm you've received the outstanding balance for ${order.order_number} (Zelle/Venmo/cash)? This settles it back to Paid.`)) return;
    try {
      const res = await fetch('/api/admin/orders/mark-balance-paid', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: order.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showSaveMsg(`Failed: ${data.error || res.status}`);
        return;
      }
      await fetchOrders({ silent: true });
      showSaveMsg(data.message || 'Balance settled.');
    } catch (e) {
      showSaveMsg(`Failed: ${e.message}`);
    }
  }

  async function submitManualOrder() {
    if (manualSubmitting) return;
    const items = manualForm.lines
      .filter((l) => l.productId && (parseInt(l.quantity) || 0) > 0)
      .map((l) => ({ id: l.productId, quantity: parseInt(l.quantity) }));
    if (items.length === 0) {
      showSaveMsg('Add at least one product line.');
      return;
    }
    if (!manualForm.email || !manualForm.name || !manualForm.address || !manualForm.city || !manualForm.state || !manualForm.zip) {
      showSaveMsg('Fill in customer name, email, and full shipping address.');
      return;
    }
    setManualSubmitting(true);
    try {
      const res = await fetch('/api/admin/orders/create-manual', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: manualForm.name,
          email: manualForm.email,
          address: manualForm.address,
          city: manualForm.city,
          state: manualForm.state,
          zip: manualForm.zip,
          items,
          affiliateCode: manualForm.affiliateCode.trim() || undefined,
          paymentMethod: manualForm.paymentMethod,
          priceOverride: manualForm.priceOverride.trim() || undefined,
          sendConfirmation: manualForm.sendConfirmation,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showSaveMsg(`Manual order failed: ${data.error || res.status}`);
        setManualSubmitting(false);
        return;
      }
      await fetchOrders({ silent: true });
      setManualOpen(false);
      setManualForm(MANUAL_FORM_BLANK);
      showSaveMsg(
        `Manual order ${data.order_number} created ($${Number(data.total).toFixed(2)}` +
        `${data.affiliate_code ? `, ${data.affiliate_code} credited` : ''}` +
        `${data.emailed ? ', customer emailed' : ', no email sent'}). Inventory decremented.`
      );
    } catch (err) {
      showSaveMsg(`Manual order failed: ${err.message}`);
    }
    setManualSubmitting(false);
  }

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-admin-token': token || '',
    };
  }

  // silent: refresh the data WITHOUT unmounting the table. Every action used
  // to call the loud version — the whole list swapped to "Loading…", the page
  // height collapsed, and scroll slammed to the top on every Mark Paid /
  // Cancel / status move (the mobile "scrolling jumps around" complaint).
  // Rows keep their identity (key=order.id) so the refreshed data lands in
  // place and the viewport doesn't move.
  async function fetchOrders({ silent = false } = {}) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/admin/orders', { headers: authHeaders() });
      if (res.ok) setOrders(await res.json());
    } catch {
      /* fail */
    }
    if (!silent) setLoading(false);
  }

  async function updateStatus(orderId, newStatus) {
    try {
      await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: orderId, status: newStatus }),
      });
      await fetchOrders({ silent: true });
      showSaveMsg(`Order moved to ${STATUS_LABELS[newStatus]}.`);
    } catch {
      /* fail */
    }
  }

  async function updateTracking(orderId, tracking) {
    try {
      await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: orderId, tracking }),
      });
      setOrders(orders.map((o) => (o.id === orderId ? { ...o, tracking } : o)));
    } catch {
      /* fail */
    }
  }

  // Manually re-send a customer email (confirmation or tracking) — the
  // "I never got it" support case. Courtesy copy; changes no order state.
  async function resendEmail(order, kind) {
    setResending({ id: order.id, kind });
    try {
      const res = await fetch('/api/admin/orders/resend-email', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ order_number: order.order_number, kind }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showSaveMsg && showSaveMsg(`Resend failed: ${data.error || `HTTP ${res.status}`}`);
      } else {
        showSaveMsg && showSaveMsg(`${kind === 'confirmation' ? 'Confirmation' : 'Tracking'} email sent to ${data.to}`);
      }
    } catch (e) {
      showSaveMsg && showSaveMsg(`Resend failed: ${e.message}`);
    }
    setResending(null);
  }

  // Buy a real USPS label via Shippo (replaces the ShipCheer CSV hop):
  // charges the Shippo account, stamps tracking + label_url, opens the PDF.
  async function buyShippoLabel(order) {
    if (!window.confirm(`Buy a shipping label for ${order.order_number}? Uses UPS 2nd Day Air (USPS Priority if UPS isn't available for this address) and charges the Shippo account.`)) return;
    setLabelBuying(order.id);
    try {
      const res = await fetch('/api/admin/orders/shippo-label', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ order_number: order.order_number }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showSaveMsg && showSaveMsg(`Label failed: ${data.error || `HTTP ${res.status}`}`);
      } else {
        showSaveMsg && showSaveMsg(`Label bought — ${data.service} $${Number(data.cost || 0).toFixed(2)}${data.warning ? ` · ${data.warning}` : ''}`);
        if (data.label_url) window.open(data.label_url, '_blank', 'noopener');
        await fetchOrders({ silent: true });
      }
    } catch (e) {
      showSaveMsg && showSaveMsg(`Label failed: ${e.message}`);
    }
    setLabelBuying(null);
  }

  async function cancelOrder(orderId) {
    if (!window.confirm('Mark this order as cancelled? (Records are preserved for audit. Use Refund & Cancel if customer was charged.)')) return;
    try {
      await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: orderId, status: 'cancelled' }),
      });
      await fetchOrders({ silent: true });
    } catch {
      /* fail */
    }
  }

  // Refund a paid order. Full refund (amount = order total) cancels the
  // fulfillment as well; partial refund (amount < order total) leaves the
  // order open so it ships normally — used for sale-discount corrections,
  // shipping adjustments, broken-item credits, etc. Records OPP-side
  // bookkeeping and emails the customer either way. The processor-side
  // refund (PayPal/Bankful/NOWPayments) is still done manually via the
  // processor's dashboard.
  async function refundAndCancel(order) {
    const defaultAmt = Number(order.total || 0).toFixed(2);
    const amtStr = window.prompt(
      `Refund amount for order ${order.order_number}? Full total = $${defaultAmt}. Enter a smaller number for partial refund (order stays open and ships normally).`,
      defaultAmt
    );
    if (amtStr === null) return;
    const amount = parseFloat(amtStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      showSaveMsg('Invalid refund amount.');
      return;
    }
    const isPartial = amount < Number(order.total || 0) - 0.01;
    const reason = window.prompt(
      'Refund reason (audit log + appears in customer email if non-empty):',
      ''
    );
    if (reason === null) return;
    const confirmMsg = isPartial
      ? `Partial refund of $${amount.toFixed(2)} on order ${order.order_number}?\n\n` +
        `Order remains open and will ship normally. Customer is emailed about the refund. ` +
        `Process the actual refund via your payment processor's dashboard (PayPal/Bankful/etc.) if you haven't already.`
      : `Full refund of $${amount.toFixed(2)} on order ${order.order_number}?\n\n` +
        `This cancels the order, records the refund in OPP, and emails the customer. ` +
        `Process the actual refund via your payment processor's dashboard if you haven't already.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/admin/orders/refund', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: order.id, amount, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        showSaveMsg(`Refund failed: ${data.error || res.status}`);
        return;
      }
      await fetchOrders({ silent: true });
      const successPrefix = isPartial
        ? `Partial refund of $${amount.toFixed(2)} recorded on ${order.order_number} (order stays open).`
        : `Refunded $${amount.toFixed(2)} on ${order.order_number} (order cancelled).`;
      showSaveMsg(
        `${successPrefix} Customer notified. Process the processor-side refund if not already done.`
      );
    } catch (err) {
      showSaveMsg(`Refund failed: ${err.message}`);
    }
  }

  // Mark a Zelle order as paid after admin has visually confirmed the deposit
  // in BoA-1990. Runs the same finalizePaidOrder helper as the card + crypto
  // webhooks (inventory decrement, affiliate stats, customer confirmation email).
  async function markZellePaid(order) {
    const expected = Number(order.total || 0).toFixed(2);
    if (!window.confirm(
      `Mark order ${order.order_number} as paid?\n\n` +
      `Expected deposit: $${expected}\n` +
      `Customer email: ${order.customer_email}\n\n` +
      `Confirm you've seen a Zelle deposit in BoA-1990 for this amount with this order number in the memo. ` +
      `This decrements inventory, updates affiliate stats, and emails the customer.`
    )) return;
    try {
      await markPaid('mark-zelle-paid', order, 'Zelle');
    } catch {}
  }

  // Mark a Venmo order as paid after admin has visually confirmed the deposit
  // in the Venmo Business app (@optimizedperformance). Same finalize helper
  // as Zelle/card/crypto — confirms first because this is destructive (fires
  // customer email + decrements inventory).
  async function markVenmoPaid(order) {
    const expected = Number(order.total || 0).toFixed(2);
    if (!window.confirm(
      `Mark order ${order.order_number} as paid?\n\n` +
      `Expected deposit: $${expected}\n` +
      `Customer email: ${order.customer_email}\n\n` +
      `Confirm you've seen a Venmo deposit on @optimizedperformance for this amount with this order number in the note. ` +
      `This decrements inventory, updates affiliate stats, and emails the customer.`
    )) return;
    try {
      await markPaid('mark-venmo-paid', order, 'Venmo');
    } catch {}
  }

  // Manually mark a stuck instant-rail order (crypto/card in 'awaiting_payment')
  // as paid. The case this exists for: an UNDERPAID crypto invoice — NOWPayments
  // returns 'partially_paid', our webhook parks it for manual review by design,
  // and no dedicated button covers it. Also handles a confirmed-but-unfired
  // webhook. Bypasses payment verification, so the confirm copy is explicit.
  async function markPaidManual(order) {
    const expected = Number(order.total || 0).toFixed(2);
    if (!window.confirm(
      `Manually mark order ${order.order_number} as PAID?\n\n` +
      `Method: ${order.payment_method || '—'} · Expected: $${expected}\n` +
      `Customer: ${order.customer_email}\n\n` +
      `Use this for a stuck "Awaiting" crypto/card order — e.g. an underpaid crypto invoice you've reviewed, or a payment you've confirmed in the processor dashboard that never flipped the order. ` +
      `This BYPASSES payment verification — only confirm after you've verified the funds. It decrements inventory, updates affiliate stats, and emails the customer.`
    )) return;
    try {
      await markPaid('mark-paid', order, 'manual');
    } catch {}
  }

  // Shared submit path for the manual-confirmation endpoints (Zelle, Venmo,
  // generic mark-paid, future P2P rails). Keeps the network + error-surface
  // logic in one place.
  async function markPaid(endpoint, order, rail) {
    try {
      const res = await fetch(`/api/admin/orders/${endpoint}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: order.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        showSaveMsg(`Mark paid failed: ${data.error || res.status}`);
        return;
      }
      await fetchOrders({ silent: true });
      showSaveMsg(`${order.order_number} marked paid. Customer notified.`);
    } catch (err) {
      showSaveMsg(`Mark paid failed: ${err.message}`);
    }
  }

  async function clearFraudFlag(orderId) {
    if (!window.confirm('Mark fraud flag as cleared? Order will be treated as verified for fulfillment.')) return;
    try {
      await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: orderId, fraud_status: 'cleared' }),
      });
      await fetchOrders({ silent: true });
      showSaveMsg('Fraud flag cleared.');
    } catch {
      /* fail */
    }
  }

  function applyFilters(list) {
    let out;
    if (filter === 'all') out = list;
    else if (filter === 'ready_to_ship') out = list.filter(isReadyToShip);
    else if (filter === 'awaiting_zelle') out = list.filter(isAwaitingZelle);
    else if (filter === 'awaiting_venmo') out = list.filter(isAwaitingVenmo);
    else if (filter === 'awaiting_payment') out = list.filter(isAwaitingPayment);
    else if (filter === 'abandoned') out = list.filter(isAbandoned);
    else out = list.filter((o) => (o.fulfillment_status || 'pending') === filter);
    if (preorderOnly) out = out.filter(hasPreorderItems);
    return out;
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible(visibleOrders) {
    setSelectedIds((prev) => {
      const visibleIds = visibleOrders.map((o) => o.id);
      const allSelected = visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelected() {
    setSelectedIds(new Set());
  }

  // Bulk-advance every selected order to packed in parallel. The server
  // PATCH endpoint is single-order, so we fan out — fine at week-1 volume.
  // Refresh once at the end to repaint with new statuses.
  async function markSelectedPacked() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Mark ${selectedIds.size} order(s) as Packed?`)) return;
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch('/api/admin/orders', {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ id, status: 'packed' }),
          })
        )
      );
      clearSelected();
      await fetchOrders({ silent: true });
      showSaveMsg(`${ids.length} order(s) moved to Packed.`);
    } catch (err) {
      showSaveMsg(`Bulk packed failed: ${err.message}`);
    }
  }

  async function openPickList() {
    setPickListOpen(true);
    setPickListLoading(true);
    setPickListData(null);
    try {
      const res = await fetch('/api/admin/orders/picklist', { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showSaveMsg(`Pick list failed: ${err.error || res.status}`);
        setPickListOpen(false);
        setPickListLoading(false);
        return;
      }
      const data = await res.json();
      setPickListData(data);
    } catch (err) {
      showSaveMsg(`Pick list failed: ${err.message}`);
      setPickListOpen(false);
    }
    setPickListLoading(false);
  }

  function printPickList() {
    if (!pickListData) return;
    // Open in new window with print-friendly inline styles. Keeps the
    // packing-station printout decoupled from the in-app modal styles.
    const w = window.open('', '_blank');
    if (!w) {
      showSaveMsg('Pop-up blocked. Allow pop-ups for the admin domain to print.');
      return;
    }
    const groups = pickListData.groups || [];
    const packOrders = pickListData.orders || [];
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!DOCTYPE html><html><head><title>OPP Pick List</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
        h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; color: #444; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 28px; }
        ul { list-style: none; padding: 0; }
        li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 4px; border-bottom: 1px solid #eee; }
        .check { display: inline-block; width: 18px; height: 18px; border: 1.5px solid #444; vertical-align: middle; margin-right: 8px; flex-shrink: 0; }
        .name { font-weight: 600; }
        .meta-line { font-size: 11px; color: #777; }
        .qty { font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
        .packout { page-break-before: always; }
        .order-block { border: 1.5px solid #444; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; page-break-inside: avoid; }
        .order-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-bottom: 6px; }
        .order-name { font-size: 16px; font-weight: 700; }
        .order-meta { font-size: 11px; color: #666; text-align: right; }
        .order-block li { padding: 5px 0; border-bottom: 1px dotted #ddd; }
        .order-block li:last-child { border-bottom: none; }
        .kit-note { font-size: 11px; color: #555; font-weight: 600; }
        .packed-line { margin-top: 8px; font-size: 12px; color: #444; display: flex; align-items: center; }
      </style></head><body>
      <h1>Syngyn — Pick List</h1>
      <div class="meta">${pickListData.order_count} order(s) · ${pickListData.total_vials} vials total · generated ${new Date(pickListData.generated_at).toLocaleString()}</div>
      ${groups.map((g) => `
        <h2>${esc(g.category)}</h2>
        <ul>
          ${g.items.map((it) => `
            <li>
              <div><span class="check"></span><span class="name">${esc(it.name)} ${esc(it.dosage)}</span>
                <div class="meta-line">${esc(it.sku)}${it.kit_count ? ` · ${it.kit_count} kit assembl${it.kit_count === 1 ? 'y' : 'ies'}` : ''}${it.individual_count ? `${it.kit_count ? ' · ' : ' · '}${it.individual_count} loose` : ''}</div>
              </div>
              <div class="qty">${it.vials} vials</div>
            </li>`).join('')}
        </ul>
      `).join('')}
      ${packOrders.length ? `
      <div class="packout">
        <h1>Pack-out by order</h1>
        <div class="meta">${packOrders.length} box(es) · oldest order first — tracks the label stack top-to-bottom</div>
        ${packOrders.map((o) => `
          <div class="order-block">
            <div class="order-head">
              <span class="order-name">${esc(o.customer_name)}</span>
              <span class="order-meta">${esc(o.order_number)}<br/>${esc(o.city)}${o.city && o.state ? ', ' : ''}${esc(o.state)}${o.country && o.country !== 'US' ? ` · ${esc(o.country)}` : ''}${o.shipping_method ? ` · ${esc(SHIPPING_METHOD_LABELS[o.shipping_method] || o.shipping_method)}` : ''}</span>
            </div>
            <ul>
              ${o.items.map((it) => `
                <li>
                  <div><span class="check"></span><span class="name">${it.quantity} × ${esc(it.name)}</span>
                    ${it.vials ? `<span class="kit-note"> — assemble ${it.vials} vials</span>` : ''}
                  </div>
                </li>`).join('')}
            </ul>
            <div class="packed-line"><span class="check"></span> Boxed + label matched</div>
          </div>
        `).join('')}
      </div>` : ''}
      <script>setTimeout(() => window.print(), 200);</script>
      </body></html>`;
    w.document.write(html);
    w.document.close();
  }

  function openBulkPaste() {
    let snapshot = null;
    try {
      const raw = localStorage.getItem(SHIPCHEER_SNAPSHOT_KEY);
      if (raw) snapshot = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    if (!snapshot || !Array.isArray(snapshot.order_numbers) || snapshot.order_numbers.length === 0) {
      showSaveMsg('No recent ShipCheer export found. Click "ShipCheer CSV" first to snapshot the queue.');
      return;
    }
    setBulkPasteSnapshot(snapshot);
    setBulkPasteText('');
    setBulkPasteOpen(true);
  }

  async function applyBulkPaste() {
    if (!bulkPasteSnapshot) return;
    const lines = bulkPasteText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const orderNumbers = bulkPasteSnapshot.order_numbers;
    if (lines.length !== orderNumbers.length) {
      showSaveMsg(`Tracking count (${lines.length}) doesn't match snapshot order count (${orderNumbers.length}). Confirm row order before pasting.`);
      return;
    }
    const assignments = orderNumbers.map((order_number, i) => ({ order_number, tracking: lines[i] }));
    setBulkPasteSubmitting(true);
    try {
      const res = await fetch('/api/admin/orders/bulk-ship', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ assignments }),
      });
      const data = await res.json();
      if (!res.ok) {
        showSaveMsg(`Bulk ship failed: ${data.error || res.status}`);
        setBulkPasteSubmitting(false);
        return;
      }
      const s = data.summary;
      showSaveMsg(
        `Shipped ${s.shipped}, updated ${s.updated}, not_found ${s.not_found}, errors ${s.errors}. ` +
        (s.shipped > 0 ? 'Customer ship emails fired.' : '')
      );
      // Clear the snapshot so the same batch can't be re-applied accidentally.
      try { localStorage.removeItem(SHIPCHEER_SNAPSHOT_KEY); } catch {}
      setBulkPasteOpen(false);
      setBulkPasteText('');
      setBulkPasteSnapshot(null);
      await fetchOrders({ silent: true });
    } catch (err) {
      showSaveMsg(`Bulk ship failed: ${err.message}`);
    }
    setBulkPasteSubmitting(false);
  }

  // Download a ShipCheer-compatible CSV of paid + not-yet-shipped orders.
  // Server applies the eligibility filter (payment_status, fraud_status,
  // fulfillment_status); the file imports cleanly into ShipCheer Batch
  // Import. Don't use a plain <a href> because the endpoint requires the
  // x-admin-token header — we fetch then push a blob download.
  async function exportShipCheerCSV() {
    try {
      const res = await fetch('/api/admin/orders/export-shipcheer', { headers: authHeaders() });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        showSaveMsg(`ShipCheer export failed: ${errBody.error || res.status}`);
        return;
      }
      // Snapshot the order_numbers from the response header so the Bulk
      // Tracking Paste step can match tracking #s back to orders by row.
      const orderNumbersHeader = res.headers.get('X-OPP-ShipCheer-OrderNumbers') || '';
      const orderNumbers = orderNumbersHeader.split(',').map((s) => s.trim()).filter(Boolean);
      try {
        localStorage.setItem(
          SHIPCHEER_SNAPSHOT_KEY,
          JSON.stringify({ order_numbers: orderNumbers, exported_at: new Date().toISOString() })
        );
      } catch {
        /* ignore quota */
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `shipcheer-${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showSaveMsg(`ShipCheer CSV exported (${orderNumbers.length} orders snapshotted). Drag into ShipCheer → after labels print, use Bulk Tracking Paste.`);
    } catch (err) {
      showSaveMsg(`ShipCheer export failed: ${err.message}`);
    }
  }

  function exportCSV() {
    const filtered = applyFilters(orders);
    const headers = ['Order #', 'Payment', 'Status', 'Date', 'Customer', 'Email', 'Address', 'City', 'State', 'ZIP', 'Country', 'Items', 'Has Preorder', 'Preorder Ship Date', 'Subtotal', 'Discount', 'Shipping', 'Total', 'Refund Amount', 'Refunded At', 'Refund Reason', 'Affiliate Code', 'Commission %', 'Tracking', 'Notes'];
    const rows = filtered.map((o) => [
      o.order_number, o.payment_status || '', STATUS_LABELS[o.fulfillment_status || 'pending'],
      new Date(o.created_at).toLocaleDateString(), o.customer_name, o.customer_email,
      o.shipping_address || '', o.city || '', o.state || '', o.zip || '', o.country || 'US',
      (o.items || []).map((i) => `${i.name} x${i.quantity}${i.isPreorder ? ' [PREORDER]' : ''}`).join('; '),
      hasPreorderItems(o) ? 'YES' : 'no',
      latestPreorderShipDateISO(o) || '',
      Number(o.subtotal || 0).toFixed(2), Number(o.discount || 0).toFixed(2),
      Number(o.shipping || 0).toFixed(2),
      Number(o.total || 0).toFixed(2),
      o.refund_amount ? Number(o.refund_amount).toFixed(2) : '',
      o.refunded_at ? new Date(o.refunded_at).toLocaleDateString() : '',
      o.refund_reason || '',
      o.affiliate_code || '',
      o.affiliate_commission_pct || '', o.tracking || '', o.notes || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${filter}${preorderOnly ? '-preorder' : ''}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = applyFilters(orders);
  // Rendered slice (windowing-lite — see visibleCount above). Selection-all,
  // counts, and CSV export intentionally keep using the FULL filtered list.
  const visibleRows = filtered.slice(0, visibleCount);
  const counts = {
    all: orders.length,
    ready_to_ship: orders.filter(isReadyToShip).length,
    awaiting_zelle: orders.filter(isAwaitingZelle).length,
    awaiting_venmo: orders.filter(isAwaitingVenmo).length,
    awaiting_payment: orders.filter(isAwaitingPayment).length,
    abandoned: orders.filter(isAbandoned).length,
  };
  ALL_STATUSES.forEach((st) => {
    counts[st] = orders.filter((o) => (o.fulfillment_status || 'pending') === st).length;
  });
  const preorderCount = orders.filter(hasPreorderItems).length;
  const visibleSelectedCount = filtered.filter((o) => selectedIds.has(o.id)).length;
  const allVisibleSelected = filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id));

  return (
    <>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <h2 className="font-display font-semibold tracking-display text-xl m-0 text-ink">Orders</h2>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary text-xs px-4 py-2" onClick={() => setManualOpen(true)} title="Record an off-platform order (Zelle/Venmo/cash paid directly). Creates the order, decrements inventory, credits the affiliate, and optionally emails the customer.">
            + New Manual Order
          </button>
          <button className="btn-outline text-xs px-4 py-2" onClick={fetchOrders}>Refresh</button>
          <button className="btn-outline text-xs px-4 py-2" onClick={openPickList} title="Aggregate vials needed across the ready-to-ship queue, grouped by category">
            Pick list
          </button>
          <button className="btn-outline text-xs px-4 py-2" onClick={exportShipCheerCSV} title="Download paid, not-yet-shipped orders in ShipCheer Batch Import format. Snapshots the queue for Bulk Tracking Paste.">
            ShipCheer CSV
          </button>
          <button className="btn-outline text-xs px-4 py-2" onClick={openBulkPaste} title="Paste tracking numbers (newline-separated, in same row order as the most recent ShipCheer export) to mark batch shipped + fire ship emails.">
            Bulk tracking paste
          </button>
          <button className="btn-outline text-xs px-4 py-2" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mb-5">
        {STATUSES.map((st) => (
          <button
            key={st}
            onClick={() => setFilter(filter === st ? 'all' : st)}
            className={`card-premium p-5 text-left transition-colors ${
              filter === st ? 'border-ink' : 'hover:border-ink'
            }`}
          >
            <div className="font-display font-semibold tracking-display text-2xl text-ink">{counts[st]}</div>
            <div className="opp-meta-mono uppercase mt-1">{STATUS_LABELS[st]}</div>
          </button>
        ))}
        <button
          onClick={() => setPreorderOnly(!preorderOnly)}
          className={`card-premium p-5 text-left transition-colors ${
            preorderOnly ? 'border-accent-strong' : 'hover:border-ink'
          }`}
        >
          <div className="font-display font-semibold tracking-display text-2xl text-accent-strong">
            {preorderCount}
          </div>
          <div className="opp-meta-mono uppercase mt-1">Preorder</div>
        </button>
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap items-center">
        <button
          key="ready_to_ship"
          onClick={() => setFilter('ready_to_ship')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            filter === 'ready_to_ship'
              ? 'bg-accent-strong text-surface border-accent-strong'
              : 'bg-accent-soft text-accent-strong border-accent/40 hover:border-accent-strong'
          }`}
          title="Paid, clean fraud, not yet shipped — the active fulfillment queue"
        >
          ★ Ready to ship ({counts.ready_to_ship})
        </button>
        {counts.awaiting_zelle > 0 && (
          <button
            key="awaiting_zelle"
            onClick={() => setFilter('awaiting_zelle')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === 'awaiting_zelle'
                ? 'bg-warning text-surface border-warning'
                : 'bg-warning/10 text-warning border-warning/40 hover:border-warning'
            }`}
            title="Zelle orders awaiting payment confirmation — match against BoA-1990 deposits then click Mark Zelle Paid"
          >
            ⏱ Awaiting Zelle ({counts.awaiting_zelle})
          </button>
        )}
        {counts.awaiting_venmo > 0 && (
          <button
            key="awaiting_venmo"
            onClick={() => setFilter('awaiting_venmo')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === 'awaiting_venmo'
                ? 'bg-warning text-surface border-warning'
                : 'bg-warning/10 text-warning border-warning/40 hover:border-warning'
            }`}
            title="Venmo orders awaiting payment confirmation — match against @optimizedperformance deposits then click Mark Venmo Paid"
          >
            ⏱ Awaiting Venmo ({counts.awaiting_venmo})
          </button>
        )}
        {counts.awaiting_payment > 0 && (
          <button
            key="awaiting_payment"
            onClick={() => setFilter('awaiting_payment')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === 'awaiting_payment'
                ? 'bg-ink/10 text-ink border-ink'
                : 'bg-surface text-ink-soft border-line hover:border-ink'
            }`}
            title="Instant-rail orders (PayPal/card/crypto) created but not yet captured. Webhook will finalize or 48h cron will mark abandoned. Not a verification queue — informational."
          >
            ◌ Awaiting Payment ({counts.awaiting_payment})
          </button>
        )}
        {counts.abandoned > 0 && (
          <button
            key="abandoned"
            onClick={() => setFilter('abandoned')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === 'abandoned'
                ? 'bg-ink-mute/20 text-ink-mute border-ink-mute'
                : 'bg-surface text-ink-mute border-line hover:border-ink-mute'
            }`}
            title="Awaiting-payment orders that timed out at 48h. Kept for cart-abandonment analytics."
          >
            ✕ Abandoned ({counts.abandoned})
          </button>
        )}
        {['all', ...ALL_STATUSES].map((st) => (
          <button
            key={st}
            onClick={() => setFilter(st)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === st ? 'bg-ink text-paper border-ink' : 'bg-surface text-ink-soft border-line hover:border-ink'
            }`}
          >
            {st === 'all' ? `All (${counts.all})` : `${STATUS_LABELS[st]} (${counts[st]})`}
          </button>
        ))}
        <span className="opp-meta-mono text-ink-mute mx-2">·</span>
        <button
          onClick={() => setPreorderOnly(!preorderOnly)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            preorderOnly
              ? 'bg-accent-strong text-surface border-accent-strong'
              : 'bg-surface text-ink-soft border-line hover:border-ink'
          }`}
        >
          {preorderOnly ? '✓ ' : ''}Preorder only ({preorderCount})
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-3 p-3 rounded-opp bg-accent-soft border border-accent/40 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-ink">
            <strong>{selectedIds.size}</strong> selected
            {visibleSelectedCount !== selectedIds.size && (
              <span className="opp-meta-mono text-ink-mute ml-2">
                ({visibleSelectedCount} visible in current filter)
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="text-[11px] font-semibold px-3 py-1.5 rounded-opp border border-accent-strong bg-accent-strong text-surface hover:opacity-90"
              onClick={markSelectedPacked}
            >
              Mark {selectedIds.size} as Packed
            </button>
            <button
              className="text-[11px] px-3 py-1.5 rounded-opp border border-line text-ink-soft hover:border-ink"
              onClick={clearSelected}
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-ink-mute m-0">Loading…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[15px] text-ink-soft m-0">No {filter === 'all' ? '' : filter + ' '}orders</p>
            <p className="opp-meta-mono mt-1 m-0">Orders created through checkout will appear here.</p>
          </div>
        ) : (
          <table className="orders-table w-full border-collapse text-[13px]">
            <thead className="bg-surfaceAlt">
              <tr>
                <th className="px-3 py-3 border-b border-line w-8" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => toggleSelectAllVisible(visibleRows)}
                    title={allVisibleSelected ? 'Clear all visible' : 'Select all visible'}
                    className="cursor-pointer"
                  />
                </th>
                {['Order #', 'Date', 'Customer', 'Items', 'Total', 'Payment', 'Status', 'Tracking', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute border-b border-line"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((order) => {
                const status = order.fulfillment_status || 'pending';
                const isExpanded = expandedId === order.id;
                const nextStatus = STATUSES[STATUSES.indexOf(status) + 1];
                const items = order.items || [];
                const orderHasPreorders = hasPreorderItems(order);
                const orderLatestShip = formatShipDate(latestPreorderShipDateISO(order));

                return (
                  <Fragment key={order.id}>
                    <tr
                      className={`border-t border-line cursor-pointer hover:bg-surfaceAlt transition-colors ${
                        orderHasPreorders ? 'bg-accent-soft/30' : ''
                      } ${selectedIds.has(order.id) ? 'bg-accent-soft/40' : ''}`}
                      onClick={() => {
                        // Touch devices get the explicit "Manage order" button
                        // instead — whole-row tap-to-expand meant stray thumb
                        // taps while flick-scrolling expanded/collapsed cards
                        // under the finger and the list jumped mid-scroll.
                        if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return;
                        setExpandedId(isExpanded ? null : order.id);
                      }}
                    >
                      <td className="px-3 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(order.id)}
                          onChange={() => toggleSelected(order.id)}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-ink">
                        <div className="flex items-center gap-2 flex-wrap">
                          {order.order_number}
                          {orderHasPreorders && (
                            <span
                              className="text-[10px] font-bold tracking-[0.1em] px-1.5 py-0.5 rounded-sm bg-accent-strong text-surface"
                              title={orderLatestShip ? `Preorder · ships ~${orderLatestShip}` : 'Preorder · ship date TBD'}
                            >
                              PREORDER
                            </span>
                          )}
                          {order.fraud_status === 'blocked' && (
                            <span
                              className="text-[10px] font-bold tracking-[0.1em] px-1.5 py-0.5 rounded-sm bg-danger text-surface"
                              title="Velocity check blocked — no payment processed. Review before clearing."
                            >
                              BLOCKED
                            </span>
                          )}
                          {order.fraud_status === 'flagged' && (
                            <span
                              className="text-[10px] font-bold tracking-[0.1em] px-1.5 py-0.5 rounded-sm bg-warning text-surface"
                              title="Velocity check flagged — review before fulfillment."
                            >
                              FLAGGED
                            </span>
                          )}
                          {order.fraud_status === 'cleared' && (
                            <span
                              className="text-[10px] font-bold tracking-[0.1em] px-1.5 py-0.5 rounded-sm bg-success/15 text-success border border-success/30"
                              title="Fraud flag cleared by admin — OK to fulfill."
                            >
                              ✓ CLEARED
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Date" className="px-4 py-3 text-ink-soft">{new Date(order.created_at).toLocaleDateString()}</td>
                      <td data-label="Customer" className="px-4 py-3">
                        <div className="font-semibold text-ink">{order.customer_name}</div>
                        <div className="text-[11px] text-ink-mute">{order.customer_email}</div>
                      </td>
                      <td data-label="Items" className="px-4 py-3 text-ink-soft">
                        {items.map((it, j) => (
                          <div key={j} className="text-xs flex items-center gap-1.5">
                            <span>{it.name} x{it.quantity}</span>
                            {it.isPreorder && (
                              <span className="text-[9px] font-semibold text-accent-strong tracking-wide">[PRE]</span>
                            )}
                          </div>
                        ))}
                      </td>
                      <td data-label="Total" className="px-4 py-3 text-right font-semibold text-ink">${Number(order.total || 0).toFixed(2)}</td>
                      <td data-label="Payment" className="px-4 py-3 text-center">
                        <span
                          className={`opp-meta-mono font-semibold ${
                            order.payment_status === 'refunded'
                              ? 'text-danger'
                              : order.payment_status === 'completed'
                                ? 'text-success'
                                : order.payment_status === 'abandoned'
                                  ? 'text-ink-mute'
                                  : order.payment_status === 'awaiting_payment'
                                    ? 'text-ink-soft'
                                    : 'text-warning'
                          }`}
                        >
                          {order.payment_status === 'refunded'
                            ? 'Refunded'
                            : order.payment_status === 'completed'
                              ? 'Paid'
                              : order.payment_status === 'abandoned'
                                ? 'Abandoned'
                                : order.payment_status === 'awaiting_payment'
                                  ? 'Awaiting'
                                  : order.payment_status === 'balance_due'
                                    ? 'Balance due'
                                    : 'Pending'}
                        </span>
                      </td>
                      <td data-label="Status" className="px-4 py-3 text-center">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_CLASSES[status]}`}>
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td data-label="Tracking" className="px-4 py-3 font-mono text-xs text-ink-soft">{order.tracking || '—'}</td>
                      <td className="px-4 py-3 orders-actions-cell" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1.5 flex-wrap">
                          {isAwaitingZelle(order) && (
                            <button
                              className="text-[11px] px-2.5 py-1 rounded-opp border border-warning bg-warning text-surface hover:bg-warning/90 font-semibold"
                              onClick={() => markZellePaid(order)}
                              title="Mark this Zelle order paid after confirming the deposit in BoA-1990. Runs the same finalization as card + crypto webhooks."
                            >
                              Mark Zelle Paid
                            </button>
                          )}
                          {isAwaitingVenmo(order) && (
                            <button
                              className="text-[11px] px-2.5 py-1 rounded-opp border border-warning bg-warning text-surface hover:bg-warning/90 font-semibold"
                              onClick={() => markVenmoPaid(order)}
                              title="Mark this Venmo order paid after confirming the deposit on @optimizedperformance. Runs the same finalization as card + crypto webhooks."
                            >
                              Mark Venmo Paid
                            </button>
                          )}
                          {isAwaitingPayment(order) && (
                            <button
                              className="text-[11px] px-2.5 py-1 rounded-opp border border-warning bg-warning text-surface hover:bg-warning/90 font-semibold"
                              onClick={() => markPaidManual(order)}
                              title="Manually mark a stuck crypto/card 'Awaiting' order paid — e.g. an underpaid crypto invoice (NOWPayments 'partially_paid', parked for review) or a confirmed-but-unfired webhook. Runs the same finalization as the webhooks. Bypasses payment verification — verify funds first."
                            >
                              Mark Paid
                            </button>
                          )}
                          {nextStatus && (
                            <button
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-opp border ${STATUS_CLASSES[nextStatus]}`}
                              onClick={() => updateStatus(order.id, nextStatus)}
                            >
                              → {STATUS_LABELS[nextStatus]}
                            </button>
                          )}
                          {status !== 'cancelled' && order.payment_status === 'completed' && (
                            <button
                              className="text-[11px] px-2.5 py-1 rounded-opp border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 font-semibold"
                              onClick={() => refundAndCancel(order)}
                              title="Full refund cancels the order; partial refund keeps it open and ships normally. Process the processor-side refund (PayPal/Bankful/etc.) manually."
                            >
                              Refund
                            </button>
                          )}
                          {status !== 'cancelled' && ['completed', 'balance_due', 'pending'].includes(order.payment_status) && (
                            <button
                              className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-ink-soft hover:text-ink hover:bg-surfaceAlt font-semibold"
                              onClick={() => openEdit(order)}
                              title="Edit this order's items. Adds/removes recompute the total server-side; a positive difference invoices the customer for the balance (or comp it free)."
                            >
                              Edit
                            </button>
                          )}
                          {order.payment_status === 'balance_due' && (
                            <button
                              className="text-[11px] px-2.5 py-1 rounded-opp border border-warning bg-warning text-surface hover:bg-warning/90 font-semibold"
                              onClick={() => markBalancePaid(order)}
                              title="Settle the outstanding balance after confirming an off-platform (Zelle/Venmo/cash) payment. Card balances settle automatically via the payment webhook."
                            >
                              Mark Balance Paid
                            </button>
                          )}
                          {status !== 'cancelled' && order.payment_status !== 'completed' && order.payment_status !== 'balance_due' && (
                            <button
                              className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-danger hover:bg-surfaceAlt"
                              onClick={() => cancelOrder(order.id)}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                        {/* Mobile-only (CSS-gated): explicit expand control —
                            replaces the desktop whole-row click, which on touch
                            fired from stray scroll-taps. */}
                        <button
                          type="button"
                          className="orders-manage-btn"
                          onClick={() => setExpandedId(isExpanded ? null : order.id)}
                        >
                          {isExpanded ? 'Hide details ▲' : 'Manage order ▼'}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-surfaceAlt/60">
                        <td colSpan={10} className="px-5 py-4">
                          {(order.fraud_status === 'flagged' || order.fraud_status === 'blocked') && (
                            <div
                              className={`mb-4 p-3 rounded-opp border ${
                                order.fraud_status === 'blocked'
                                  ? 'bg-danger/10 border-danger/40'
                                  : 'bg-warning/10 border-warning/40'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                  <div className={`opp-meta-mono uppercase font-semibold ${order.fraud_status === 'blocked' ? 'text-danger' : 'text-warning'}`}>
                                    {order.fraud_status === 'blocked'
                                      ? 'Velocity check — BLOCKED (no payment processed)'
                                      : 'Velocity check — flagged for review'}
                                  </div>
                                  <ul className="mt-2 ml-4 list-disc text-[13px] text-ink-soft space-y-1">
                                    {(order.fraud_reasons || []).map((reason) => (
                                      <li key={reason}>{FRAUD_REASON_LABELS[reason] || reason}</li>
                                    ))}
                                  </ul>
                                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-ink-mute font-mono">
                                    {order.customer_ip && <div>IP: {order.customer_ip}</div>}
                                    {order.user_agent && <div className="truncate" title={order.user_agent}>UA: {order.user_agent}</div>}
                                  </div>
                                </div>
                                <button
                                  className="text-[11px] font-semibold px-3 py-1.5 rounded-opp border border-success/40 bg-success/10 text-success hover:bg-success/20 whitespace-nowrap"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    clearFraudFlag(order.id);
                                  }}
                                >
                                  Mark Clear
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="grid gap-4 md:grid-cols-4 grid-cols-1">
                            <div>
                              <div className="opp-meta-mono uppercase mb-1">
                                Shipping
                                {addrEdit?.orderId !== order.id && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); startAddrEdit(order); }}
                                    className="ml-2 text-accent hover:underline normal-case text-[12px]"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                              {addrEdit?.orderId === order.id ? (
                                <div className="flex flex-col gap-1.5 max-w-[260px]" onClick={(e) => e.stopPropagation()}>
                                  <input className="input-field text-[13px] py-1.5" placeholder="Recipient name" value={addrEdit.name}
                                    onChange={(e) => setAddrEdit((a) => ({ ...a, name: e.target.value }))} />
                                  <input className="input-field text-[13px] py-1.5" placeholder="Street address" value={addrEdit.address}
                                    onChange={(e) => setAddrEdit((a) => ({ ...a, address: e.target.value }))} />
                                  <input className="input-field text-[13px] py-1.5" placeholder="City" value={addrEdit.city}
                                    onChange={(e) => setAddrEdit((a) => ({ ...a, city: e.target.value }))} />
                                  <div className="flex gap-1.5">
                                    <input className="input-field text-[13px] py-1.5 w-16" placeholder={order.country === 'CA' ? 'Prov' : 'State'} value={addrEdit.state}
                                      onChange={(e) => setAddrEdit((a) => ({ ...a, state: e.target.value }))} />
                                    <input className="input-field text-[13px] py-1.5 flex-1" placeholder={order.country === 'CA' ? 'Postal code' : 'ZIP'} value={addrEdit.zip}
                                      onChange={(e) => setAddrEdit((a) => ({ ...a, zip: e.target.value }))} />
                                  </div>
                                  <div className="flex gap-2 mt-1">
                                    <button onClick={() => saveAddrEdit(order)} disabled={addrSaving} className="btn-primary px-3 py-1 text-[12px]">
                                      {addrSaving ? 'Saving…' : 'Save'}
                                    </button>
                                    <button onClick={() => setAddrEdit(null)} className="px-3 py-1 border border-line rounded-opp text-[12px] text-ink-soft hover:text-ink">
                                      Cancel
                                    </button>
                                  </div>
                                  <div className="text-[11px] text-ink-mute">
                                    Country stays {order.country === 'CA' ? 'Canada' : 'US'} — a country change needs cancel + re-create.
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[13px] text-ink leading-relaxed">
                                  {order.customer_name}<br />
                                  {order.shipping_address}<br />
                                  {order.city}, {order.state} {order.zip}{order.country && order.country !== 'US' ? `, ${order.country}` : ''}
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="opp-meta-mono uppercase mb-1">Items Breakdown</div>
                              {items.map((it, j) => (
                                <div key={j} className="text-[13px] text-ink-soft leading-relaxed">
                                  {it.name} ({it.dosage}) — {it.quantity} × ${Number(it.price || 0).toFixed(2)} = ${(it.quantity * Number(it.price || 0)).toFixed(2)}
                                  {it.isPreorder && (
                                    <span className="ml-2 text-[11px] font-semibold text-accent-strong">
                                      · PREORDER{it.preorderShipDate ? ` (ships ~${formatShipDate(it.preorderShipDate)})` : ' (ship date TBD)'}
                                    </span>
                                  )}
                                </div>
                              ))}
                              {order.discount > 0 && (
                                <div className="text-[13px] text-success mt-1">
                                  Discount: -${Number(order.discount).toFixed(2)} ({order.affiliate_code})
                                </div>
                              )}
                              <div className="text-[13px] text-ink-soft mt-1">
                                Shipping: {Number(order.shipping || 0) === 0 ? 'FREE' : `$${Number(order.shipping).toFixed(2)}`}
                              </div>
                              <div className="text-[13px] font-bold mt-1 text-ink">Total: ${Number(order.total || 0).toFixed(2)}</div>
                              {order.refunded_at && (
                                <div className="text-[13px] text-danger mt-2 leading-relaxed">
                                  <strong>Refunded:</strong> ${Number(order.refund_amount || 0).toFixed(2)} on{' '}
                                  {new Date(order.refunded_at).toLocaleDateString()}
                                  {order.refund_reason && (
                                    <div className="text-[12px] text-ink-mute italic mt-0.5">{order.refund_reason}</div>
                                  )}
                                </div>
                              )}
                              {orderHasPreorders && (
                                <div className="text-[13px] text-accent-strong mt-2 font-semibold">
                                  Earliest fulfill: hold for preorder restock
                                  {orderLatestShip ? ` · target ${orderLatestShip}` : ' · ship date TBD'}
                                </div>
                              )}
                              {order.affiliate_code && (
                                <div className="text-[13px] text-warning mt-1">
                                  Affiliate: {order.affiliate_code} ({order.affiliate_commission_pct}% = $
                                  {calcCommission(order).toFixed(2)})
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="opp-meta-mono uppercase mb-1">
                                Tracking
                                {order.shipping_method && (
                                  <span className="ml-2 text-accent-strong normal-case tracking-normal">
                                    · {SHIPPING_METHOD_LABELS[order.shipping_method] || order.shipping_method}
                                  </span>
                                )}
                              </div>
                              <input
                                className="input-field"
                                defaultValue={order.tracking || ''}
                                onBlur={(e) => updateTracking(order.id, e.target.value)}
                                placeholder="Enter tracking #"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex gap-1.5 flex-wrap mt-2">
                                {!order.tracking &&
                                  (order.country || 'US') === 'US' &&
                                  ['completed', 'balance_due'].includes(order.payment_status) && (
                                  <button
                                    className="text-[11px] font-semibold px-2.5 py-1 rounded-opp border border-accent-strong bg-accent-strong text-surface hover:opacity-90 disabled:opacity-50"
                                    disabled={labelBuying === order.id}
                                    onClick={(e) => { e.stopPropagation(); buyShippoLabel(order); }}
                                  >
                                    {labelBuying === order.id ? 'Buying label…' : 'Buy shipping label'}
                                  </button>
                                )}
                                {order.label_url && (
                                  <a
                                    href={order.label_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] font-semibold px-2.5 py-1 rounded-opp border border-line text-ink-soft hover:text-ink"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Print label{order.label_cost ? ` ($${Number(order.label_cost).toFixed(2)})` : ''} ↗
                                  </a>
                                )}
                                {(order.country || 'US') !== 'US' && !order.tracking && (
                                  <span className="text-[11px] text-ink-mute self-center">
                                    International — buy in the Shippo dashboard (customs declaration)
                                  </span>
                                )}
                              </div>
                              {['completed', 'balance_due', 'refunded'].includes(order.payment_status) && (
                                <div className="flex gap-1.5 flex-wrap mt-2">
                                  <button
                                    className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-ink-soft hover:text-ink hover:bg-surfaceAlt disabled:opacity-50"
                                    disabled={resending?.id === order.id}
                                    onClick={(e) => { e.stopPropagation(); resendEmail(order, 'confirmation'); }}
                                  >
                                    {resending?.id === order.id && resending?.kind === 'confirmation' ? 'Sending…' : 'Resend confirmation'}
                                  </button>
                                  {order.tracking && (
                                    <button
                                      className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-ink-soft hover:text-ink hover:bg-surfaceAlt disabled:opacity-50"
                                      disabled={resending?.id === order.id}
                                      onClick={(e) => { e.stopPropagation(); resendEmail(order, 'tracking'); }}
                                    >
                                      {resending?.id === order.id && resending?.kind === 'tracking' ? 'Sending…' : 'Resend tracking'}
                                    </button>
                                  )}
                                </div>
                              )}
                              {order.notes && (
                                <>
                                  <div className="opp-meta-mono uppercase mt-3 mb-1">Notes</div>
                                  <div className="text-[13px] text-ink-soft">{order.notes}</div>
                                </>
                              )}
                            </div>
                            <div>
                              <div className="opp-meta-mono uppercase mb-1">Move to Status</div>
                              <div className="flex gap-1.5 flex-wrap mt-1">
                                {STATUSES.filter((st) => st !== status).map((st) => (
                                  <button
                                    key={st}
                                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-opp border ${STATUS_CLASSES[st]}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateStatus(order.id, st);
                                    }}
                                  >
                                    {STATUS_LABELS[st]}
                                  </button>
                                ))}
                              </div>
                              <div className="opp-meta-mono uppercase mt-3 mb-1">Last Updated</div>
                              <div className="text-[13px] text-ink-soft">{new Date(order.updated_at).toLocaleString()}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && filtered.length > visibleCount && (
          <button
            type="button"
            className="w-full py-4 text-[13px] font-semibold text-ink-soft hover:text-ink border-t border-line"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            Show {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more ({filtered.length - visibleCount} remaining)
          </button>
        )}
      </div>

      {pickListOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[100] flex items-start justify-center p-6 overflow-auto"
          onClick={() => setPickListOpen(false)}
        >
          <div
            className="bg-surface rounded-opp-lg max-w-2xl w-full p-6 md:p-8 my-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4 pb-4 border-b border-line">
              <div>
                <span className="opp-eyebrow">Pick List</span>
                <h3 className="font-display font-semibold tracking-display text-2xl m-0 mt-1 text-ink">
                  Today&apos;s queue
                </h3>
                {pickListData && (
                  <p className="opp-meta-mono text-ink-mute mt-1 m-0">
                    {pickListData.order_count} order(s) · {pickListData.total_vials} vials total
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {pickListData && (
                  <button className="btn-outline text-xs px-4 py-2" onClick={printPickList}>
                    Print
                  </button>
                )}
                <button
                  className="text-[11px] px-3 py-1.5 rounded-opp border border-line text-ink-soft hover:border-ink"
                  onClick={() => setPickListOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            {pickListLoading && <p className="text-sm text-ink-mute m-0">Loading…</p>}

            {pickListData && pickListData.order_count === 0 && (
              <p className="text-sm text-ink-soft m-0">
                No orders ready to pack. New paid orders will appear here when they pass fraud review.
              </p>
            )}

            {pickListData && pickListData.groups.map((g) => (
              <div key={g.category} className="mb-6">
                <h4 className="opp-meta-mono uppercase border-b border-line pb-1 mb-2 text-ink-mute">
                  {g.category}
                </h4>
                <ul className="m-0 p-0 list-none">
                  {g.items.map((it) => (
                    <li key={it.sku} className="flex justify-between items-start py-2 border-b border-line/50 last:border-none">
                      <div>
                        <div className="text-sm font-semibold text-ink">{it.name} {it.dosage}</div>
                        <div className="opp-meta-mono mt-0.5">
                          {it.sku}
                          {it.kit_count > 0 && ` · ${it.kit_count} kit assembl${it.kit_count === 1 ? 'y' : 'ies'}`}
                          {it.individual_count > 0 && ` · ${it.individual_count} loose`}
                        </div>
                      </div>
                      <div className="font-display font-semibold text-lg text-ink whitespace-nowrap tabular-nums">
                        {it.vials} <span className="text-xs text-ink-mute font-normal">vials</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {pickListData && (pickListData.orders || []).length > 0 && (
              <div className="mt-8 pt-4 border-t border-line">
                <h4 className="opp-meta-mono uppercase pb-1 mb-3 text-ink-mute">
                  Pack-out by order · {pickListData.orders.length} box(es)
                </h4>
                {pickListData.orders.map((o) => (
                  <div key={o.order_number} className="mb-3 p-3 border border-line rounded-opp">
                    <div className="flex justify-between items-baseline gap-3 border-b border-line/50 pb-1.5 mb-1.5">
                      <span className="text-sm font-semibold text-ink">{o.customer_name}</span>
                      <span className="opp-meta-mono text-ink-mute text-right">
                        {o.order_number}
                        {o.city ? ` · ${o.city}, ${o.state}` : ''}
                        {o.country && o.country !== 'US' ? ` · ${o.country}` : ''}
                        {o.shipping_method ? ` · ${SHIPPING_METHOD_LABELS[o.shipping_method] || o.shipping_method}` : ''}
                      </span>
                    </div>
                    <ul className="m-0 p-0 list-none">
                      {o.items.map((it, i) => (
                        <li key={i} className="py-1 text-[13px] text-ink">
                          {it.quantity} × {it.name}
                          {it.vials ? <span className="text-ink-soft font-semibold"> — assemble {it.vials} vials</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {bulkPasteOpen && bulkPasteSnapshot && (
        <div
          className="fixed inset-0 bg-black/50 z-[100] flex items-start justify-center p-6 overflow-auto"
          onClick={() => !bulkPasteSubmitting && setBulkPasteOpen(false)}
        >
          <div
            className="bg-surface rounded-opp-lg max-w-2xl w-full p-6 md:p-8 my-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4 pb-4 border-b border-line">
              <div>
                <span className="opp-eyebrow">Bulk Tracking Paste</span>
                <h3 className="font-display font-semibold tracking-display text-2xl m-0 mt-1 text-ink">
                  Apply tracking to {bulkPasteSnapshot.order_numbers.length} order(s)
                </h3>
                <p className="opp-meta-mono text-ink-mute mt-1 m-0">
                  Snapshot from ShipCheer export at {new Date(bulkPasteSnapshot.exported_at).toLocaleString()}
                </p>
              </div>
              <button
                className="text-[11px] px-3 py-1.5 rounded-opp border border-line text-ink-soft hover:border-ink"
                onClick={() => setBulkPasteOpen(false)}
                disabled={bulkPasteSubmitting}
              >
                Cancel
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <div className="opp-meta-mono uppercase mb-1.5">Order Numbers (in row order)</div>
                <ol className="m-0 pl-6 text-sm text-ink-soft space-y-0.5 max-h-72 overflow-auto bg-surfaceAlt rounded-opp p-3 list-decimal font-mono">
                  {bulkPasteSnapshot.order_numbers.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ol>
              </div>
              <div>
                <div className="opp-meta-mono uppercase mb-1.5">Tracking Numbers (one per line)</div>
                <textarea
                  className="input-field font-mono text-sm h-72 resize-none"
                  value={bulkPasteText}
                  onChange={(e) => setBulkPasteText(e.target.value)}
                  placeholder={`1Z999AA10123456784\n9400111899223344556677\n…`}
                  disabled={bulkPasteSubmitting}
                />
                <p className="opp-meta-mono text-ink-mute mt-1.5 m-0">
                  Must match the order count exactly. Carriers auto-detect from format.
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-line">
              <p className="opp-meta-mono text-ink-mute m-0">
                Marks each as Shipped + fires customer ship emails. Snapshot is cleared after success.
              </p>
              <button
                className="btn-primary text-xs px-5 py-2"
                onClick={applyBulkPaste}
                disabled={bulkPasteSubmitting || !bulkPasteText.trim()}
              >
                {bulkPasteSubmitting ? 'Applying…' : 'Apply tracking + ship'}
              </button>
            </div>
          </div>
        </div>
      )}

      {manualOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[100] flex items-start justify-center p-6 overflow-auto"
          onClick={() => !manualSubmitting && setManualOpen(false)}
        >
          <div
            className="bg-surface rounded-opp-lg max-w-2xl w-full p-6 md:p-8 my-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4 pb-4 border-b border-line">
              <div>
                <span className="opp-eyebrow">Manual Order</span>
                <h3 className="font-display font-semibold tracking-display text-2xl m-0 mt-1 text-ink">
                  New manual order
                </h3>
                <p className="opp-meta-mono text-ink-mute mt-1 m-0">
                  Off-platform payment (Zelle/Venmo/cash). Records the sale, decrements inventory, credits the affiliate.
                </p>
              </div>
              <button
                className="text-[11px] px-3 py-1.5 rounded-opp border border-line text-ink-soft hover:border-ink"
                onClick={() => setManualOpen(false)}
                disabled={manualSubmitting}
              >
                Cancel
              </button>
            </div>

            {/* Customer */}
            <div className="grid md:grid-cols-2 gap-3 mb-4">
              <div>
                <div className="opp-meta-mono uppercase mb-1">Customer name</div>
                <input className="input-field text-sm w-full" value={manualForm.name} onChange={(e) => setManualField('name', e.target.value)} disabled={manualSubmitting} />
              </div>
              <div>
                <div className="opp-meta-mono uppercase mb-1">Email</div>
                <input type="email" className="input-field text-sm w-full" value={manualForm.email} onChange={(e) => setManualField('email', e.target.value)} disabled={manualSubmitting} />
              </div>
              <div className="md:col-span-2">
                <div className="opp-meta-mono uppercase mb-1">Shipping address</div>
                <input className="input-field text-sm w-full" value={manualForm.address} onChange={(e) => setManualField('address', e.target.value)} disabled={manualSubmitting} />
              </div>
              <div>
                <div className="opp-meta-mono uppercase mb-1">City</div>
                <input className="input-field text-sm w-full" value={manualForm.city} onChange={(e) => setManualField('city', e.target.value)} disabled={manualSubmitting} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="opp-meta-mono uppercase mb-1">State</div>
                  <input className="input-field text-sm w-full" value={manualForm.state} onChange={(e) => setManualField('state', e.target.value)} disabled={manualSubmitting} />
                </div>
                <div>
                  <div className="opp-meta-mono uppercase mb-1">ZIP</div>
                  <input className="input-field text-sm w-full" value={manualForm.zip} onChange={(e) => setManualField('zip', e.target.value)} disabled={manualSubmitting} />
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="mb-4">
              <div className="opp-meta-mono uppercase mb-1.5">Products</div>
              <div className="space-y-2">
                {manualForm.lines.map((line, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      className="input-field text-sm flex-1"
                      value={line.productId}
                      onChange={(e) => setManualLine(idx, 'productId', e.target.value)}
                      disabled={manualSubmitting}
                    >
                      <option value="">— select product —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.dosage} — ${p.price.toFixed(2)}{p.isKit ? ' (kit)' : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      className="input-field text-sm w-20"
                      value={line.quantity}
                      onChange={(e) => setManualLine(idx, 'quantity', e.target.value)}
                      disabled={manualSubmitting}
                      aria-label="Quantity"
                    />
                    <button
                      className="text-[11px] px-2 py-2 rounded-opp border border-line text-ink-mute hover:text-danger hover:border-danger/40"
                      onClick={() => removeManualLine(idx)}
                      disabled={manualSubmitting || manualForm.lines.length === 1}
                      aria-label="Remove line"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="btn-outline text-[11px] px-3 py-1.5 mt-2"
                onClick={addManualLine}
                disabled={manualSubmitting}
              >
                + Add line
              </button>
            </div>

            {/* Affiliate + payment + override */}
            <div className="grid md:grid-cols-3 gap-3 mb-4">
              <div>
                <div className="opp-meta-mono uppercase mb-1">Affiliate code <span className="text-ink-mute">(optional)</span></div>
                <input className="input-field text-sm w-full uppercase" value={manualForm.affiliateCode} onChange={(e) => setManualField('affiliateCode', e.target.value)} placeholder="e.g. TRIS" disabled={manualSubmitting} />
              </div>
              <div>
                <div className="opp-meta-mono uppercase mb-1">Paid via</div>
                <select className="input-field text-sm w-full" value={manualForm.paymentMethod} onChange={(e) => setManualField('paymentMethod', e.target.value)} disabled={manualSubmitting}>
                  <option value="zelle">Zelle</option>
                  <option value="venmo">Venmo</option>
                  <option value="crypto">Crypto</option>
                  <option value="cash">Cash</option>
                  <option value="paypal">PayPal</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <div className="opp-meta-mono uppercase mb-1">Price override <span className="text-ink-mute">(optional)</span></div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field text-sm w-full"
                  value={manualForm.priceOverride}
                  onChange={(e) => setManualField('priceOverride', e.target.value)}
                  placeholder={`auto: $${manualCatalogSubtotal.toFixed(2)}`}
                  disabled={manualSubmitting}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 mb-4 text-sm text-ink-soft cursor-pointer">
              <input
                type="checkbox"
                checked={manualForm.sendConfirmation}
                onChange={(e) => setManualField('sendConfirmation', e.target.checked)}
                disabled={manualSubmitting}
              />
              Send order-confirmation email to customer
            </label>

            <div className="flex justify-between items-center pt-4 border-t border-line">
              <p className="opp-meta-mono text-ink-mute m-0">
                {manualForm.priceOverride.trim()
                  ? `Override total: $${(Number(manualForm.priceOverride) || 0).toFixed(2)}`
                  : `Catalog subtotal: $${manualCatalogSubtotal.toFixed(2)} (+ shipping, − affiliate disc. computed server-side)`}
              </p>
              <button
                className="btn-primary text-xs px-5 py-2"
                onClick={submitManualOrder}
                disabled={manualSubmitting}
              >
                {manualSubmitting ? 'Creating…' : 'Create + finalize order'}
              </button>
            </div>
          </div>
        </div>
      )}
      {editOrder && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-10"
          onClick={() => !editSubmitting && setEditOrder(null)}
        >
          <div
            className="bg-surface border border-line rounded-opp-lg w-full max-w-lg mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display font-semibold text-lg text-ink m-0">Edit order {editOrder.order_number}</h3>
              <button className="text-ink-mute hover:text-ink text-xl leading-none" onClick={() => setEditOrder(null)}>×</button>
            </div>
            <p className="text-[12px] text-ink-mute mb-4">
              {editOrder.customer_name} · {editOrder.customer_email} · collected ${editPaid.toFixed(2)}
            </p>

            {/* Line items */}
            <div className="flex flex-col gap-2 mb-3">
              {editLines.map((l, i) => (
                <div key={i} className="flex items-center gap-2 bg-surfaceAlt rounded-opp px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-ink truncate">{l.name}</div>
                    <div className="opp-meta-mono text-ink-mute">{l.comp ? 'FREE (comp)' : `$${(Number(l.price) || 0).toFixed(2)} ea`}</div>
                  </div>
                  <input
                    type="number" min="1" value={l.quantity}
                    onChange={(e) => setEditLine(i, 'quantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-14 bg-surface border border-line rounded-opp px-2 py-1 text-[13px] text-ink text-center"
                  />
                  <label className="flex items-center gap-1 text-[11px] text-ink-soft cursor-pointer" title="Comp this line — free, but still ships + decrements stock">
                    <input type="checkbox" checked={l.comp} onChange={(e) => setEditLine(i, 'comp', e.target.checked)} />
                    Free
                  </label>
                  <button className="text-danger hover:text-danger/80 text-lg leading-none px-1" onClick={() => removeEditLine(i)} title="Remove line">×</button>
                </div>
              ))}
            </div>

            {/* Add item */}
            <div className="flex gap-2 mb-4">
              <select
                value={editAddSku} onChange={(e) => setEditAddSku(e.target.value)}
                className="flex-1 bg-surface border border-line rounded-opp px-3 py-2 text-[13px] text-ink"
              >
                <option value="">+ Add item…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.dosage ? `${p.name} ${p.dosage}` : p.name} — ${Number(p.price || 0).toFixed(2)}</option>
                ))}
              </select>
              <button className="btn-outline text-xs px-4 py-2" disabled={!editAddSku} onClick={addEditLine}>Add</button>
            </div>

            {/* Estimate */}
            <div className="bg-surfaceAlt rounded-opp px-3 py-3 mb-4 text-[13px]">
              <div className="flex justify-between text-ink-soft"><span>Items subtotal (est.)</span><span className="font-mono">${editSubtotalEst.toFixed(2)}</span></div>
              <div className="flex justify-between text-ink-soft"><span>Already collected</span><span className="font-mono">${editPaid.toFixed(2)}</span></div>
              <div className="flex justify-between text-ink font-semibold mt-1 pt-1 border-t border-line">
                <span>{editBalanceEst > 0 ? 'Balance due (est.)' : 'Balance'}</span>
                <span className="font-mono">${editBalanceEst.toFixed(2)}</span>
              </div>
              <p className="opp-meta-mono text-ink-mute mt-2 leading-relaxed">
                Estimate only — final total (discounts, shipping) + exact balance compute server-side on save. Comp lines still ship + decrement stock.
              </p>
            </div>

            {/* How to collect the balance */}
            {editBalanceEst > 0 && (
              <div className="mb-4">
                <label className="block opp-meta-mono uppercase text-ink-mute mb-1">Collect balance via</label>
                <div className="flex gap-2 items-center flex-wrap">
                  <select
                    value={editChargeMethod} onChange={(e) => setEditChargeMethod(e.target.value)}
                    className="bg-surface border border-line rounded-opp px-3 py-2 text-[13px] text-ink"
                  >
                    <option value="card">Card — email a pay-link</option>
                    <option value="zelle">Zelle (manual)</option>
                    <option value="venmo">Venmo (manual)</option>
                    <option value="crypto">Crypto (manual)</option>
                    <option value="cash">Cash (manual)</option>
                    <option value="other">Other (manual)</option>
                  </select>
                  {editChargeMethod === 'card' && (
                    <label className="flex items-center gap-1.5 text-[12px] text-ink-soft cursor-pointer">
                      <input type="checkbox" checked={editSendInvoice} onChange={(e) => setEditSendInvoice(e.target.checked)} />
                      Email the invoice now
                    </label>
                  )}
                </div>
                <p className="opp-meta-mono text-ink-mute mt-1.5 leading-relaxed">
                  {editChargeMethod === 'card'
                    ? 'Order flips to “Balance due”; customer gets a card link for the difference. Settles automatically when paid.'
                    : 'Order flips to “Balance due”; collect off-platform, then click “Mark Balance Paid” on the order.'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button className="btn-outline text-xs px-4 py-2" onClick={() => setEditOrder(null)} disabled={editSubmitting}>Cancel</button>
              <button className="btn-primary text-xs px-5 py-2" onClick={submitEdit} disabled={editSubmitting}>
                {editSubmitting ? 'Saving…' : editBalanceEst > 0 ? 'Save + invoice balance' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
