import { useState, useEffect } from 'react';
import InventoryTab from './InventoryTab';
import ProductsTab from './ProductsTab';
import SupplyTab from './SupplyTab';
import BatchesTab from './BatchesTab';
import OrdersTab from './OrdersTab';
import CustomersTab from './CustomersTab';
import AffiliatesTab from './AffiliatesTab';
import PayoutsTab from './PayoutsTab';
import ChargebacksTab from './ChargebacksTab';
import InboxTab from './InboxTab';
import AccessRequestsTab from './AccessRequestsTab';
import RailsTab from './RailsTab';
import FunnelTab from './FunnelTab';
import AnalyticsTab from './AnalyticsTab';
import MarginsTab from './MarginsTab';
import BroadcastTab from './BroadcastTab';
import { Logo } from '../../components/Primitives';

// Admin session token is kept in React state only — never in sessionStorage or
// localStorage — so a cross-site scripting payload cannot steal it.
// Refresh = fresh login. That's intentional.

export default function AdminPage() {
  const [token, setToken] = useState(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState('orders');
  const [saveMsg, setSaveMsg] = useState('');
  // Mobile "More" action sheet (coaching-app pattern) — holds the tabs that
  // don't fit the bottom bar.
  const [moreOpen, setMoreOpen] = useState(false);
  // Product catalog is loaded via a DYNAMIC import gated on auth, NOT a static
  // top-level import. A static import kept the full catalog (incl. restricted
  // SKUs) in a shared client chunk that public pages also load — defeating the
  // cohort gate. Dynamic + post-auth means the catalog ships in its own
  // on-demand chunk that only loads after admin login, and tree-shakes out of
  // the public bundle entirely.
  const [catalog, setCatalog] = useState([]);

  const authed = !!token;

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    // Catalog now comes from the DB via the admin products API (was a dynamic
    // import of the static data/products array). The Products tab writes back
    // to this same endpoint, so edits show on refresh.
    fetch('/api/admin/products', { headers: { 'x-admin-token': token } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.products) setCatalog(d.products); })
      .catch(() => { /* tabs render empty until retry/refresh */ });
    return () => { cancelled = true; };
  }, [authed, token]);

  async function handleLogin(e) {
    e.preventDefault();
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.status === 401) {
      setAuthError('Incorrect password.');
    } else if (!res.ok) {
      setAuthError('Server error. Check ADMIN_PASSWORD and ADMIN_SESSION_SECRET env vars.');
    } else {
      const { token: t } = await res.json();
      setToken(t);
      setPassword('');
      setAuthError('');
    }
  }

  function logout() {
    setToken(null);
  }

  function showSaveMsg(msg) {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(''), 3000);
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-8">
        <div className="bg-surface border border-line rounded-opp-lg p-10 w-full max-w-sm text-center">
          <div className="flex justify-center mb-4 text-ink">
            <Logo size={36} />
          </div>
          <h2 className="font-display font-semibold tracking-display text-2xl m-0 mb-1 text-ink">Admin Access</h2>
          <p className="opp-meta-mono uppercase m-0 mb-7">Syngyn</p>
          <form onSubmit={handleLogin} className="flex flex-col gap-2.5">
            <input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              autoFocus
            />
            {authError && <p className="text-danger text-[13px] m-0">{authError}</p>}
            <button type="submit" className="btn-primary">Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'orders', label: 'Orders' },
    { id: 'customers', label: 'Customers' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'products', label: 'Products' },
    { id: 'supply', label: 'Supply Tracker' },
    { id: 'batches', label: 'Batches' },
    { id: 'affiliates', label: 'Affiliates' },
    { id: 'payouts', label: 'Payouts' },
    { id: 'chargebacks', label: 'Chargebacks' },
    { id: 'rails', label: 'Rails' },
    { id: 'funnel', label: 'Funnel' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'margins', label: 'Margins' },
    { id: 'broadcast', label: 'Broadcast' },
    { id: 'access', label: 'Access Requests' },
    { id: 'inbox', label: 'Inbox' },
  ];

  // Bottom-bar primaries (mobile). Everything else lives in the More sheet.
  const primaryMobile = ['orders', 'customers', 'products', 'analytics'];
  const selectTab = (id) => {
    setActiveTab(id);
    setMoreOpen(false);
  };

  return (
    <div className="min-h-screen bg-paper admin-shell">
      <div className="bg-ink text-paper admin-header">
        <div className="max-w-container mx-auto px-4 sm:px-8 py-5 flex justify-between items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Logo size={28} />
            <div>
              <h1 className="font-display font-semibold tracking-display text-xl m-0">Admin Dashboard</h1>
              <p className="font-mono text-[11px] text-paper/50 tracking-wider m-0 mt-0.5">
                Syngyn
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveMsg && (
              <span
                className={`font-mono text-[12px] ${saveMsg.toLowerCase().includes('failed') ? 'text-danger' : 'text-accent'}`}
              >
                {saveMsg}
              </span>
            )}
            <button
              onClick={logout}
              className="px-4 py-2 border border-white/20 rounded-opp text-[13px] text-paper hover:bg-white/10 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-container mx-auto px-4 sm:px-8 py-6 sm:py-8 admin-content">
        <div className="admin-tabs flex gap-1 mb-6 sm:mb-8 border-b border-line overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={`px-4 sm:px-5 py-3 text-sm border-b-2 -mb-px shrink-0 whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? 'text-ink border-ink font-semibold'
                  : 'text-ink-soft border-transparent hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* keyed remount = quick fade-rise on every tab switch (coaching-app view-anim) */}
        <div key={activeTab} className="fade-rise">
        {activeTab === 'orders' && <OrdersTab products={catalog} showSaveMsg={showSaveMsg} token={token} />}
        {activeTab === 'customers' && <CustomersTab token={token} showSaveMsg={showSaveMsg} />}
        {activeTab === 'inventory' && <InventoryTab products={catalog} showSaveMsg={showSaveMsg} token={token} />}
        {activeTab === 'products' && <ProductsTab token={token} showSaveMsg={showSaveMsg} />}
        {activeTab === 'supply' && <SupplyTab products={catalog} token={token} />}
        {activeTab === 'batches' && <BatchesTab products={catalog} showSaveMsg={showSaveMsg} token={token} />}
        {activeTab === 'affiliates' && <AffiliatesTab showSaveMsg={showSaveMsg} token={token} />}
        {activeTab === 'payouts' && <PayoutsTab showSaveMsg={showSaveMsg} token={token} />}
        {activeTab === 'chargebacks' && <ChargebacksTab showSaveMsg={showSaveMsg} token={token} />}
        {activeTab === 'rails' && <RailsTab showSaveMsg={showSaveMsg} token={token} />}
        {activeTab === 'funnel' && <FunnelTab token={token} />}
        {activeTab === 'analytics' && <AnalyticsTab token={token} />}
        {activeTab === 'margins' && <MarginsTab token={token} />}
        {activeTab === 'broadcast' && <BroadcastTab products={catalog} showSaveMsg={showSaveMsg} token={token} />}
        {activeTab === 'access' && <AccessRequestsTab showSaveMsg={showSaveMsg} token={token} />}
        {activeTab === 'inbox' && <InboxTab showSaveMsg={showSaveMsg} token={token} />}
        </div>
      </div>

      {/* Mobile bottom tab bar (coaching-app shell). Hidden ≥701px via CSS. */}
      <nav className="admin-bottom-bar">
        {tabs.filter((t) => primaryMobile.includes(t.id)).map((t) => (
          <button
            key={t.id}
            className={activeTab === t.id && !moreOpen ? 'active' : ''}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button
          className={moreOpen || !primaryMobile.includes(activeTab) ? 'active' : ''}
          onClick={() => setMoreOpen(true)}
        >
          More
        </button>
      </nav>

      {moreOpen && (
        <>
          <div className="admin-sheet-bg" onClick={() => setMoreOpen(false)} />
          <div className="admin-sheet">
            <div className="p-2 grid grid-cols-2 gap-1">
              {tabs.filter((t) => !primaryMobile.includes(t.id)).map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTab(t.id)}
                  className={`px-4 py-3.5 rounded-opp text-left text-[14px] font-semibold ${
                    activeTab === t.id ? 'bg-accent-soft text-accent-strong' : 'text-ink-soft'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <button
                onClick={() => { setMoreOpen(false); logout(); }}
                className="px-4 py-3.5 text-left text-[14px] font-semibold text-danger col-span-2 border-t border-line"
              >
                Log out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
