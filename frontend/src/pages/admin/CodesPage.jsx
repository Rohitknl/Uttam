import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Modal, Input, Select, Textarea, Table, Badge, SearchBar, PageHeader, LoadingSpinner, Alert } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { parseHerbCode } from '../../utils/codeParser';

function getCodeSeries(code) {
  const raw = String(code || '').trim().toUpperCase();
  const match = raw.match(/^(.*?)(\d+)$/);
  if (!match) return { prefix: raw, num: null, width: 2 };
  return { prefix: match[1], num: parseInt(match[2], 10), width: match[2].length };
}

function listSeriesPrefixes(items) {
  const set = new Set();
  for (const item of items || []) {
    const { prefix } = getCodeSeries(item.code);
    if (prefix) set.add(prefix);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Next code in a series (e.g. TV + existing TV04 → TV05). */
function suggestNextInSeries(items, seriesPrefix) {
  const prefix = String(seriesPrefix || '').trim().toUpperCase();
  if (!prefix) return '';
  const inSeries = (items || [])
    .map((item) => ({ item, ...getCodeSeries(item.code) }))
    .filter((x) => x.prefix === prefix && x.num != null)
    .sort((a, b) => a.num - b.num);
  if (inSeries.length === 0) return `${prefix}01`;
  const last = inSeries[inSeries.length - 1];
  return `${prefix}${String(last.num + 1).padStart(last.width, '0')}`;
}

function suggestNextCode(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const sorted = [...items].sort((a, b) => {
    if (a.id != null && b.id != null) return a.id - b.id;
    return String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
  });
  const last = String(sorted[sorted.length - 1]?.code || '').trim();
  if (!last) return '';
  const { prefix, num, width } = getCodeSeries(last);
  if (num == null) return `${last}1`;
  return `${prefix}${String(num + 1).padStart(width, '0')}`;
}

export default function CodesPage({
  title,
  subtitle,
  api,
  codeLabel = 'Code',
  hideDescription = false,
  hideStatus = false,
  hideActive = false,
  requireCrudPassword = false,
  requirePasswordOnCreate = true,
  showNumber = false,
  capitalizeName = false,
  uppercaseName = false,
  uppercaseCode = false,
  autoIncrementCode = false,
  seriesAwareIncrement = false,
  addButtonLabel,
}) {
  const { canWrite } = useAuth();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ code: '', name: '' });
  const [activeSeries, setActiveSeries] = useState('');
  const [crudPassword, setCrudPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [error, setError] = useState('');

  const emptyForm = (seedCode = '') => ({
    code: seedCode,
    name: '',
    ...(!hideDescription ? { description: '' } : {}),
    ...(!hideActive ? { active: true } : {}),
  });

  const isEditing = typeof modal === 'number';
  const needsPasswordOnSave = requireCrudPassword && (isEditing || requirePasswordOnCreate);
  const useSeries = autoIncrementCode && seriesAwareIncrement;

  const seriesOptions = useMemo(() => listSeriesPrefixes(items), [items]);

  const formatName = (value) => {
    if (value == null || value === '') return value;
    if (uppercaseName) return String(value).toUpperCase();
    if (!capitalizeName) return value;
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  };

  const formatCode = (value) => {
    if (!uppercaseCode || value == null) return value;
    return String(value).toUpperCase();
  };

  const toPayload = (data, password) => {
    const name = (uppercaseName || capitalizeName)
      ? formatName(String(data.name || '').trim())
      : data.name;
    const code = uppercaseCode ? formatCode(String(data.code || '').trim()) : data.code;
    return {
      code,
      name,
      ...(!hideDescription ? { description: data.description || null } : {}),
      ...(!hideActive ? { active: data.active !== false } : {}),
      ...(needsPasswordOnSave ? { crudPassword: password } : {}),
    };
  };

  const load = () => {
    setLoading(true);
    return api.getAll(search || undefined).then(setItems).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  const applySeriesSeed = (list, seriesValue) => {
    if (!useSeries) {
      const nextCode = autoIncrementCode ? formatCode(suggestNextCode(list)) : '';
      setForm(emptyForm(nextCode || ''));
      return;
    }
    const prefix = String(seriesValue || '').trim().toUpperCase();
    if (!prefix) {
      setForm(emptyForm(''));
      return;
    }
    setForm(emptyForm(formatCode(suggestNextInSeries(list, prefix))));
  };

  const openCreate = (list = items) => {
    const prefixes = listSeriesPrefixes(list);
    const defaultSeries = useSeries
      ? (activeSeries && prefixes.includes(activeSeries) ? activeSeries : (prefixes[0] || ''))
      : '';
    if (useSeries) setActiveSeries(defaultSeries);
    applySeriesSeed(list, defaultSeries);
    setCrudPassword('');
    setModal('create');
    setError('');
  };

  const onSeriesChange = (value) => {
    setActiveSeries(value);
    applySeriesSeed(items, value);
  };

  const openEdit = (item) => {
    setForm({
      code: item.code,
      name: item.name,
      ...(!hideDescription ? { description: item.description || '' } : {}),
      ...(!hideActive ? { active: item.active !== false } : {}),
    });
    setCrudPassword('');
    setModal(item.id);
    setError('');
  };

  const handleSave = async () => {
    if (needsPasswordOnSave && !crudPassword) {
      setError('Password is required');
      return;
    }
    try {
      const payload = toPayload(form, crudPassword);
      if (modal === 'create') {
        const created = await api.create(payload);
        setCrudPassword('');
        setError('');
        const refreshed = await api.getAll(search || undefined);
        setItems(refreshed);
        if (autoIncrementCode) {
          if (useSeries) {
            const { prefix } = getCodeSeries(created.code || payload.code);
            if (prefix) {
              setActiveSeries(prefix);
              setForm(emptyForm(formatCode(suggestNextInSeries(refreshed, prefix))));
            } else {
              setForm(emptyForm(formatCode(suggestNextCode(refreshed))));
            }
          } else {
            const nextCode = formatCode(suggestNextCode(refreshed.length ? refreshed : [...items, created]));
            setForm(emptyForm(nextCode || ''));
          }
          setModal('create');
        } else {
          setModal(null);
        }
      } else {
        await api.update(modal, payload);
        setModal(null);
        setCrudPassword('');
        load();
      }
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
    if (requireCrudPassword && !deletePassword) {
      setError('Password is required');
      return;
    }
    try {
      if (requireCrudPassword) {
        await api.delete(deleteTarget, { crudPassword: deletePassword });
      } else {
        await api.delete(deleteTarget);
      }
      setDeleteTarget(null);
      setDeletePassword('');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
    }
  };

  const columns = [
    { key: 'code', label: codeLabel },
    { key: 'name', label: 'Name' },
    ...(!hideDescription ? [{ key: 'description', label: 'Description', render: r => r.description || '—' }] : []),
    ...(!hideStatus ? [{ key: 'assigned', label: 'Status', render: r => r.assigned ? <Badge variant="info">Assigned{r.linkedItemName ? `: ${r.linkedItemName}` : ''}</Badge> : <Badge>Available</Badge> }] : []),
    ...(!hideActive ? [{ key: 'active', label: 'Active', render: r => r.active ? <Badge variant="success">Yes</Badge> : <Badge variant="danger">No</Badge> }] : []),
    ...(canWrite ? [{ key: 'actions', label: '', render: r => (
      <div className="flex gap-2">
        <button onClick={() => openEdit(r)} className="text-forest-700 hover:text-forest-950"><Pencil className="w-4 h-4" /></button>
        <button onClick={() => openDelete(r.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
      </div>
    )}] : []),
  ];

  return (
    <Layout fillHeight>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0">
          <PageHeader
            title={title}
            subtitle={subtitle}
            action={canWrite && (
              <Button onClick={() => openCreate()}>
                <Plus className="w-4 h-4" /> {addButtonLabel || 'Add Code'}
              </Button>
            )}
          />
        </div>
        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <CardBody className="flex-1 min-h-0 flex flex-col overflow-hidden !py-4">
            <div className="mb-4 max-w-sm shrink-0">
              <SearchBar value={search} onChange={setSearch} placeholder={`Search ${title.toLowerCase()}...`} />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain panel-scroll border border-line rounded-lg">
              {loading ? <LoadingSpinner /> : <Table columns={columns} data={items} showNumber={showNumber} />}
            </div>
          </CardBody>
        </Card>
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? `Add ${codeLabel}` : `Edit ${codeLabel}`}
      >
        {error && <Alert type="error" className="mb-4">{error}</Alert>}
        {modal === 'create' && useSeries && seriesOptions.length > 0 && (
          <p className="text-xs text-muted mb-3">
            Select a series to auto-fill the next code, or type a new code to start a series.
          </p>
        )}
        {modal === 'create' && autoIncrementCode && !useSeries && form.code && (
          <p className="text-xs text-muted mb-3">Next code filled automatically from the last code. You can still edit it.</p>
        )}
        <div className="space-y-4">
          {modal === 'create' && useSeries && seriesOptions.length > 0 && (
            <Select
              label="Series"
              value={activeSeries}
              onChange={(e) => onSeriesChange(e.target.value)}
            >
              <option value="">Type code manually</option>
              {seriesOptions.map((p) => (
                <option key={p} value={p}>{p} series</option>
              ))}
            </Select>
          )}
          <Input
            label={codeLabel}
            value={form.code}
            onChange={e => {
              const code = uppercaseCode ? formatCode(e.target.value) : e.target.value;
              const parsed = parseHerbCode(code);
              let nextName = form.name;
              let nextAuto = form._autoName;

              if (parsed.name && (!form.name || form.name === form._autoName)) {
                const formatted = (uppercaseName || capitalizeName) ? formatName(parsed.name) : parsed.name;
                nextName = formatted;
                nextAuto = formatted;
              }

              setForm({
                ...form,
                code,
                name: nextName,
                _autoName: nextAuto,
              });

              if (useSeries && modal === 'create') {
                const { prefix } = getCodeSeries(code);
                if (prefix && seriesOptions.includes(prefix)) {
                  setActiveSeries(prefix);
                }
              }
            }}
          />
          <Input
            label="Name"
            value={form.name}
            onChange={e => setForm({
              ...form,
              name: (uppercaseName || capitalizeName) ? formatName(e.target.value) : e.target.value,
            })}
          />
          {!hideDescription && (
            <Textarea label="Description" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
          )}
          {!hideActive && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active
            </label>
          )}
          {needsPasswordOnSave && (
            <Input
              label="Edit/Delete Herb Password"
              type="password"
              value={crudPassword}
              onChange={e => setCrudPassword(e.target.value)}
              placeholder="Enter Edit/Delete Herb Password"
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>
              {modal === 'create' && autoIncrementCode ? 'Done' : 'Cancel'}
            </Button>
            <Button onClick={handleSave}>
              {modal === 'create' && useSeries
                ? (addButtonLabel || 'Save')
                : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setError(''); }} title={`Delete ${codeLabel}`}>
        {error && <Alert type="error" className="mb-4">{error}</Alert>}
        <p className="text-sm text-muted mb-4">Are you sure you want to delete this code?</p>
        {requireCrudPassword && (
          <Input
            label="Edit/Delete Herb Password"
            type="password"
            value={deletePassword}
            onChange={e => setDeletePassword(e.target.value)}
            placeholder="Enter Edit/Delete Herb Password"
          />
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirmDelete}>Delete</Button>
        </div>
      </Modal>
    </Layout>
  );
}
