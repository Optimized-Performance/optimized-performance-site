import { Fragment, useEffect, useState } from 'react';

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

export default function OrdersTab({ products, showSaveMsg, token }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [preorderOnly, setPreorderOnly] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

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
    let out = filter === 'all' ? list : list.filter((o) => (o.fulfillment_status || 'pending') === filter);
    if (preorderOnly) out = out.filter(hasPreorderItems);
    return out;
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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `shipcheer-${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showSaveMsg('ShipCheer CSV exported. Drag into Labelife → Batch Printing.');
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
  const counts = { all: orders.length };
  ALL_STATUSES.forEach((st) => {
    counts[st] = orders.filter((o) => (o.fulfillment_status || 'pending') === st).length;
  });
  const preorderCount = orders.filter(hasPreorderItems).length;

  return (
    <>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <h2 className="font-display font-semibold tracking-display text-xl m-0 text-ink">Orders</h2>
        <div className="flex gap-2">
          <button className="btn-outline text-xs px-4 py-2" onClick={fetchOrders}>Refresh</button>
          <button className="btn-outline text-xs px-4 py-2" onClick={exportShipCheerCSV} title="Download paid, not-yet-shipped orders in ShipCheer Batch Import format">
            ShipCheer CSV
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
                      }`}
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    >
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
                        <td colSpan={9} className="px-5 py-4">
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
    </>
  );
}
