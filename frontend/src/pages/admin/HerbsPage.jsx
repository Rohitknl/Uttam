import { useEffect, useState, useRef } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Modal, Input, DropdownSelect, Table, SearchBar, PageHeader, LoadingSpinner, Alert } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { herbsApi, herbCodesApi } from '../../api';

const UNITS = ['KG', 'GRAMS', 'LITERS', 'ML', 'PIECES'];
const KANASTER_BORA_OPTIONS = ['Kanaster', 'Bora', 'Drum'];

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
  const stockRef = useRef(null);
  const alertRef = useRef(null);
  const rateRef = useRef(null);

  const load = () => {
    setLoading(true);
    herbsApi.getAll({ search: search || undefined }).then(setItems).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

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
    const stockValue = String(stockRef.current?.value ?? form.currentStock).trim();
    const alertValue = String(alertRef.current?.value ?? form.alertCount).trim();
    const rateValue = String(rateRef.current?.value ?? form.costPerUnit).trim();

    const missing = [];
    if (!String(form.herbCodeId || '').trim()) missing.push('Herb Code');
    if (!String(form.name || '').trim()) missing.push('Herb Name');
    if (!String(form.unitOfMeasure || '').trim()) missing.push('Unit');
    if (!stockValue) missing.push('Total Stock');
    if (!alertValue) missing.push('Alert Count');
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
            action={canWrite && <Button onClick={openCreate}><Plus className="w-4 h-4" /> Add Herb</Button>}
          />
        </div>
        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <CardBody className="flex-1 min-h-0 flex flex-col overflow-hidden !py-4">
            <div className="mb-3 max-w-sm shrink-0">
              <SearchBar value={search} onChange={setSearch} placeholder="Search by herb name or code..." />
            </div>
            <div className="flex-1 min-h-0 overflow-auto overscroll-contain panel-scroll border border-line rounded-lg">
              {loading ? <LoadingSpinner /> : <Table columns={columns} data={items} showNumber />}
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
                const code = herbCodes.find(c => c.id === parseInt(val, 10));
                setForm(prev => ({
                  ...prev,
                  herbCodeId: val,
                  name: String(code?.name || prev.name || '').toUpperCase(),
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
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Total Stock</label>
            <input
              ref={stockRef}
              type="text"
              inputMode="decimal"
              value={form.currentStock}
              onChange={e => {
                const v = e.target.value;
                if (v === '' || /^\d*\.?\d*$/.test(v)) updateForm({ currentStock: v });
              }}
              className="w-full px-3 py-2 rounded-lg border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Alert Count</label>
            <input
              ref={alertRef}
              type="text"
              inputMode="decimal"
              value={form.alertCount}
              onChange={e => {
                const v = e.target.value;
                if (v === '' || /^\d*\.?\d*$/.test(v)) updateForm({ alertCount: v });
              }}
              className="w-full px-3 py-2 rounded-lg border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700"
              placeholder="e.g. 10"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Latest Rate (₹)</label>
            <input
              ref={rateRef}
              type="text"
              inputMode="decimal"
              value={form.costPerUnit}
              onChange={e => {
                const v = e.target.value;
                if (v === '' || /^\d*\.?\d*$/.test(v)) updateForm({ costPerUnit: v });
              }}
              className="w-full px-3 py-2 rounded-lg border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700"
            />
          </div>
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
    </Layout>
  );
}
