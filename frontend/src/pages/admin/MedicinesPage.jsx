import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Modal, Input, Select, Table, SearchBar, PageHeader, LoadingSpinner, Alert } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { medicinesApi, medicineCodesApi } from '../../api';

const TYPES = ['VATI', 'CHURNA', 'ARISHTA', 'SYRUP', 'TAILA', 'GHRITA', 'BHASMA', 'LEHYA', 'KWATH', 'TABLET', 'CAPSULE', 'OTHER'];

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

  const load = () => {
    setLoading(true);
    medicinesApi.getAll({ search: search || undefined }).then(setItems).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

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
        action={canWrite && <Button onClick={openCreate}><Plus className="w-4 h-4" /> Add Medicine</Button>}
      />
      <Card>
        <CardBody>
          <div className="mb-4 max-w-sm">
            <SearchBar value={search} onChange={setSearch} placeholder="Search by name, code, store, or rack..." />
          </div>
          {loading ? <LoadingSpinner /> : <Table columns={columns} data={items} showNumber />}
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
            <Select label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
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
    </Layout>
  );
}
