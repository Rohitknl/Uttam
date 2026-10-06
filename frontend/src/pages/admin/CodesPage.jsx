import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Printer } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Modal, Input, Select, Textarea, Table, Badge, SearchBar, PageHeader, LoadingSpinner, Alert } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { parseHerbCode } from '../../utils/codeParser';
import { printHtml } from '../../utils/print';

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

  // Prefix-aware numeric match (e.g. TV01 to TV20)
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

  // Pure numeric codes
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

  // Natural string comparison fallback
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
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printMode, setPrintMode] = useState('all'); // 'all', 'codeRange', 'rowRange', 'series'
  const [fromCode, setFromCode] = useState('');
  const [toCode, setToCode] = useState('');
  const [fromRow, setFromRow] = useState('');
  const [toRow, setToRow] = useState('');
  const [printSeries, setPrintSeries] = useState('');

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

  const allSortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      return String(a.code).localeCompare(String(b.code), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [items]);

  const printableItems = useMemo(() => {
    let result = allSortedItems;

    if (printMode === 'series') {
      if (printSeries) {
        result = result.filter(item => {
          const { prefix } = getCodeSeries(item.code);
          return prefix === printSeries;
        });
      }
    } else if (printMode === 'codeRange') {
      result = result.filter(item => isCodeInRange(item.code, fromCode, toCode));
    } else if (printMode === 'rowRange') {
      const start = parseInt(fromRow, 10);
      const end = parseInt(toRow, 10);
      const min = Number.isFinite(start) && start > 0 ? start - 1 : 0;
      const max = Number.isFinite(end) && end > 0 ? end : result.length;
      result = result.slice(min, max);
    }

    return result;
  }, [allSortedItems, printMode, printSeries, fromCode, toCode, fromRow, toRow]);

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

    let rangeLabel = 'All Codes';
    if (printMode === 'codeRange') {
      rangeLabel = `Code Range: ${fromCode || (allSortedItems[0]?.code ?? 'Start')} to ${toCode || (allSortedItems[allSortedItems.length - 1]?.code ?? 'End')}`;
    } else if (printMode === 'rowRange') {
      rangeLabel = `Row Range: #${fromRow || '1'} to #${toRow || allSortedItems.length}`;
    } else if (printMode === 'series') {
      rangeLabel = `Series: ${printSeries ? `${printSeries} Series` : 'All'}`;
    } else if (search) {
      rangeLabel = `Search Filter: "${search}"`;
    }

    const rows = printableItems.map((item, idx) => `
      <tr>
        <td class="c">${idx + 1}</td>
        <td style="font-weight: 600;">${esc(item.code)}</td>
        <td>${esc(item.name)}</td>
        ${!hideDescription ? `<td>${esc(item.description || '—')}</td>` : ''}
        ${!hideStatus ? `<td>${item.assigned ? `Assigned${item.linkedItemName ? `: ${esc(item.linkedItemName)}` : ''}` : 'Available'}</td>` : ''}
        ${!hideActive ? `<td class="c">${item.active !== false ? 'Yes' : 'No'}</td>` : ''}
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} — Uttam Laboratories</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #1c241e; padding: 24px; font-size: 12px; }
    .brand { font-size: 20px; font-weight: 700; color: #2d5a3d; }
    .sub { color: #5c6b60; margin-bottom: 12px; }
    h1 { font-size: 16px; margin: 0 0 8px; letter-spacing: 0.04em; color: #1c241e; }
    .meta { display: flex; flex-wrap: wrap; gap: 16px 32px; margin-bottom: 16px; font-size: 12px; color: #5c6b60; border-bottom: 1px solid #d5e0d8; padding-bottom: 10px; }
    .meta strong { color: #1c241e; margin-left: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #d5e0d8; padding: 7px 10px; text-align: left; }
    th { background: #e8f2eb; color: #2d5a3d; font-weight: 600; }
    tr:nth-child(even) { background: #fbfdfc; }
    .c { text-align: center; }
    .r { text-align: right; }
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
  <h1>${esc(title).toUpperCase()} DIRECTORY</h1>
  <div class="meta">
    <div>Filter:<strong>${esc(rangeLabel)}</strong></div>
    <div>Total Records:<strong>${printableItems.length}</strong></div>
    <div>Printed Date:<strong>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="c" style="width: 45px;">#</th>
        <th style="width: 130px;">${esc(codeLabel)}</th>
        <th>Name</th>
        ${!hideDescription ? '<th>Description</th>' : ''}
        ${!hideStatus ? '<th style="width: 140px;">Status</th>' : ''}
        ${!hideActive ? '<th class="c" style="width: 60px;">Active</th>' : ''}
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
            action={
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={openPrintModal}>
                  <Printer className="w-4 h-4" /> Print
                </Button>
                {canWrite && (
                  <Button onClick={() => openCreate()}>
                    <Plus className="w-4 h-4" /> {addButtonLabel || 'Add Code'}
                  </Button>
                )}
              </div>
            }
          />
        </div>
        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <CardBody className="flex-1 min-h-0 flex flex-col overflow-hidden !py-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="max-w-sm flex-1 min-w-[200px]">
                <SearchBar value={search} onChange={setSearch} placeholder={`Search ${title.toLowerCase()}...`} />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain panel-scroll border border-line rounded-lg">
              {loading ? <LoadingSpinner /> : <Table columns={columns} data={allSortedItems} showNumber={showNumber} />}
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

      {/* PRINT MODAL WITH RANGE FILTER */}
      <Modal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title={`Print ${title}`}
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
                All Codes
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
                Specify the starting and ending code (e.g. from <strong>{allSortedItems[0]?.code || 'A01'}</strong> to <strong>{allSortedItems[allSortedItems.length - 1]?.code || 'A50'}</strong>).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="From Code"
                  value={fromCode}
                  onChange={(e) => setFromCode(uppercaseCode ? e.target.value.toUpperCase() : e.target.value)}
                  placeholder={allSortedItems[0]?.code || 'Start'}
                />
                <Input
                  label="To Code"
                  value={toCode}
                  onChange={(e) => setToCode(uppercaseCode ? e.target.value.toUpperCase() : e.target.value)}
                  placeholder={allSortedItems[allSortedItems.length - 1]?.code || 'End'}
                />
              </div>
            </div>
          )}

          {printMode === 'rowRange' && (
            <div className="p-3 bg-surface/40 border border-line rounded-lg space-y-3">
              <p className="text-xs text-muted">
                Specify row numbers to print (Total rows available: <strong>{allSortedItems.length}</strong>).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="From Row (#)"
                  type="number"
                  min="1"
                  max={allSortedItems.length}
                  value={fromRow}
                  onChange={(e) => setFromRow(e.target.value)}
                  placeholder="1"
                />
                <Input
                  label="To Row (#)"
                  type="number"
                  min="1"
                  max={allSortedItems.length}
                  value={toRow}
                  onChange={(e) => setToRow(e.target.value)}
                  placeholder={String(allSortedItems.length)}
                />
              </div>
            </div>
          )}

          {printMode === 'series' && seriesOptions.length > 0 && (
            <div className="p-3 bg-surface/40 border border-line rounded-lg space-y-3">
              <p className="text-xs text-muted">Filter and print only codes belonging to a specific series prefix.</p>
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
            {printableItems.length > 0 && (
              <span className="text-forest-700 font-mono">
                {printableItems[0]?.code} {printableItems.length > 1 ? `... ${printableItems[printableItems.length - 1]?.code}` : ''}
              </span>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPrintModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePrint} disabled={printableItems.length === 0}>
              <Printer className="w-4 h-4" /> Print Sheet
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
