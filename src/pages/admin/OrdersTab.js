import { Fragment, useEffect, useState } from 'react';

// localStorage key for the most recent ShipCheer export's order_numbers.
// Used by Bulk Tracking Paste so admin can paste tracking #s in row order
// without re-selecting which orders. Persists across page reloads.
const SHIPCHEER_SNAPSHOT_KEY = 'opp_shipcheer_last_export';

// Forward-flow status order. 'cancelled' is a terminal state reached via the
// Cancel button, not part of the normal progression.
const STATUSES = ['pending', 'packed', 'shipped', 'fulfilled'];
const ALL_STATUSES = [...STATUSES, 'cancelled'];
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

  useEffect(() => {
    fetchOrders();
  }, []);

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-admin-token': token || '',
    };
  }

  async function fetchOrders() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders', { headers: authHeaders() });
      if (res.ok) setOrders(await res.json());
    } catch {
      /* fail */
    }
    setLoading(false);
  }

  async function updateStatus(orderId, newStatus) {
    try {
      await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: orderId, status: newStatus }),
      });
      await fetchOrders();
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

  async function cancelOrder(orderId) {
    if (!window.confirm('Mark this order as cancelled? (Records are preserved for audit. Use Refund & Cancel if customer was charged.)')) return;
    try {
      await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: orderId, status: 'cancelled' }),
      });
      await fetchOrders();
    } catch {
      /* fail */
    }
  }

  // Refund + cancel a paid order. Records OPP-side bookkeeping and notifies
  // the customer; Bankful refund itself still happens manually via Bankful
  // dashboard for v1 (Diana hasn't confirmed the refund-API endpoint yet).
  async function refundAndCancel(order) {
    const defaultAmt = Number(order.total || 0).toFixed(2);
    const amtStr = window.prompt(
      `Refund amount for order ${order.order_number}? Full total = $${defaultAmt}. Enter a smaller number for partial refund.`,
      defaultAmt
    );
    if (amtStr === null) return;
    const amount = parseFloat(amtStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      showSaveMsg('Invalid refund amount.');
      return;
    }
    const reason = window.prompt(
      'Refund reason (audit log + appears in customer email if non-empty):',
      ''
    );
    if (reason === null) return;
    if (!window.confirm(
      `Refund $${amount.toFixed(2)} on order ${order.order_number}?\n\n` +
      `This records the refund in OPP, marks the order cancelled, and emails the customer. ` +
      `Process the actual refund in Bankful's dashboard if you haven't already.`
    )) return;

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
      await fetchOrders();
      showSaveMsg(
        `Refunded $${amount.toFixed(2)} on ${order.order_number}. Customer notified. ` +
        `Process the Bankful-side refund if not already done.`
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
      const res = await fetch('/api/admin/orders/mark-zelle-paid', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: order.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        showSaveMsg(`Mark paid failed: ${data.error || res.status}`);
        return;
      }
      await fetchOrders();
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
      await fetchOrders();
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
      await fetchOrders();
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
    const html = `<!DOCTYPE html><html><head><title>OPP Pick List</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
        h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; color: #444; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 28px; }
        ul { list-style: none; padding: 0; }
        li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 4px; border-bottom: 1px solid #eee; }
        .check { display: inline-block; width: 18px; height: 18px; border: 1.5px solid #444; vertical-align: middle; margin-right: 8px; }
        .name { font-weight: 600; }
        .meta-line { font-size: 11px; color: #777; }
        .qty { font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
      </style></head><body>
      <h1>Optimized Performance — Pick List</h1>
      <div class="meta">${pickListData.order_count} order(s) · ${pickListData.total_vials} vials total · generated ${new Date(pickListData.generated_at).toLocaleString()}</div>
      ${groups.map((g) => `
        <h2>${g.category}</h2>
        <ul>
          ${g.items.map((it) => `
            <li>
              <div><span class="check"></span><span class="name">${it.name} ${it.dosage}</span>
                <div class="meta-line">${it.sku}${it.kit_count ? ` · ${it.kit_count} kit assembl${it.kit_count === 1 ? 'y' : 'ies'}` : ''}${it.individual_count ? `${it.kit_count ? ' · ' : ' · '}${it.individual_count} loose` : ''}</div>
              </div>
              <div class="qty">${it.vials} vials</div>
            </li>`).join('')}
        </ul>
      `).join('')}
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
      await fetchOrders();
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
    const headers = ['Order #', 'Payment', 'Status', 'Date', 'Customer', 'Email', 'Address', 'City', 'State', 'ZIP', 'Items', 'Has Preorder', 'Preorder Ship Date', 'Subtotal', 'Discount', 'Shipping', 'Total', 'Refund Amount', 'Refunded At', 'Refund Reason', 'Affiliate Code', 'Commission %', 'Tracking', 'Notes'];
    const rows = filtered.map((o) => [
      o.order_number, o.payment_status || '', STATUS_LABELS[o.fulfillment_status || 'pending'],
      new Date(o.created_at).toLocaleDateString(), o.customer_name, o.customer_email,
      o.shipping_address || '', o.city || '', o.state || '', o.zip || '',
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
  const counts = {
    all: orders.length,
    ready_to_ship: orders.filter(isReadyToShip).length,
    awaiting_zelle: orders.filter(isAwaitingZelle).length,
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
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-surfaceAlt">
              <tr>
                <th className="px-3 py-3 border-b border-line w-8" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => toggleSelectAllVisible(filtered)}
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
              {filtered.map((order) => {
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
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
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
                      <td className="px-4 py-3 text-ink-soft">{new Date(order.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{order.customer_name}</div>
                        <div className="text-[11px] text-ink-mute">{order.customer_email}</div>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {items.map((it, j) => (
                          <div key={j} className="text-xs flex items-center gap-1.5">
                            <span>{it.name} x{it.quantity}</span>
                            {it.isPreorder && (
                              <span className="text-[9px] font-semibold text-accent-strong tracking-wide">[PRE]</span>
                            )}
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">${Number(order.total || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`opp-meta-mono font-semibold ${
                            order.payment_status === 'refunded'
                              ? 'text-danger'
                              : order.payment_status === 'completed'
                                ? 'text-success'
                                : 'text-warning'
                          }`}
                        >
                          {order.payment_status === 'refunded'
                            ? 'Refunded'
                            : order.payment_status === 'completed'
                              ? 'Paid'
                              : 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_CLASSES[status]}`}>
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-soft">{order.tracking || '—'}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                              title="Record refund + cancel order + email customer. Process the Bankful-side refund manually for now."
                            >
                              Refund &amp; Cancel
                            </button>
                          )}
                          {status !== 'cancelled' && order.payment_status !== 'completed' && (
                            <button
                              className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-danger hover:bg-surfaceAlt"
                              onClick={() => cancelOrder(order.id)}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
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
                              <div className="opp-meta-mono uppercase mb-1">Shipping</div>
                              <div className="text-[13px] text-ink leading-relaxed">
                                {order.shipping_address}<br />
                                {order.city}, {order.state} {order.zip}
                              </div>
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
                                  {(Number(order.total || 0) * Number(order.affiliate_commission_pct || 0) / 100).toFixed(2)})
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="opp-meta-mono uppercase mb-1">Tracking</div>
                              <input
                                className="input-field"
                                defaultValue={order.tracking || ''}
                                onBlur={(e) => updateTracking(order.id, e.target.value)}
                                placeholder="Enter tracking #"
                                onClick={(e) => e.stopPropagation()}
                              />
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
    </>
  );
}
