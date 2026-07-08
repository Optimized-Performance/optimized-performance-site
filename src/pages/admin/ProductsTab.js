import { useEffect, useState } from 'react';

// Self-service catalog management. Lists every SKU (incl. drafts) from
// /api/admin/products and lets the admin add / edit / publish / unpublish,
// set the visibility tier + rail policy, pricing, stock, etc. Also manages the
// account-gated email allowlist (/api/admin/gated-emails). No code/deploy needed.

const TIERS = [
  { v: 'public', l: 'Public — everyone' },
  { v: 'cohort', l: 'Cohort — ?ref link only' },
  { v: 'account_gated', l: 'Account-gated — allowlist only' },
];
const RAILS = [
  { v: 'all', l: 'All rails' },
  { v: 'p2p_crypto', l: 'Venmo + Zelle + crypto (off card/PayPal)' },
  { v: 'zelle_crypto', l: 'Zelle + crypto only' },
];
const CATEGORIES = ['GLPs', 'Peptides', 'GH Peptides', 'Combos', 'Tinctures', 'Supplements', 'Supplies'];

function emptyForm() {
  return {
    id: '', sku: '', name: '', price: '', description: '', dosage: '',
    category: 'Peptides', format: 'Lyophilized Powder', vialSize: '',
    stock: '', inStock: true, isKit: false, parentId: '', vialCount: '',
    badge: '', visibilityTier: 'account_gated', railPolicy: 'all',
    hasCoa: true, published: false, imageUrl: '', preorderShipDate: '',
  };
}

export default function ProductsTab({ token, showSaveMsg }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // null | '__new__' | <product id>
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [gatedEmails, setGatedEmails] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newNote, setNewNote] = useState('');

  function authHeaders() {
    return { 'Content-Type': 'application/json', 'x-admin-token': token || '' };
  }
  function msg(m) { if (typeof showSaveMsg === 'function') showSaveMsg(m); }

  async function fetchProducts() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/products', { headers: authHeaders() });
      if (res.ok) { const d = await res.json(); setProducts(d.products || []); }
    } catch { /* leave list as-is */ }
    setLoading(false);
  }
  async function fetchGated() {
    try {
      const res = await fetch('/api/admin/gated-emails', { headers: authHeaders() });
      if (res.ok) { const d = await res.json(); setGatedEmails(d.emails || []); }
    } catch { /* */ }
  }
  useEffect(() => { fetchProducts(); fetchGated(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleImageFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) { msg('Image must be JPEG, PNG, or WebP'); return; }
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch('/api/admin/upload-image', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ dataUrl, productId: form.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) { set('imageUrl', d.url); msg('Image uploaded'); }
      else msg(d.error || 'Upload failed');
    } catch { msg('Upload failed'); }
    setUploading(false);
  }

  function startCreate() { setForm(emptyForm()); setEditingId('__new__'); }
  function startEdit(p) {
    setForm({
      id: p.id, sku: p.sku || '', name: p.name || '', price: p.price ?? '',
      description: p.description || '', dosage: p.dosage || '',
      category: p.category || '', format: p.format || '', vialSize: p.vialSize || '',
      stock: p.stock ?? '', inStock: p.inStock !== false, isKit: !!p.isKit,
      parentId: p.parentId || '', vialCount: p.vialCount ?? '',
      badge: typeof p.badge === 'string' ? p.badge : (p.badge ? JSON.stringify(p.badge) : ''),
      visibilityTier: p.visibilityTier || 'public', railPolicy: p.railPolicy || 'all',
      hasCoa: !p.noCoa, published: !!p.published, imageUrl: p.imageUrl || '',
      preorderShipDate: p.preorderShipDate || '',
    });
    setEditingId(p.id);
  }
  function cancel() { setEditingId(null); setForm(emptyForm()); }
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    const isNew = editingId === '__new__';
    const payload = {
      id: form.id.trim(), sku: form.sku.trim(), name: form.name.trim(),
      price: form.price, description: form.description, dosage: form.dosage,
      category: form.category, format: form.format, vialSize: form.vialSize,
      stock: form.stock === '' ? null : form.stock,
      inStock: form.inStock, isKit: form.isKit,
      parentId: form.parentId || null,
      vialCount: form.vialCount === '' ? null : form.vialCount,
      badge: form.badge ? form.badge : null,
      visibilityTier: form.visibilityTier, railPolicy: form.railPolicy,
      hasCoa: form.hasCoa, published: form.published,
      imageUrl: form.imageUrl || null,
      preorderShipDate: form.preorderShipDate || null,
    };
    try {
      const res = await fetch('/api/admin/products', {
        method: isNew ? 'POST' : 'PATCH', headers: authHeaders(), body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { msg(d.error || 'Save failed'); setSaving(false); return; }
      msg(isNew ? 'Product created' : 'Product updated');
      cancel();
      await fetchProducts();
    } catch { msg('Save failed'); }
    setSaving(false);
  }

  async function togglePublished(p) {
    try {
      const res = await fetch('/api/admin/products', {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ id: p.id, published: !p.published }),
      });
      if (res.ok) { msg(!p.published ? 'Published' : 'Unpublished'); await fetchProducts(); }
    } catch { /* */ }
  }

  async function addGated(e) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    try {
      const res = await fetch('/api/admin/gated-emails', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ email: newEmail, note: newNote }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setNewEmail(''); setNewNote(''); await fetchGated(); msg('Access granted'); }
      else msg(d.error || 'Failed');
    } catch { msg('Failed'); }
  }
  async function removeGated(email) {
    try {
      const res = await fetch('/api/admin/gated-emails', {
        method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ email }),
      });
      if (res.ok) { await fetchGated(); msg('Access revoked'); }
    } catch { /* */ }
  }

  const editing = editingId !== null;
  const isNew = editingId === '__new__';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-ink m-0">Catalog ({products.length})</h2>
        {!editing && (
          <button onClick={startCreate} className="btn-primary px-4">+ Add product</button>
        )}
      </div>

      {editing && (
        <form onSubmit={save} className="mb-8 p-4 border border-line rounded-opp bg-white/5">
          <h3 className="text-base font-semibold text-ink mt-0 mb-3">{isNew ? 'New product' : `Edit ${form.id}`}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="ID (slug)">
              <input className="input-field" required value={form.id} disabled={!isNew}
                onChange={(e) => set('id', e.target.value)} placeholder="e.g. bpc-157-5mg" />
            </Field>
            <Field label="SKU"><input className="input-field" required value={form.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
            <Field label="Name"><input className="input-field" required value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Price (USD)"><input className="input-field" type="number" step="0.01" required value={form.price} onChange={(e) => set('price', e.target.value)} /></Field>
            <Field label="Dosage"><input className="input-field" value={form.dosage} onChange={(e) => set('dosage', e.target.value)} /></Field>
            <Field label="Category">
              <select className="input-field" value={form.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Format"><input className="input-field" value={form.format} onChange={(e) => set('format', e.target.value)} /></Field>
            <Field label="Vial / size"><input className="input-field" value={form.vialSize} onChange={(e) => set('vialSize', e.target.value)} /></Field>
            <Field label="Badge"><input className="input-field" value={form.badge} onChange={(e) => set('badge', e.target.value)} placeholder="e.g. HERO / NEW" /></Field>
            <Field label="Stock"><input className="input-field" type="number" value={form.stock} onChange={(e) => set('stock', e.target.value)} placeholder="(blank = derive from kit)" /></Field>
            <Field label="Preorder ship date"><input className="input-field" type="date" value={form.preorderShipDate} onChange={(e) => set('preorderShipDate', e.target.value)} title="Shown on preorder items (stock 0) as 'ships ~DATE'. Leave blank for 'ship date TBD'." /></Field>
            <Field label="Parent ID (kits)"><input className="input-field" value={form.parentId} onChange={(e) => set('parentId', e.target.value)} /></Field>
            <Field label="Vials per kit"><input className="input-field" type="number" value={form.vialCount} onChange={(e) => set('vialCount', e.target.value)} /></Field>
            <Field label="Visibility tier">
              <select className="input-field" value={form.visibilityTier} onChange={(e) => set('visibilityTier', e.target.value)}>
                {TIERS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </Field>
            <Field label="Rail policy">
              <select className="input-field" value={form.railPolicy} onChange={(e) => set('railPolicy', e.target.value)}>
                {RAILS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea className="input-field w-full" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label="Thumbnail">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleImageFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
              className="flex items-center gap-4 p-3 border border-dashed border-line rounded-opp"
            >
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="thumbnail" className="w-16 h-16 object-cover rounded" />
              ) : (
                <div className="w-16 h-16 rounded bg-white/5 flex items-center justify-center text-ink-soft text-[11px]">none</div>
              )}
              <div className="text-sm text-ink-soft">
                <label className="btn-primary px-3 py-1.5 cursor-pointer inline-block">
                  {uploading ? 'Uploading…' : 'Choose / drop image'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={(e) => handleImageFile(e.target.files && e.target.files[0])} />
                </label>
                {form.imageUrl && <button type="button" onClick={() => set('imageUrl', '')} className="ml-3 text-danger text-[13px] hover:underline">Remove</button>}
                <div className="text-[11px] mt-1">JPEG/PNG/WebP · drag-drop or click · falls back to the Vial graphic if none</div>
              </div>
            </div>
          </Field>
          <div className="flex flex-wrap gap-5 mt-3 mb-4 text-sm text-ink">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.isKit} onChange={(e) => set('isKit', e.target.checked)} /> Kit</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.inStock} onChange={(e) => set('inStock', e.target.checked)} /> In stock</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.hasCoa} onChange={(e) => set('hasCoa', e.target.checked)} /> Has COA</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} /> Published (visible on site)</label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary px-5">{saving ? 'Saving…' : (isNew ? 'Create' : 'Save')}</button>
            <button type="button" onClick={cancel} className="px-4 py-2 border border-line rounded-opp text-sm text-ink-soft hover:text-ink">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="opp-meta-mono text-ink-soft">Loading catalog…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft border-b border-line">
                <th className="py-2 pr-3">Name</th><th className="py-2 pr-3">SKU</th><th className="py-2 pr-3">Price</th>
                <th className="py-2 pr-3">Tier</th><th className="py-2 pr-3">Rails</th><th className="py-2 pr-3">Status</th><th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-line/50 text-ink">
                  <td className="py-2 pr-3">{p.name} <span className="text-ink-soft">{p.dosage}</span></td>
                  <td className="py-2 pr-3 font-mono text-[12px] text-ink-soft">{p.sku}</td>
                  <td className="py-2 pr-3">${Number(p.price).toFixed(2)}</td>
                  <td className="py-2 pr-3">{p.visibilityTier}</td>
                  <td className="py-2 pr-3">{p.railPolicy}</td>
                  <td className="py-2 pr-3">{p.published ? <span className="text-accent">live</span> : <span className="text-ink-soft">draft</span>}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(p)} className="text-accent hover:underline mr-3">Edit</button>
                    <button onClick={() => togglePublished(p)} className="text-ink-soft hover:text-ink">{p.published ? 'Unpublish' : 'Publish'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Account-gated allowlist (by email) */}
      <div className="mt-10 pt-6 border-t border-line">
        <h2 className="text-lg font-semibold text-ink mb-1">Account-gated allowlist</h2>
        <p className="opp-meta-mono text-ink-soft mb-3">Emails here see <code>account_gated</code> SKUs once logged in. Grant works before they register.</p>
        <form onSubmit={addGated} className="flex flex-wrap gap-2 mb-4">
          <input className="input-field" type="email" placeholder="email@example.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <input className="input-field" placeholder="note (optional)" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
          <button type="submit" className="btn-primary px-4">Grant</button>
        </form>
        {gatedEmails.length === 0 ? (
          <p className="opp-meta-mono text-ink-soft">No one allowlisted yet.</p>
        ) : (
          <ul className="text-sm text-ink">
            {gatedEmails.map((g) => (
              <li key={g.email} className="flex items-center justify-between py-1.5 border-b border-line/50">
                <span>{g.email}{g.note ? <span className="text-ink-soft"> — {g.note}</span> : null}</span>
                <button onClick={() => removeGated(g.email)} className="text-danger hover:underline text-[13px]">Revoke</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-[12px] text-ink-soft mb-1">{label}</span>
      {children}
    </label>
  );
}
