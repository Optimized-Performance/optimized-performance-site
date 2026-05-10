import { useEffect, useMemo, useRef, useState } from 'react';

// Customer-facing production lots — the digital lot system. Each row is one
// (sku, lot_number) batch with chain-of-custody back to a supply_lots row,
// plus on-demand Phomemo label printing. See migration v11.

function todayYYMMDD(suffix = '') {
  const d = new Date();
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}${suffix ? `-${suffix}` : ''}`;
}

function emptyForm(products) {
  return {
    sku: products[0]?.id || '',
    lotNumber: todayYYMMDD(),
    productionDate: new Date().toISOString().split('T')[0],
    expiryDate: '',
    supplierLotId: '',
    vialsProduced: '',
    notes: '',
  };
}

export default function BatchesTab({ products, showSaveMsg, token }) {
  const [batches, setBatches] = useState([]);
  const [supplyLots, setSupplyLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm(products));
  const [printingId, setPrintingId] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef(null);

  useEffect(() => {
    fetchBatches();
    fetchSupplyLots();
  }, []);

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-admin-token': token || '',
    };
  }

  async function fetchBatches() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/batches', { headers: authHeaders() });
      if (res.ok) setBatches(await res.json());
    } catch { /* fail */ }
    setLoading(false);
  }

  async function fetchSupplyLots() {
    try {
      const res = await fetch('/api/admin/lots', { headers: authHeaders() });
      if (res.ok) setSupplyLots(await res.json());
    } catch { /* fail */ }
  }

  function resetForm() {
    setForm(emptyForm(products));
    setEditingId(null);
  }

  // Auto-suggest a YYMMDD lot number, with -A/-B/-C suffix if today already has
  // a batch for the selected SKU. Caller can override manually.
  function suggestLot(sku) {
    if (!sku) return todayYYMMDD();
    const today = todayYYMMDD();
    const sameDay = batches.filter(
      (b) => b.sku === sku && (b.lot_number === today || b.lot_number.startsWith(`${today}-`))
    );
    if (sameDay.length === 0) return today;
    const suffix = String.fromCharCode(65 + sameDay.length); // A, B, C…
    return `${today}-${suffix}`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const body = {
      sku: form.sku,
      lotNumber: form.lotNumber.trim().toUpperCase(),
      productionDate: form.productionDate,
      expiryDate: form.expiryDate || undefined,
      supplierLotId: form.supplierLotId || undefined,
      vialsProduced: parseInt(form.vialsProduced) || 0,
      notes: form.notes,
    };

    const method = editingId ? 'PATCH' : 'POST';
    if (editingId) body.id = editingId;

    try {
      const res = await fetch('/api/admin/batches', {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showSaveMsg(`Failed: ${err.error || 'unknown error'}`);
        return;
      }
      await fetchBatches();
      resetForm();
      setShowForm(false);
      showSaveMsg(editingId ? 'Batch updated.' : 'Batch created.');
    } catch {
      showSaveMsg('Save failed.');
    }
  }

  function handleEdit(batch) {
    setForm({
      sku: batch.sku,
      lotNumber: batch.lot_number,
      productionDate: batch.production_date,
      expiryDate: batch.expiry_date || '',
      supplierLotId: batch.supplier_lot_id || '',
      vialsProduced: String(batch.vials_produced || ''),
      notes: batch.notes || '',
    });
    setEditingId(batch.id);
    setShowForm(true);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this batch? Label-print audit rows will be removed too.')) return;
    try {
      await fetch('/api/admin/batches', {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ id }),
      });
      await fetchBatches();
      showSaveMsg('Batch deleted.');
    } catch { /* fail */ }
  }

  // Print N labels — server returns a PNG sized 2"×1" two-up at 203 DPI ready
  // to send to Phomemo. We open it in a new tab so the user can save or print
  // via the Phomemo Print app.
  async function handlePrint(batch) {
    const qtyStr = window.prompt(`How many labels for ${batch.sku} lot ${batch.lot_number}?`, '50');
    const qty = parseInt(qtyStr || '0');
    if (!qty || qty < 1) return;
    setPrintingId(batch.id);
    try {
      const res = await fetch('/api/admin/labels/print', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ batchId: batch.id, qty }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showSaveMsg(`Print failed: ${err.error || 'unknown error'}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Open in new tab — user can right-click → save, or print directly.
      window.open(url, '_blank');
      showSaveMsg(`Label PNG ready (${qty} prints logged).`);
      await fetchBatches();
    } catch {
      showSaveMsg('Print failed.');
    } finally {
      setPrintingId(null);
    }
  }

  // Upload a Vanguard COA PDF for the given batch. Opens the hidden <input
  // type="file"> picker; once a file is chosen, onUploadFileChosen runs the
  // POST. Storage object key is derived server-side from the batch row, so
  // the client only needs to send the binary PDF + batchId.
  function handleUpload(batch) {
    uploadTargetRef.current = batch;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  async function onUploadFileChosen(e) {
    const file = e.target.files?.[0];
    const batch = uploadTargetRef.current;
    uploadTargetRef.current = null;
    if (!file || !batch) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showSaveMsg('Only PDF uploads are supported.');
      return;
    }
    setUploadingId(batch.id);
    try {
      const res = await fetch(`/api/admin/batches/upload-coa?batchId=${encodeURIComponent(batch.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf', 'x-admin-token': token || '' },
        body: file,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showSaveMsg(`Upload failed: ${err.error || res.status}`);
        return;
      }
      const json = await res.json();
      await fetchBatches();
      showSaveMsg(`COA uploaded (${Math.round((json.bytes || 0) / 1024)} KB). Live at ${json.coaUrl}`);
    } catch (err) {
      showSaveMsg(`Upload failed: ${err.message}`);
    } finally {
      setUploadingId(null);
    }
  }

  function getProductName(sku) {
    const p = products.find((p) => p.id === sku);
    return p ? `${p.name} ${p.dosage || ''}`.trim() : sku;
  }

  function getSupplierLotLabel(supplyLotId) {
    if (!supplyLotId) return '—';
    const sl = supplyLots.find((s) => s.id === supplyLotId);
    if (!sl) return '(missing)';
    return `${sl.lot_number}${sl.supplier_lot ? ` / ${sl.supplier_lot}` : ''}`;
  }

  // Filter supply lots to those matching the selected SKU's product_id —
  // narrows the FK picker so it's not 50 entries long.
  const candidateSupplyLots = useMemo(
    () => supplyLots.filter((s) => s.product_id === form.sku),
    [supplyLots, form.sku]
  );

  const stats = useMemo(() => ({
    totalBatches: batches.length,
    coasOnFile: batches.filter((b) => !!b.coa_pdf_path).length,
    coasMissing: batches.filter((b) => !b.coa_pdf_path).length,
    skusTracked: new Set(batches.map((b) => b.sku)).size,
  }), [batches]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={onUploadFileChosen}
      />
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display font-semibold tracking-display text-xl m-0 text-ink">Batches</h2>
          <p className="opp-meta-mono mt-1 m-0">Customer-facing production lots, COA tracking, and Phomemo label printing.</p>
        </div>
        <button
          className="btn-primary text-xs px-4 py-2"
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
        >
          {showForm ? 'Cancel' : '+ New Batch'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
        <Stat value={stats.totalBatches} label="Total Batches" />
        <Stat value={stats.coasOnFile} label="COAs Filed" />
        <Stat value={stats.coasMissing} label="COAs Missing" warn={stats.coasMissing > 0} />
        <Stat value={stats.skusTracked} label="SKUs Tracked" />
      </div>

      {showForm && (
        <div className="card-premium p-6 mb-5">
          <h3 className="font-display font-semibold text-base mb-4 text-ink">
            {editingId ? 'Edit Batch' : 'New Batch'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-4">
              <Field label="SKU">
                <select
                  className="input-field"
                  value={form.sku}
                  onChange={(e) => {
                    const sku = e.target.value;
                    setForm((f) => ({
                      ...f,
                      sku,
                      lotNumber: editingId ? f.lotNumber : suggestLot(sku),
                    }));
                  }}
                >
                  {products.filter((p) => !p.isKit).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} {p.dosage}</option>
                  ))}
                </select>
              </Field>
              <Field label="Lot Number (YYMMDD or YYMMDD-A)">
                <div className="flex gap-1.5">
                  <input
                    className="input-field flex-1 font-mono font-semibold"
                    value={form.lotNumber}
                    onChange={(e) => setForm({ ...form, lotNumber: e.target.value })}
                    placeholder="260504"
                    required
                  />
                  <button
                    type="button"
                    className="btn-outline text-xs px-3 py-2"
                    onClick={() => setForm((f) => ({ ...f, lotNumber: suggestLot(f.sku) }))}
                  >
                    Auto
                  </button>
                </div>
              </Field>
              <Field label="Vials Produced">
                <input
                  type="number"
                  className="input-field"
                  value={form.vialsProduced}
                  onChange={(e) => setForm({ ...form, vialsProduced: e.target.value })}
                  min="0"
                />
              </Field>
              <Field label="Production Date">
                <input
                  type="date"
                  className="input-field"
                  value={form.productionDate}
                  onChange={(e) => setForm({ ...form, productionDate: e.target.value })}
                  required
                />
              </Field>
              <Field label="Expiry Date (defaults to +24mo)">
                <input
                  type="date"
                  className="input-field"
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                  placeholder="auto"
                />
              </Field>
              <Field label="Supplier Lot (chain of custody)">
                <select
                  className="input-field"
                  value={form.supplierLotId}
                  onChange={(e) => setForm({ ...form, supplierLotId: e.target.value })}
                >
                  <option value="">— none —</option>
                  {candidateSupplyLots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.lot_number}{s.supplier_lot ? ` / ${s.supplier_lot}` : ''} ({s.qty_remaining} left)
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Notes">
                <input
                  className="input-field"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional"
                />
              </Field>
            </div>
            <button type="submit" className="btn-primary">
              {editingId ? 'Update Batch' : 'Create Batch'}
            </button>
          </form>
        </div>
      )}

      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-ink-mute m-0">Loading…</p>
          </div>
        ) : batches.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[15px] text-ink-soft m-0">No batches yet</p>
            <p className="opp-meta-mono mt-1 m-0">Click &quot;+ New Batch&quot; to register your first production lot.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-surfaceAlt">
              <tr>
                {['SKU', 'Lot #', 'Produced', 'Expires', 'Vials', 'Supplier Lot', 'COA', 'Notes', 'Actions'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute border-b border-line ${
                      i === 4 || i === 6 ? 'text-center' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <span className="opp-meta-mono bg-surfaceAlt px-2 py-0.5 rounded-full">{getProductName(b.sku)}</span>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-ink">{b.lot_number}</td>
                  <td className="px-4 py-3 text-ink-soft">{b.production_date}</td>
                  <td className="px-4 py-3 text-ink-soft">{b.expiry_date || '—'}</td>
                  <td className="px-4 py-3 text-center">{b.vials_produced || 0}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-soft">{getSupplierLotLabel(b.supplier_lot_id)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-semibold ${b.coa_pdf_path ? 'text-success' : 'text-danger'}`}>
                      {b.coa_pdf_path ? 'On file' : 'Missing'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-soft">{b.notes || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        className="text-[11px] px-2.5 py-1 rounded-opp border border-accent-strong/40 bg-accent-soft text-accent-strong hover:bg-accent-soft/80 disabled:opacity-50"
                        onClick={() => handlePrint(b)}
                        disabled={printingId === b.id}
                      >
                        {printingId === b.id ? 'Printing…' : 'Print Labels'}
                      </button>
                      <button
                        className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-accent-strong hover:bg-surfaceAlt disabled:opacity-50"
                        onClick={() => handleUpload(b)}
                        disabled={uploadingId === b.id}
                        title={b.coa_pdf_path ? 'Replace COA PDF' : 'Upload COA PDF'}
                      >
                        {uploadingId === b.id ? 'Uploading…' : b.coa_pdf_path ? 'Replace COA' : 'Upload COA'}
                      </button>
                      <button
                        className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-accent-strong hover:bg-surfaceAlt"
                        onClick={() => handleEdit(b)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-danger hover:bg-surfaceAlt"
                        onClick={() => handleDelete(b.id)}
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="opp-meta-mono uppercase">{label}</span>
      {children}
    </label>
  );
}

function Stat({ value, label, warn }) {
  return (
    <div className="card-premium p-5">
      <div className={`font-display font-semibold tracking-display text-2xl ${warn ? 'text-warning' : 'text-ink'}`}>
        {value}
      </div>
      <div className="opp-meta-mono uppercase mt-1">{label}</div>
    </div>
  );
}
