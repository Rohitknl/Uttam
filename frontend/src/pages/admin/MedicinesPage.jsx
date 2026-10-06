import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Printer } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Modal, Input, Select, Combobox, Table, SearchBar, PageHeader, LoadingSpinner, Alert } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { medicinesApi, medicineCodesApi } from '../../api';
import { printHtml } from '../../utils/print';

const TYPES = ['VATI', 'CHURNA', 'ARISHTA', 'SYRUP', 'TAILA', 'GHRITA', 'BHASMA', 'LEHYA', 'KWATH', 'TABLET', 'CAPSULE', 'OTHER'];

function extractCodeSortKey(code) {
  const str = String(code || '').trim().toUpperCase();
  const match = str.match(/^(.*?)(\d+)$/);
  if (match) {
    return { prefix: match[1], num: parseInt(match[2], 10) };
  }
  return { prefix: str, num: null };
}

function isCodeInRange(code, fromCode, toCode) {
  const c = String(code || '').trim().toUpperCase();
  const from = String(fromCode || '').trim().toUpperCase();
  const to = String(toCode || '').trim().toUpperCase();

  if (!from && !to) return true;

  const cKey = extractCodeSortKey(c);
  const fromKey = from ? extractCodeSortKey(from) : null;
  const toKey = to ? extractCodeSortKey(to) : null;

  if (cKey.num != null) {
    if (fromKey && toKey && fromKey.prefix === toKey.prefix && cKey.prefix === fromKey.prefix) {
      if (fromKey.num != null && toKey.num != null) {
        return cKey.num >= fromKey.num && cKey.num <= toKey.num;
      }
    }
    if (fromKey && !toKey && fromKey.prefix === cKey.prefix && fromKey.num != null) {
      return cKey.num >= fromKey.num;
    }
    if (!fromKey && toKey && toKey.prefix === cKey.prefix && toKey.num != null) {
      return cKey.num <= toKey.num;
    }
  }

  const cNum = Number(c);
  const fromNum = from ? Number(from) : NaN;
  const toNum = to ? Number(to) : NaN;
  if (!isNaN(cNum)) {
    if (!isNaN(fromNum) && !isNaN(toNum)) {
      return cNum >= fromNum && cNum <= toNum;
    }
    if (!isNaN(fromNum) && isNaN(toNum)) {
      return cNum >= fromNum;
    }
    if (isNaN(fromNum) && !isNaN(toNum)) {
      return cNum <= toNum;
    }
  }

  const compareNatural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  if (from && to) {
    return compareNatural(c, from) >= 0 && compareNatural(c, to) <= 0;
  }
  if (from) {
    return compareNatural(c, from) >= 0;
  }
  if (to) {
    return compareNatural(c, to) <= 0;
  }
  return true;
}

function getCodeSeries(code) {
  const raw = String(code || '').trim().toUpperCase();
  const match = raw.match(/^(.*?)(\d+)$/);
  if (!match) return { prefix: raw, num: null, width: 2 };
  return { prefix: match[1], num: parseInt(match[2], 10), width: match[2].length };
}

const emptyForm = () => ({
  name: '',
  medicineCodeId: '',
  type: 'OTHER',
  unit: 'PIECES',
  stockLocation: '',
  rackCode: '',
  currentStock: '',
  pricePerUnit: '',
  minimumStockAlert: '',
  expiryDate: '',
});

function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function MedicinesPage() {
  const { canWrite } = useAuth();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [availableCodes, setAvailableCodes] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [crudPassword, setCrudPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [error, setError] = useState('');
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printMode, setPrintMode] = useState('all');
  const [fromCode, setFromCode] = useState('');
  const [toCode, setToCode] = useState('');
  const [fromRow, setFromRow] = useState('');
  const [toRow, setToRow] = useState('');
  const [printSeries, setPrintSeries] = useState('');

  const load = () => {
    setLoading(true);
    medicinesApi.getAll({ search: search || undefined }).then(setItems).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const codeA = a.medicineCode || '';
      const codeB = b.medicineCode || '';
      if (!codeA && !codeB) return (a.name || '').localeCompare(b.name || '');
      if (!codeA) return 1;
      if (!codeB) return -1;
      const cmp = String(codeA).localeCompare(String(codeB), undefined, { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [items]);

  const seriesOptions = useMemo(() => {
    const set = new Set();
    for (const item of sortedItems) {
      const { prefix } = getCodeSeries(item.medicineCode);
      if (prefix) set.add(prefix);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [sortedItems]);

  const printableItems = useMemo(() => {
    let result = sortedItems;

    if (printMode === 'series') {
      if (printSeries) {
        result = result.filter(item => {
          const { prefix } = getCodeSeries(item.medicineCode);
          return prefix === printSeries;
        });
      }
    } else if (printMode === 'codeRange') {
      result = result.filter(item => isCodeInRange(item.medicineCode, fromCode, toCode));
    } else if (printMode === 'rowRange') {
      const start = parseInt(fromRow, 10);
      const end = parseInt(toRow, 10);
      const min = Number.isFinite(start) && start > 0 ? start - 1 : 0;
      const max = Number.isFinite(end) && end > 0 ? end : result.length;
      result = result.slice(min, max);
    }

    return result;
  }, [sortedItems, printMode, printSeries, fromCode, toCode, fromRow, toRow]);

  const openPrintModal = () => {
    setPrintMode('all');
    setFromCode('');
    setToCode('');
    setFromRow('');
    setToRow('');
    setPrintSeries(seriesOptions[0] || '');
    setPrintModalOpen(true);
  };

  const handlePrint = () => {
    if (!printableItems.length) return;

    const esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    let rangeLabel = 'All Medicines';
    if (printMode === 'codeRange') {
      rangeLabel = `Code Range: ${fromCode || (sortedItems[0]?.medicineCode ?? 'Start')} to ${toCode || (sortedItems[sortedItems.length - 1]?.medicineCode ?? 'End')}`;
    } else if (printMode === 'rowRange') {
      rangeLabel = `Row Range: #${fromRow || '1'} to #${toRow || sortedItems.length}`;
    } else if (printMode === 'series' && printSeries) {
      rangeLabel = `Series: ${printSeries} (${printableItems.length} records)`;
    }

    const rows = printableItems.map((item, idx) => `
      <tr>
        <td class="c">${idx + 1}</td>
        <td class="code">${esc(item.medicineCode || '—')}</td>
        <td class="bold">${esc(item.name || '—')}</td>
        <td>${esc(item.type || '—')}</td>
        <td>${esc(item.stockLocation || '—')}</td>
        <td>${esc(item.rackCode || '—')}</td>
        <td class="r">${item.currentStock ?? 0} ${esc(item.unit || '')}</td>
        <td class="r">${item.minimumStockAlert ?? 0}</td>
        <td>${item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN') : '—'}</td>
        <td class="r">₹${item.pricePerUnit ?? 0}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Medicines Directory - Uttam Laboratories</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 24px; color: #1a2e22; font-size: 12px; }
    .brand { font-size: 18px; font-weight: 800; color: #1e3a2b; letter-spacing: 0.5px; }
    .sub { font-size: 11px; color: #4a5d4e; margin-bottom: 8px; }
    h1 { font-size: 15px; margin: 0 0 12px; font-weight: 700; color: #111; letter-spacing: 0.5px; border-bottom: 2px solid #1e3a2b; padding-bottom: 4px; }
    .meta { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 12px; font-size: 11px; color: #4a5d4e; }
    .meta strong { color: #1a2e22; margin-left: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #c5d0c8; padding: 6px 8px; text-align: left; }
    th { background: #e8efe9; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: #1e3a2b; }
    tr:nth-child(even) { background: #f9fbf9; }
    .c { text-align: center; }
    .r { text-align: right; }
    .code { font-family: monospace; font-weight: 700; color: #1e3a2b; }
    .bold { font-weight: 600; }
    .foot { margin-top: 24px; color: #5c6b60; font-size: 11px; border-top: 1px dashed #c5d0c8; padding-top: 8px; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 0; }
      @page { margin: 10mm; size: auto; }
    }
  </style>
</head>
<body>
  <div class="brand">Uttam Laboratories</div>
  <div class="sub">Ayurvedic Stock &amp; Inventory</div>
  <h1>MEDICINES INVENTORY DIRECTORY</h1>
  <div class="meta">
    <div>Filter:<strong>${esc(rangeLabel)}</strong></div>
    <div>Total Records:<strong>${printableItems.length}</strong></div>
    <div>Printed Date:<strong>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="c" style="width: 40px;">#</th>
        <th style="width: 90px;">Code</th>
        <th>Medicine Name</th>
        <th style="width: 70px;">Type</th>
        <th style="width: 60px;">Store</th>
        <th style="width: 70px;">Rack</th>
        <th class="r" style="width: 90px;">Quantity</th>
        <th class="r" style="width: 60px;">Alert</th>
        <th style="width: 80px;">Expiry</th>
        <th class="r" style="width: 70px;">Rate</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot">
    <span>Computer-generated directory — Uttam Laboratories</span>
    <span>Total: ${printableItems.length} record(s)</span>
  </div>
</body>
</html>`;

    printHtml(html);
    setPrintModalOpen(false);
  };

  const openCreate = async () => {
    const codes = await medicineCodesApi.getAvailable();
    setAvailableCodes(codes);
    setForm(emptyForm());
    setCrudPassword('');
    setModal('create');
    setError('');
  };

  const openEdit = (item) => {
    setForm({
      name: item.name,
      type: item.type,
      unit: item.unit,
      stockLocation: item.stockLocation || '',
      rackCode: item.rackCode || '',
      currentStock: String(item.currentStock ?? ''),
      pricePerUnit: String(item.pricePerUnit ?? ''),
      minimumStockAlert: String(item.minimumStockAlert ?? ''),
      expiryDate: toDateInput(item.expiryDate),
    });
    setCrudPassword('');
    setModal(item.id);
    setError('');
  };

  const toPayload = (password) => ({
    name: form.name,
    type: form.type,
    unit: form.unit,
    stockLocation: form.stockLocation || null,
    rackCode: form.rackCode || null,
    currentStock: parseFloat(form.currentStock) || 0,
    pricePerUnit: parseFloat(form.pricePerUnit) || 0,
    minimumStockAlert: parseFloat(form.minimumStockAlert) || 0,
    expiryDate: form.expiryDate || null,
    ...(modal === 'create' ? { medicineCodeId: parseInt(form.medicineCodeId, 10) } : { crudPassword: password }),
  });

  const handleSave = async () => {
    const isCreate = modal === 'create';
    if (!isCreate && !crudPassword) {
      setError('Password is required');
      return;
    }
    if (!form.name) {
      setError('Medicine name is required');
      return;
    }
    if (isCreate && !form.medicineCodeId) {
      setError('Medicine code is required');
      return;
    }
    try {
      const payload = toPayload(crudPassword);
      if (isCreate) await medicinesApi.create(payload);
      else await medicinesApi.update(modal, payload);
      setModal(null);
      setCrudPassword('');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    }
  };

  const openDelete = (id) => {
    setDeleteTarget(id);
    setDeletePassword('');
    setError('');
  };

  const handleConfirmDelete = async () => {
    if (!deletePassword) {
      setError('Password is required');
      return;
    }
    try {
      await medicinesApi.delete(deleteTarget, { crudPassword: deletePassword });
      setDeleteTarget(null);
      setDeletePassword('');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
    }
  };

  const columns = [
    { key: 'medicineCode', label: 'Code', render: r => r.medicineCode || '—' },
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'stockLocation', label: 'Store', render: r => r.stockLocation || '—' },
    { key: 'rackCode', label: 'Rack Number', render: r => r.rackCode || '—' },
    { key: 'unit', label: 'Unit' },
    { key: 'currentStock', label: 'Quantity' },
    { key: 'minimumStockAlert', label: 'Alert', render: r => r.minimumStockAlert ?? 0 },
    { key: 'expiryDate', label: 'Expiry Date', render: r => (r.expiryDate ? new Date(r.expiryDate).toLocaleDateString() : '—') },
    { key: 'pricePerUnit', label: 'Rate', render: r => `₹${r.pricePerUnit}` },
    ...(canWrite ? [{
      key: 'actions',
      label: '',
      render: r => (
        <div className="flex gap-2">
          <button onClick={() => openEdit(r)} className="text-forest-700 hover:text-forest-950" title="Edit medicine">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => openDelete(r.id)} className="text-red-500 hover:text-red-700" title="Delete medicine">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    }] : []),
  ];

  return (
    <Layout>
      <PageHeader
        title="Medicines"
        subtitle="Finished goods inventory"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={openPrintModal}>
              <Printer className="w-4 h-4" /> Print
            </Button>
            {canWrite && <Button onClick={openCreate}><Plus className="w-4 h-4" /> Add Medicine</Button>}
          </div>
        }
      />
      <Card>
        <CardBody>
          <div className="mb-4 max-w-sm">
            <SearchBar value={search} onChange={setSearch} placeholder="Search by name, code, store, or rack..." />
          </div>
          {loading ? <LoadingSpinner /> : <Table columns={columns} data={sortedItems} showNumber />}
        </CardBody>
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Medicine' : 'Edit Medicine'} size="lg">
        {error && <Alert type="error" className="mb-4">{error}</Alert>}
        <div className="space-y-4">
          {modal === 'create' && (
            <Select label="Medicine Code" value={form.medicineCodeId} onChange={e => {
              const code = availableCodes.find(c => c.id === parseInt(e.target.value, 10));
              setForm({ ...form, medicineCodeId: e.target.value, name: code?.name || form.name });
            }}>
              <option value="">Select code</option>
              {availableCodes.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </Select>
          )}
          <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Combobox
              label="Type"
              value={form.type}
              onChange={val => setForm({ ...form, type: val })}
              options={Array.from(new Set([...TYPES, ...items.map(m => m.type).filter(Boolean)])).sort()}
              placeholder="Select or enter type"
            />
            <Input label="Unit" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
            <Input label="Store" value={form.stockLocation} onChange={e => setForm({ ...form, stockLocation: e.target.value })} />
            <Input label="Rack Number" value={form.rackCode} onChange={e => setForm({ ...form, rackCode: e.target.value })} />
            <Input label="Quantity" type="number" min="0" step="any" value={form.currentStock} onChange={e => setForm({ ...form, currentStock: e.target.value })} />
            <Input label="Alert Number" type="number" min="0" step="any" value={form.minimumStockAlert} onChange={e => setForm({ ...form, minimumStockAlert: e.target.value })} />
            <Input label="Expiry Date" type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
            <Input label="Rate (₹)" type="number" min="0" step="any" value={form.pricePerUnit} onChange={e => setForm({ ...form, pricePerUnit: e.target.value })} />
          </div>
          {modal !== 'create' && (
            <Input
              label="Edit/Delete Herb Password"
              type="password"
              value={crudPassword}
              onChange={e => setCrudPassword(e.target.value)}
              placeholder="Enter Edit/Delete Herb Password"
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setError(''); }} title="Delete Medicine">
        {error && <Alert type="error" className="mb-4">{error}</Alert>}
        <p className="text-sm text-muted mb-4">Are you sure you want to delete this medicine?</p>
        <Input
          label="Edit/Delete Herb Password"
          type="password"
          value={deletePassword}
          onChange={e => setDeletePassword(e.target.value)}
          placeholder="Enter Edit/Delete Herb Password"
        />
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirmDelete}>Delete</Button>
        </div>
      </Modal>

      {/* PRINT MODAL WITH RANGE FILTER */}
      <Modal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title="Print Medicines Inventory"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Print Selection</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => setPrintMode('all')}
                className={`px-3 py-2 text-xs font-medium rounded-lg border text-center transition-colors cursor-pointer ${
                  printMode === 'all'
                    ? 'bg-forest-700 text-white border-forest-700'
                    : 'bg-surface/50 text-ink border-line hover:bg-surface'
                }`}
              >
                All Medicines
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('codeRange')}
                className={`px-3 py-2 text-xs font-medium rounded-lg border text-center transition-colors cursor-pointer ${
                  printMode === 'codeRange'
                    ? 'bg-forest-700 text-white border-forest-700'
                    : 'bg-surface/50 text-ink border-line hover:bg-surface'
                }`}
              >
                Code Range
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('rowRange')}
                className={`px-3 py-2 text-xs font-medium rounded-lg border text-center transition-colors cursor-pointer ${
                  printMode === 'rowRange'
                    ? 'bg-forest-700 text-white border-forest-700'
                    : 'bg-surface/50 text-ink border-line hover:bg-surface'
                }`}
              >
                Row Range (#)
              </button>
              {seriesOptions.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPrintMode('series');
                    if (!printSeries && seriesOptions[0]) setPrintSeries(seriesOptions[0]);
                  }}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border text-center transition-colors cursor-pointer ${
                    printMode === 'series'
                      ? 'bg-forest-700 text-white border-forest-700'
                      : 'bg-surface/50 text-ink border-line hover:bg-surface'
                  }`}
                >
                  By Series
                </button>
              )}
            </div>
          </div>

          {printMode === 'codeRange' && (
            <div className="p-3 bg-surface/40 border border-line rounded-lg space-y-3">
              <p className="text-xs text-muted">
                Specify the starting and ending code (e.g. from <strong>{sortedItems[0]?.medicineCode || 'Start'}</strong> to <strong>{sortedItems[sortedItems.length - 1]?.medicineCode || 'End'}</strong>).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="From Code"
                  value={fromCode}
                  onChange={(e) => setFromCode(e.target.value.toUpperCase())}
                  placeholder={sortedItems[0]?.medicineCode || 'Start'}
                />
                <Input
                  label="To Code"
                  value={toCode}
                  onChange={(e) => setToCode(e.target.value.toUpperCase())}
                  placeholder={sortedItems[sortedItems.length - 1]?.medicineCode || 'End'}
                />
              </div>
            </div>
          )}

          {printMode === 'rowRange' && (
            <div className="p-3 bg-surface/40 border border-line rounded-lg space-y-3">
              <p className="text-xs text-muted">
                Specify row numbers to print (Total rows available: <strong>{sortedItems.length}</strong>).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="From Row (#)"
                  type="number"
                  min="1"
                  max={sortedItems.length}
                  value={fromRow}
                  onChange={(e) => setFromRow(e.target.value)}
                  placeholder="1"
                />
                <Input
                  label="To Row (#)"
                  type="number"
                  min="1"
                  max={sortedItems.length}
                  value={toRow}
                  onChange={(e) => setToRow(e.target.value)}
                  placeholder={String(sortedItems.length)}
                />
              </div>
            </div>
          )}

          {printMode === 'series' && seriesOptions.length > 0 && (
            <div className="p-3 bg-surface/40 border border-line rounded-lg space-y-3">
              <p className="text-xs text-muted">Filter and print only medicines belonging to a specific series prefix.</p>
              <Select
                label="Select Series"
                value={printSeries}
                onChange={(e) => setPrintSeries(e.target.value)}
              >
                <option value="">All Series</option>
                {seriesOptions.map((s) => (
                  <option key={s} value={s}>{s} Series</option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between p-3 bg-forest-50/50 border border-forest-200/60 rounded-lg text-xs">
            <div>
              <span className="text-muted">Selected for printing: </span>
              <strong className="text-forest-900 font-semibold">{printableItems.length} record(s)</strong>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPrintModalOpen(false)}>Cancel</Button>
            <Button onClick={handlePrint} disabled={printableItems.length === 0} className="flex items-center gap-1.5">
              <Printer className="w-4 h-4" /> Print Document
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
