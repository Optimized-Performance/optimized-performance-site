import { useState, useEffect } from 'react';

const STATUSES = ['pending', 'packed', 'shipped', 'fulfilled'];
const STATUS_LABELS = { pending: 'Pending', packed: 'Packed', shipped: 'Shipped', fulfilled: 'Fulfilled' };
const STATUS_COLORS = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  packed: { bg: '#dbeafe', color: '#1e40af' },
  shipped: { bg: '#ede9fe', color: '#5b21b6' },
  fulfilled: { bg: '#dcfce7', color: '#16a34a' },
};

export default function OrdersTab({ products, showSaveMsg }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-admin-token': sessionStorage.getItem('op_admin_token') || '',
    };
  }

  async function fetchOrders() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders', { headers: authHeaders() });
      if (res.ok) setOrders(await res.json());
    } catch { /* fail */ }
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
    } catch { /* fail */ }
  }

  async function updateTracking(orderId, tracking) {
    try {
      await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: orderId, tracking }),
      });
      // Optimistic update — update local state without refetch
      setOrders(orders.map(o => o.id === orderId ? { ...o, tracking } : o));
    } catch { /* fail */ }
  }

  async function deleteOrder(orderId) {
    if (!window.confirm('Delete this order?')) return;
    try {
      await fetch('/api/admin/orders', {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ id: orderId }),
      });
      await fetchOrders();
    } catch { /* fail */ }
  }

  function exportCSV() {
    const filtered = filter === 'all' ? orders : orders.filter(o => (o.fulfillment_status || 'pending') === filter);
    const headers = ['Order #', 'Payment', 'Status', 'Date', 'Customer', 'Email', 'Address', 'City', 'State', 'ZIP', 'Items', 'Subtotal', 'Discount', 'Total', 'Affiliate Code', 'Commission %', 'Tracking', 'Notes'];
    const rows = filtered.map(o => [
      o.order_number,
      o.payment_status || '',
      STATUS_LABELS[o.fulfillment_status || 'pending'],
      new Date(o.created_at).toLocaleDateString(),
      o.customer_name,
      o.customer_email,
      o.shipping_address || '',
      o.city || '',
      o.state || '',
      o.zip || '',
      (o.items || []).map(i => `${i.name} x${i.quantity}`).join('; '),
      Number(o.subtotal || 0).toFixed(2),
      Number(o.discount || 0).toFixed(2),
      Number(o.total || 0).toFixed(2),
      o.affiliate_code || '',
      o.affiliate_commission_pct || '',
      o.tracking || '',
      o.notes || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${filter}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = filter === 'all' ? orders : orders.filter(o => (o.fulfillment_status || 'pending') === filter);
  const counts = { all: orders.length };
  STATUSES.forEach(st => { counts[st] = orders.filter(o => (o.fulfillment_status || 'pending') === st).length; });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={s.sectionTitle}>Orders</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.exportBtn} onClick={fetchOrders}>Refresh</button>
          <button style={s.exportBtn} onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      <div style={s.statsRow}>
        {[
          { key: 'pending', label: 'Pending' },
          { key: 'packed', label: 'Packed' },
          { key: 'shipped', label: 'Shipped' },
          { key: 'fulfilled', label: 'Fulfilled' },
        ].map(st => (
          <div
            key={st.key}
            style={{ ...s.statCard, cursor: 'pointer', borderColor: filter === st.key ? STATUS_COLORS[st.key].color : '#E4EDF3' }}
            onClick={() => setFilter(filter === st.key ? 'all' : st.key)}
          >
            <div style={{ ...s.statValue, color: STATUS_COLORS[st.key].color }}>{counts[st.key]}</div>
            <div style={s.statLabel}>{st.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', ...STATUSES].map(st => (
          <button
            key={st}
            onClick={() => setFilter(st)}
            style={{
              ...s.pill,
              backgroundColor: filter === st ? '#0D1B2A' : '#fff',
              color: filter === st ? '#fff' : '#5A7D9A',
              border: filter === st ? '1px solid #0D1B2A' : '1px solid #E4EDF3',
            }}
          >
            {st === 'all' ? `All (${counts.all})` : `${STATUS_LABELS[st]} (${counts[st]})`}
          </button>
        ))}
      </div>

      <div style={s.tableWrap}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ fontSize: 14, color: '#9AAAB8', margin: 0 }}>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ fontSize: 15, color: '#5A7D9A', margin: 0 }}>No {filter === 'all' ? '' : filter + ' '}orders</p>
            <p style={{ fontSize: 12, color: '#9AAAB8', marginTop: 4 }}>
              Orders created through checkout will appear here.
            </p>
          </div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Order #</th>
                <th style={s.th}>Date</th>
                <th style={s.th}>Customer</th>
                <th style={s.th}>Items</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Total</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Payment</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Status</th>
                <th style={s.th}>Tracking</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order, i) => {
                const status = order.fulfillment_status || 'pending';
                const sc = STATUS_COLORS[status];
                const isExpanded = expandedId === order.id;
                const nextStatus = STATUSES[STATUSES.indexOf(status) + 1];
                const items = order.items || [];

                return (
                  <>
                    <tr key={order.id} style={{ ...s.tr, backgroundColor: i % 2 === 0 ? '#fff' : '#F9FBFC', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : order.id)}>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 600 }}>{order.order_number}</td>
                      <td style={s.td}>{new Date(order.created_at).toLocaleDateString()}</td>
                      <td style={s.td}>
                        <div style={{ fontWeight: 600 }}>{order.customer_name}</div>
                        <div style={{ fontSize: 11, color: '#9AAAB8' }}>{order.customer_email}</div>
                      </td>
                      <td style={s.td}>
                        {items.map((it, j) => (
                          <div key={j} style={{ fontSize: 12 }}>{it.name} x{it.quantity}</div>
                        ))}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>${Number(order.total || 0).toFixed(2)}</td>
                      <td style={{ ...s.td, textAlign: 'center', fontSize: 11, fontWeight: 600, color: order.payment_status === 'completed' ? '#16a34a' : '#d97706' }}>
                        {order.payment_status === 'completed' ? 'Paid' : 'Pending'}
                      </td>
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        <span style={{ ...s.statusBadge, backgroundColor: sc.bg, color: sc.color }}>{STATUS_LABELS[status]}</span>
                      </td>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 11, color: '#5A7D9A' }}>{order.tracking || '-'}</td>
                      <td style={s.td} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {nextStatus && (
                            <button style={{ ...s.moveBtn, backgroundColor: STATUS_COLORS[nextStatus].bg, color: STATUS_COLORS[nextStatus].color }} onClick={() => updateStatus(order.id, nextStatus)}>
                              → {STATUS_LABELS[nextStatus]}
                            </button>
                          )}
                          <button style={{ ...s.actionBtn, color: '#dc2626' }} onClick={() => deleteOrder(order.id)}>Del</button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={order.id + '-detail'} style={{ backgroundColor: '#F7FAFB' }}>
                        <td colSpan={9} style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                            <div>
                              <div style={s.detailLabel}>Shipping</div>
                              <div style={s.detailValue}>
                                {order.shipping_address}<br />
                                {order.city}, {order.state} {order.zip}
                              </div>
                            </div>
                            <div>
                              <div style={s.detailLabel}>Items Breakdown</div>
                              {items.map((it, j) => (
                                <div key={j} style={s.detailValue}>
                                  {it.name} ({it.dosage}) — {it.quantity} x ${Number(it.price || 0).toFixed(2)} = ${(it.quantity * Number(it.price || 0)).toFixed(2)}
                                </div>
                              ))}
                              {order.discount > 0 && (
                                <div style={{ ...s.detailValue, color: '#16a34a', marginTop: 4 }}>Discount: -${Number(order.discount).toFixed(2)} ({order.affiliate_code})</div>
                              )}
                              <div style={{ ...s.detailValue, fontWeight: 700, marginTop: 4 }}>Total: ${Number(order.total || 0).toFixed(2)}</div>
                              {order.affiliate_code && (
                                <div style={{ ...s.detailValue, color: '#d97706', marginTop: 4 }}>
                                  Affiliate: {order.affiliate_code} ({order.affiliate_commission_pct}% = ${(Number(order.total || 0) * Number(order.affiliate_commission_pct || 0) / 100).toFixed(2)})
                                </div>
                              )}
                            </div>
                            <div>
                              <div style={s.detailLabel}>Tracking</div>
                              <input
                                style={s.input}
                                defaultValue={order.tracking || ''}
                                onBlur={e => updateTracking(order.id, e.target.value)}
                                placeholder="Enter tracking #"
                                onClick={e => e.stopPropagation()}
                              />
                              {order.notes && (
                                <>
                                  <div style={{ ...s.detailLabel, marginTop: 12 }}>Notes</div>
                                  <div style={s.detailValue}>{order.notes}</div>
                                </>
                              )}
                            </div>
                            <div>
                              <div style={s.detailLabel}>Move to Status</div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                {STATUSES.filter(st => st !== status).map(st => (
                                  <button
                                    key={st}
                                    style={{ ...s.moveBtn, backgroundColor: STATUS_COLORS[st].bg, color: STATUS_COLORS[st].color }}
                                    onClick={e => { e.stopPropagation(); updateStatus(order.id, st); }}
                                  >
                                    {STATUS_LABELS[st]}
                                  </button>
                                ))}
                              </div>
                              <div style={{ ...s.detailLabel, marginTop: 12 }}>Last Updated</div>
                              <div style={s.detailValue}>{new Date(order.updated_at).toLocaleString()}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

const f = "'Helvetica Neue', Arial, sans-serif";
const s = {
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#0D1B2A', fontFamily: f },
  exportBtn: { padding: '9px 16px', borderRadius: 8, border: '1px solid #E4EDF3', backgroundColor: '#fff', color: '#0D1B2A', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f },
  statsRow: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 },
  statCard: { flex: '1 1 140px', backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E4EDF3', padding: '18px 20px' },
  statValue: { fontSize: 26, fontWeight: 700, fontFamily: f },
  statLabel: { fontSize: 12, color: '#9AAAB8', marginTop: 2, fontFamily: f, textTransform: 'uppercase', letterSpacing: 0.5 },
  pill: { padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: f },
  input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #E4EDF3', fontSize: 13, fontFamily: f, color: '#0D1B2A', outline: 'none', boxSizing: 'border-box' },
  tableWrap: { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E4EDF3', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { backgroundColor: '#F4F9FC' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9AAAB8', fontFamily: f, letterSpacing: 0.8, textTransform: 'uppercase', borderBottom: '1px solid #E4EDF3' },
  tr: { borderBottom: '1px solid #F0F4F8' },
  td: { padding: '14px 16px', fontSize: 13, color: '#0D1B2A', fontFamily: f, verticalAlign: 'middle' },
  statusBadge: { fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '3px 10px', fontFamily: f },
  moveBtn: { border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: f },
  actionBtn: { background: 'none', border: '1px solid #E4EDF3', borderRadius: 5, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#0077B6', fontFamily: f, fontWeight: 500 },
  detailLabel: { fontSize: 11, fontWeight: 700, color: '#9AAAB8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: f },
  detailValue: { fontSize: 13, color: '#0D1B2A', fontFamily: f, lineHeight: 1.5 },
};
