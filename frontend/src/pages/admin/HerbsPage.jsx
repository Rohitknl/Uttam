import { useEffect, useMemo, useState, useRef } from 'react';
import { Plus, Pencil, Trash2, Printer } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Modal, Input, Select, DropdownSelect, Table, SearchBar, PageHeader, LoadingSpinner, Alert } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { herbsApi, herbCodesApi } from '../../api';
import { parseHerbName } from '../../utils/codeParser';
import { printHtml } from '../../utils/print';

const UNITS = ['KG', 'GRAMS', 'LITERS', 'ML', 'PIECES'];
const KANASTER_BORA_OPTIONS = ['Kanaster', 'Bora', 'Drum'];

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
  herbCodeId: '',
  unitOfMeasure: 'KG',
  currentStock: '',
  costPerUnit: '',
  alertCount: '',
  storeNumber: '',
  kanasterBora: '',
  kanasterBoraNumber: '',
});

function parseNumber(value, fallback = 0) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export default function HerbsPage() {
  const { canWrite } = useAuth();
  const [items, setItems] = useState([]);
  const [herbCodes, setHerbCodes] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
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
  const stockRef = useRef(null);
  const alertRef = useRef(null);
  const rateRef = useRef(null);

  const load = () => {
    setLoading(true);
    herbsApi.getAll({ search: search || undefined }).then(setItems).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const codeA = a.herbCode || '';
      const codeB = b.herbCode || '';
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
      const { prefix } = getCodeSeries(item.herbCode);
      if (prefix) set.add(prefix);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [sortedItems]);

  const printableItems = useMemo(() => {
    let result = sortedItems;

    if (printMode === 'series') {
      if (printSeries) {
        result = result.filter(item => {
          const { prefix } = getCodeSeries(item.herbCode);
          return prefix === printSeries;
        });
      }
    } else if (printMode === 'codeRange') {
      result = result.filter(item => isCodeInRange(item.herbCode, fromCode, toCode));
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

    let rangeLabel = 'All Herbs';
    if (printMode === 'codeRange') {
      rangeLabel = `Code Range: ${fromCode || (sortedItems[0]?.herbCode ?? 'Start')} to ${toCode || (sortedItems[sortedItems.length - 1]?.herbCode ?? 'End')}`;
    } else if (printMode === 'rowRange') {
      rangeLabel = `Row Range: #${fromRow || '1'} to #${toRow || sortedItems.length}`;
    } else if (printMode === 'series' && printSeries) {
      rangeLabel = `Series: ${printSeries} (${printableItems.length} records)`;
    }

    const rows = printableItems.map((item, idx) => `
      <tr>
        <td class="c">${idx + 1}</td>
        <td class="code">${esc(item.herbCode || '—')}</td>
        <td class="bold">${esc(item.name || '—')}</td>
        <td>${esc(item.storeNumber || '—')}</td>
        <td>${esc(item.kanasterBora || '—')} ${item.kanasterBoraNumber ? `#${esc(item.kanasterBoraNumber)}` : ''}</td>
        <td class="r">${item.currentStock ?? 0} ${esc(item.unitOfMeasure || '')}</td>
        <td class="r">${item.minimumStockAlert ?? 0}</td>
        <td class="r">₹${item.costPerUnit ?? 0}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Herbs Directory - Uttam Laboratories</title>
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
  <h1>HERBS INVENTORY DIRECTORY</h1>
  <div class="meta">
    <div>Filter:<strong>${esc(rangeLabel)}</strong></div>
    <div>Total Records:<strong>${printableItems.length}</strong></div>
    <div>Printed Date:<strong>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="c" style="width: 40px;">#</th>
        <th style="width: 100px;">Code</th>
        <th>Herb Name</th>
        <th style="width: 70px;">Store</th>
        <th style="width: 110px;">Storage Type</th>
        <th class="r" style="width: 100px;">Total Stock</th>
        <th class="r" style="width: 70px;">Alert</th>
        <th class="r" style="width: 80px;">Rate</th>
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

  const loadHerbCodes = async (currentHerbCodeId) => {
    const codes = await herbCodesApi.getAll();
    const unassigned = codes.filter(c => !c.assigned || c.id === currentHerbCodeId);
    setHerbCodes(unassigned);
  };

  const openCreate = async () => {
    await loadHerbCodes();
    setForm(emptyForm());
    setCrudPassword('');
    setModal('create');
    setError('');
  };

  const openEdit = async (item) => {
    await loadHerbCodes(item.herbCodeId);
    setForm({
      name: item.name,
      herbCodeId: item.herbCodeId ? String(item.herbCodeId) : '',
      unitOfMeasure: item.unitOfMeasure || 'KG',
      currentStock: item.currentStock == null ? '' : String(item.currentStock),
      costPerUnit: item.costPerUnit == null ? '' : String(item.costPerUnit),
      alertCount: item.minimumStockAlert == null ? '' : String(item.minimumStockAlert),
      storeNumber: item.storeNumber || '',
      kanasterBora: item.kanasterBora || '',
      kanasterBoraNumber: item.kanasterBoraNumber || '',
    });
    setCrudPassword('');
    setModal(item.id);
    setError('');
  };

  const updateForm = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const handleSave = async () => {
    const isCreate = modal === 'create';
    const stockValue = String(form.currentStock ?? '').trim();
    const alertValue = String(form.alertCount ?? '').trim();
    const rateValue = String(form.costPerUnit ?? '').trim();

    const missing = [];
    if (!String(form.herbCodeId || '').trim()) missing.push('Herb Code');
    if (!String(form.name || '').trim()) missing.push('Herb Name');
    if (!String(form.unitOfMeasure || '').trim()) missing.push('Unit');
    if (!stockValue) missing.push('Total Stock');
    if (!alertValue) missing.push('Minimum Stock/Alert');
    if (!rateValue) missing.push('Latest Rate');
    if (!String(form.storeNumber || '').trim()) missing.push('Store Number');
    if (!String(form.kanasterBora || '').trim()) missing.push('Kanaster/Bora/Drum');
    if (!String(form.kanasterBoraNumber || '').trim()) missing.push('Kanaster/Bora/Drum Number');
    if (!isCreate && !crudPassword) missing.push('Edit/Delete Herb Password');

    if (missing.length) {
      setError(`Please fill all fields: ${missing.join(', ')}`);
      return;
    }

    const type = String(form.kanasterBora).trim();
    const number = String(form.kanasterBoraNumber).trim();
    const conflict = items.find(
      h =>
        h.id !== modal &&
        String(h.kanasterBora || '') === type &&
        String(h.kanasterBoraNumber || '') === number,
    );
    if (conflict) {
      setError(`${type} number "${number}" is already assigned to "${conflict.name}"`);
      return;
    }

    const payload = {
      name: form.name.trim().toUpperCase(),
      herbCodeId: parseInt(form.herbCodeId, 10),
      unitOfMeasure: form.unitOfMeasure,
      currentStock: parseNumber(stockValue),
      costPerUnit: parseNumber(rateValue),
      minimumStockAlert: parseNumber(alertValue),
      storeNumber: form.storeNumber.trim(),
      kanasterBora: type,
      kanasterBoraNumber: number,
      ...(!isCreate ? { crudPassword } : {}),
    };

    try {
      if (isCreate) await herbsApi.create(payload);
      else await herbsApi.update(modal, payload);
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
      await herbsApi.delete(deleteTarget, { crudPassword: deletePassword });
      setDeleteTarget(null);
      setDeletePassword('');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
    }
  };

  const columns = [
    { key: 'herbCode', label: 'Code', render: r => r.herbCode || '—' },
    { key: 'name', label: 'Herb Name' },
    { key: 'storeNumber', label: 'Store', render: r => r.storeNumber || '—' },
    { key: 'kanasterBora', label: 'Type', render: r => r.kanasterBora || '—' },
    { key: 'kanasterBoraNumber', label: 'Type No.', render: r => r.kanasterBoraNumber || '—' },
    { key: 'unitOfMeasure', label: 'Unit' },
    { key: 'currentStock', label: 'Total Stock' },
    { key: 'minimumStockAlert', label: 'Alert', render: r => r.minimumStockAlert ?? 0 },
    { key: 'costPerUnit', label: 'Rate', render: r => `₹${r.costPerUnit}` },
    ...(canWrite ? [{
      key: 'actions',
      label: '',
      className: 'w-16',
      render: r => (
        <div className="flex gap-2">
          <button onClick={() => openEdit(r)} className="text-forest-700 hover:text-forest-950" title="Edit herb">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => openDelete(r.id)} className="text-red-500 hover:text-red-700" title="Delete herb">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    }] : []),
  ];

  return (
    <Layout fillHeight>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0">
          <PageHeader
            title="Herbs"
            subtitle="Combined raw material inventory — stock totals from all bills"
            action={
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={openPrintModal}>
                  <Printer className="w-4 h-4" /> Print
                </Button>
                {canWrite && <Button onClick={openCreate}><Plus className="w-4 h-4" /> Add Herb</Button>}
              </div>
            }
          />
        </div>
        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <CardBody className="flex-1 min-h-0 flex flex-col overflow-hidden !py-4">
            <div className="mb-3 max-w-sm shrink-0">
              <SearchBar value={search} onChange={setSearch} placeholder="Search by herb name or code..." />
            </div>
            <div className="flex-1 min-h-0 overflow-auto overscroll-contain panel-scroll border border-line rounded-lg">
              {loading ? <LoadingSpinner /> : <Table columns={columns} data={sortedItems} showNumber />}
            </div>
          </CardBody>
        </Card>
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add Herb' : 'Edit Herb'}
        size="full"
        scrollable
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        )}
      >
        {error && <Alert type="error" className="mb-2">{error}</Alert>}
        <div className="grid grid-cols-3 gap-x-3 gap-y-2">
          <div className="col-span-2">
            <DropdownSelect
              label="Herb Code"
              value={form.herbCodeId}
              placeholder="Select code"
              options={[
                { value: '', label: 'Select code' },
                ...herbCodes.map(c => ({ value: String(c.id), label: `${c.code} — ${c.name}` })),
              ]}
              onChange={val => {
                const codeObj = herbCodes.find(c => c.id === parseInt(val, 10));
                const parsedName = parseHerbName(codeObj?.name);

                setForm(prev => ({
                  ...prev,
                  herbCodeId: val,
                  name: String(codeObj?.name || prev.name || '').toUpperCase(),
                  ...(parsedName.number ? { kanasterBoraNumber: parsedName.number } : {}),
                }));
              }}
            />
          </div>
          <Input
            label="Herb Name"
            value={form.name}
            onChange={e => updateForm({ name: e.target.value.toUpperCase() })}
          />
          <DropdownSelect
            label="Unit"
            value={form.unitOfMeasure}
            options={UNITS.map(u => ({ value: u, label: u }))}
            onChange={val => updateForm({ unitOfMeasure: val })}
          />
          <Input
            label="Total Stock"
            type="text"
            inputMode="decimal"
            value={form.currentStock}
            onChange={e => {
              const v = e.target.value;
              if (v === '' || /^\d*\.?\d*$/.test(v)) updateForm({ currentStock: v });
            }}
          />
          <Input
            label="Minimum Stock/Alert"
            type="text"
            inputMode="decimal"
            value={form.alertCount}
            onChange={e => {
              const v = e.target.value;
              if (v === '' || /^\d*\.?\d*$/.test(v)) updateForm({ alertCount: v });
            }}
            placeholder="e.g. 10"
          />
          <Input
            label="Latest Rate (₹)"
            type="text"
            inputMode="decimal"
            value={form.costPerUnit}
            onChange={e => {
              const v = e.target.value;
              if (v === '' || /^\d*\.?\d*$/.test(v)) updateForm({ costPerUnit: v });
            }}
          />
          <Input label="Store Number" value={form.storeNumber} onChange={e => updateForm({ storeNumber: e.target.value })} />
          <DropdownSelect
            label="Kanaster / Bora / Drum"
            value={form.kanasterBora}
            placeholder="Select"
            options={[
              { value: '', label: 'Select' },
              ...KANASTER_BORA_OPTIONS.map(o => ({ value: o, label: o })),
            ]}
            onChange={val => updateForm({ kanasterBora: val })}
          />
          <Input label="Number" value={form.kanasterBoraNumber} onChange={e => updateForm({ kanasterBoraNumber: e.target.value })} />
          {modal !== 'create' && (
            <div className="col-span-3">
              <Input
                label="Edit/Delete Herb Password"
                type="password"
                value={crudPassword}
                onChange={e => setCrudPassword(e.target.value)}
                placeholder="Enter Edit/Delete Herb Password"
              />
            </div>
          )}
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setError(''); }} title="Delete Herb">
        {error && <Alert type="error" className="mb-4">{error}</Alert>}
        <p className="text-sm text-muted mb-4">Are you sure you want to delete this herb from inventory?</p>
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
        title="Print Herbs Inventory"
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
                All Herbs
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
                Specify the starting and ending code (e.g. from <strong>{sortedItems[0]?.herbCode || 'Start'}</strong> to <strong>{sortedItems[sortedItems.length - 1]?.herbCode || 'End'}</strong>).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="From Code"
                  value={fromCode}
                  onChange={(e) => setFromCode(e.target.value.toUpperCase())}
                  placeholder={sortedItems[0]?.herbCode || 'Start'}
                />
                <Input
                  label="To Code"
                  value={toCode}
                  onChange={(e) => setToCode(e.target.value.toUpperCase())}
                  placeholder={sortedItems[sortedItems.length - 1]?.herbCode || 'End'}
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
              <p className="text-xs text-muted">Filter and print only herbs belonging to a specific series prefix.</p>
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
