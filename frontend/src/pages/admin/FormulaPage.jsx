import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Select, Input, DropdownSelect, Table, Badge, PageHeader, LoadingSpinner, Alert } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { medicineCodesApi, herbsApi, herbCodesApi, formulasApi } from '../../api';

const UNITS = ['KG', 'GRAMS', 'LITERS', 'ML', 'PIECES'];

const UNIT_FAMILY = {
  KG: 'mass',
  GRAMS: 'mass',
  LITERS: 'volume',
  ML: 'volume',
  PIECES: 'count',
};

function toBase(quantity, unit) {
  switch (unit) {
    case 'KG': return quantity * 1000;
    case 'GRAMS': return quantity;
    case 'LITERS': return quantity * 1000;
    case 'ML': return quantity;
    case 'PIECES': return quantity;
    default: return quantity;
  }
}

function fromBase(baseQty, unit) {
  switch (unit) {
    case 'KG': return baseQty / 1000;
    case 'GRAMS': return baseQty;
    case 'LITERS': return baseQty / 1000;
    case 'ML': return baseQty;
    case 'PIECES': return baseQty;
    default: return baseQty;
  }
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function toBatchSize(quantity, fromUnit, toUnit) {
  const qty = parseFloat(quantity) || 0;
  if (UNIT_FAMILY[fromUnit] === UNIT_FAMILY[toUnit]) {
    return round4(fromBase(toBase(qty, fromUnit), toUnit));
  }
  return qty;
}

function QtyUnitField({
  label = 'Medicine Qty / Unit',
  quantity,
  unit,
  onQuantityChange,
  onUnitChange,
  disabled = false,
  className = '',
}) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-ink mb-1">{label}</label>}
      <div className="flex items-stretch rounded-lg border border-line bg-white overflow-hidden focus-within:ring-2 focus-within:ring-forest-700/30 focus-within:border-forest-700">
        <input
          type="number"
          min="0"
          step="any"
          value={quantity}
          onChange={onQuantityChange}
          disabled={disabled}
          className="flex-1 min-w-0 px-3 py-2 border-0 bg-transparent text-ink focus:outline-none disabled:opacity-60"
          placeholder="Qty"
        />
        <select
          value={unit}
          onChange={onUnitChange}
          disabled={disabled}
          className="w-28 shrink-0 px-2 py-2 border-0 border-l border-line bg-surface/40 text-ink focus:outline-none disabled:opacity-60"
        >
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    </div>
  );
}

function unitsForHerb(herbOrUnit) {
  const base = typeof herbOrUnit === 'string'
    ? herbOrUnit
    : (herbOrUnit?.unitOfMeasure || 'KG');
  const family = UNIT_FAMILY[base] || UNIT_FAMILY.KG;
  return UNITS.filter(u => UNIT_FAMILY[u] === family);
}

function normalizeHerbUnit(herb, unit) {
  const allowed = unitsForHerb(herb);
  if (unit && allowed.includes(unit)) return unit;
  return herb?.unitOfMeasure || allowed[0] || 'KG';
}

function formatQtyLabel(quantity, unit) {
  const q = round4(parseFloat(quantity) || 0);
  return `${q} ${unit}`;
}

/** Sum herb lines into the medicine unit (same family only). */
function sumHerbQuantityInUnit(recipeItems, herbsList, medicineUnit) {
  const medFamily = UNIT_FAMILY[medicineUnit] || UNIT_FAMILY.KG;
  let totalBase = 0;
  const used = [];

  for (const r of recipeItems) {
    if (!r.herbId || r.quantity === '' || r.quantity == null) continue;
    const qty = parseFloat(r.quantity);
    if (!(qty > 0)) continue;
    const herb = herbsList.find(h => h.id === parseInt(r.herbId, 10));
    if (!herb) {
      return { error: 'One or more selected herbs were not found', items: [] };
    }
    const unit = normalizeHerbUnit(herb, r.unit);
    if ((UNIT_FAMILY[unit] || UNIT_FAMILY.KG) !== medFamily) {
      return {
        error: `Herb "${herb.name}" uses ${unit}, which cannot be matched to medicine unit ${medicineUnit}. Use the same unit type (weight/volume/count).`,
        items: [],
      };
    }
    totalBase += toBase(qty, unit);
    used.push({ herbId: parseInt(r.herbId, 10), quantity: qty, unit, herb });
  }

  return {
    items: used,
    totalInMedicineUnit: round4(fromBase(totalBase, medicineUnit)),
    totalBase: round4(totalBase),
  };
}

export default function FormulaPage() {
  const { canWrite, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'generate' ? 'generate' : 'define';

  const [medicineOptions, setMedicineOptions] = useState([]);
  const [herbs, setHerbs] = useState([]);
  const [herbOptions, setHerbOptions] = useState([]);
  const [selectedMedicineCodeId, setSelectedMedicineCodeId] = useState('');
  const [formulaQuantity, setFormulaQuantity] = useState('1');
  const [formulaUnit, setFormulaUnit] = useState('PIECES');
  const [recipe, setRecipe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [generated, setGenerated] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generateQuantity, setGenerateQuantity] = useState('');
  const [generateUnit, setGenerateUnit] = useState('PIECES');
  const [baseFormulaQuantity, setBaseFormulaQuantity] = useState(1);
  const [baseFormulaUnit, setBaseFormulaUnit] = useState('PIECES');

  const setActiveTab = (tab) => {
    if (tab === 'define') setSearchParams({});
    else setSearchParams({ tab: 'generate' });
  };

  const buildOptions = (codes) => codes
    .filter(c => c.active !== false)
    .map(c => ({
      medicineCodeId: c.id,
      code: c.code,
      name: c.name,
      formulaUnit: c.formulaUnit || 'PIECES',
    }))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));

  const buildHerbOptions = (codes, herbList) => {
    const fromCodes = (codes || []).map(c => {
      const herb = (herbList || []).find(h => h.herbCodeId === c.id);
      return {
        herbCodeId: c.id,
        herbId: herb?.id || null,
        code: c.code,
        name: c.name || herb?.name || '',
        unit: herb?.unitOfMeasure || 'KG',
        stock: herb?.currentStock ?? 0,
      };
    });
    const extra = (herbList || [])
      .filter(h => !h.herbCodeId)
      .map(h => ({
        herbCodeId: `herb-${h.id}`,
        herbId: h.id,
        code: h.herbCode || '—',
        name: h.name,
        unit: h.unitOfMeasure || 'KG',
        stock: h.currentStock ?? 0,
      }));
    return [...fromCodes, ...extra].sort((a, b) => String(a.code).localeCompare(String(b.code)));
  };

  const loadLists = async () => {
    const [codes, h, herbCodes] = await Promise.all([
      medicineCodesApi.getAll(),
      herbsApi.getAll(),
      herbCodesApi.getAll(),
    ]);
    const herbList = Array.isArray(h) ? h : [];
    const codeList = Array.isArray(herbCodes) ? herbCodes : [];
    setHerbs(herbList);
    setHerbOptions(buildHerbOptions(codeList, herbList));
    setMedicineOptions(buildOptions(Array.isArray(codes) ? codes : []));
  };

  useEffect(() => {
    loadLists().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedMedicineCodeId && activeTab === 'define') {
      medicineCodesApi.getRecipe(selectedMedicineCodeId)
        .then(data => {
          setFormulaQuantity(String(data.formulaQuantity ?? 1));
          setFormulaUnit(data.formulaUnit || 'PIECES');
          setRecipe((data.items || []).map(r => {
            const herb = herbs.find(h => h.id === r.herbId);
            const opt = herbOptions.find(o => o.herbId === r.herbId)
              || herbOptions.find(o => o.herbCodeId === herb?.herbCodeId);
            return {
              herbId: String(r.herbId),
              herbCodeId: opt ? String(opt.herbCodeId) : (herb?.herbCodeId ? String(herb.herbCodeId) : ''),
              quantity: String(r.quantity ?? ''),
              unit: normalizeHerbUnit(herb || { unitOfMeasure: r.unit }, r.unit),
            };
          }));
        })
        .catch(() => {
          const opt = medicineOptions.find(m => String(m.medicineCodeId) === String(selectedMedicineCodeId));
          setFormulaQuantity('1');
          setFormulaUnit(opt?.formulaUnit || 'PIECES');
          setRecipe([]);
        });
    } else if (selectedMedicineCodeId && activeTab === 'generate') {
      medicineCodesApi.getRecipe(selectedMedicineCodeId)
        .then(data => {
          const unit = data.formulaUnit || 'PIECES';
          setBaseFormulaQuantity(data.formulaQuantity ?? 1);
          setBaseFormulaUnit(unit);
          setGenerateUnit(unit);
          if (!generateQuantity) setGenerateQuantity(String(data.formulaQuantity ?? 1));
        })
        .catch(() => {
          const opt = medicineOptions.find(m => String(m.medicineCodeId) === String(selectedMedicineCodeId));
          const unit = opt?.formulaUnit || 'PIECES';
          setBaseFormulaQuantity(1);
          setBaseFormulaUnit(unit);
          setGenerateUnit(unit);
        });
    } else if (!selectedMedicineCodeId) {
      setFormulaQuantity('1');
      setFormulaUnit('PIECES');
      setRecipe([]);
      setGenerateQuantity('');
      setGenerateUnit('PIECES');
      setBaseFormulaQuantity(1);
      setBaseFormulaUnit('PIECES');
    }
  }, [selectedMedicineCodeId, medicineOptions, activeTab]);

  const selectMedicineCode = (medicineCodeId) => {
    setMessage('');
    setGenerated(null);
    setSelectedMedicineCodeId(medicineCodeId ? String(medicineCodeId) : '');
  };

  const addItem = () => setRecipe([...recipe, { herbId: '', herbCodeId: '', quantity: '', unit: '' }]);

  const resolveHerbFromOption = async (opt) => {
    if (!opt) return null;
    if (opt.herbId) {
      return herbs.find(h => h.id === opt.herbId) || {
        id: opt.herbId,
        name: opt.name,
        unitOfMeasure: opt.unit,
        currentStock: opt.stock,
        herbCodeId: typeof opt.herbCodeId === 'number' ? opt.herbCodeId : null,
      };
    }
    if (!canWrite || typeof opt.herbCodeId !== 'number') return null;
    const created = await herbsApi.ensureFromCode(opt.herbCodeId);
    setHerbs(prev => (prev.some(h => h.id === created.id) ? prev : [...prev, created]));
    setHerbOptions(prev => prev.map(o => (
      String(o.herbCodeId) === String(opt.herbCodeId)
        ? { ...o, herbId: created.id, unit: created.unitOfMeasure, stock: created.currentStock, name: created.name }
        : o
    )));
    return created;
  };

  const selectHerbForRow = async (idx, herbCodeId) => {
    const updated = [...recipe];
    if (!herbCodeId) {
      updated[idx] = { ...updated[idx], herbCodeId: '', herbId: '', unit: '' };
      setRecipe(updated);
      return;
    }
    const alreadyUsed = recipe.some((r, i) => i !== idx && String(r.herbCodeId) === String(herbCodeId));
    if (alreadyUsed) {
      setMessage('This herb is already in the formula. Each herb can be added only once.');
      return;
    }
    const opt = herbOptions.find(o => String(o.herbCodeId) === String(herbCodeId));
    try {
      const herb = await resolveHerbFromOption(opt);
      if (herb?.id) {
        const herbAlreadyUsed = recipe.some((r, i) => i !== idx && String(r.herbId) === String(herb.id));
        if (herbAlreadyUsed) {
          setMessage(`Herb "${herb.name}" is already in the formula. Each herb can be added only once.`);
          return;
        }
      }
      updated[idx] = {
        ...updated[idx],
        herbCodeId: String(herbCodeId),
        herbId: herb ? String(herb.id) : '',
        unit: normalizeHerbUnit(herb || { unitOfMeasure: opt?.unit }, opt?.unit),
      };
      setRecipe(updated);
      setMessage('');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to open herb for this code');
    }
  };

  const updateItem = (idx, field, value) => {
    const updated = [...recipe];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === 'unit') {
      const herb = herbs.find(h => h.id === parseInt(updated[idx].herbId, 10));
      updated[idx].unit = normalizeHerbUnit(herb, value);
    }
    setRecipe(updated);
  };

  const removeItem = (idx) => setRecipe(recipe.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setMessage('');
    if (!selectedMedicineCodeId) {
      setMessage('Select a medicine code before saving');
      return;
    }

    const medQty = parseFloat(formulaQuantity);
    if (!(medQty > 0)) {
      setMessage('Medicine quantity must be greater than 0');
      return;
    }

    const summed = sumHerbQuantityInUnit(recipe, herbs, formulaUnit);
    if (summed.error) {
      setMessage(summed.error);
      return;
    }
    if (!summed.items.length) {
      setMessage('Add at least one herb with quantity before saving the formula');
      return;
    }

    const herbTotal = summed.totalInMedicineUnit;
    const medLabel = formatQtyLabel(medQty, formulaUnit);
    const herbLabel = formatQtyLabel(herbTotal, formulaUnit);

    if (herbTotal + 1e-9 < medQty) {
      setMessage(
        `Herb total (${herbLabel}) is less than medicine quantity (${medLabel}). Add herbs equal to ${medLabel}.`,
      );
      return;
    }
    if (herbTotal > medQty + 1e-9) {
      setMessage(
        `Herb total (${herbLabel}) is more than medicine quantity (${medLabel}). Herb total must equal ${medLabel}.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `You are adding medicine for ${medLabel}.\n`
      + `Herbs added: ${herbLabel}.\n\n`
      + 'Save this formula?',
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const items = [];
      const seen = new Set();
      for (const r of recipe) {
        if (!r.herbId || r.quantity === '') continue;
        const herbId = parseInt(r.herbId, 10);
        if (seen.has(herbId)) {
          const herb = herbs.find(h => h.id === herbId);
          setMessage(`Herb "${herb?.name || herbId}" is added more than once. Each herb can appear only once.`);
          setSaving(false);
          return;
        }
        seen.add(herbId);
        const herb = herbs.find(h => h.id === herbId);
        if (!herb) {
          setMessage('One or more selected herbs were not found');
          setSaving(false);
          return;
        }
        const unit = normalizeHerbUnit(herb, r.unit);
        if (UNIT_FAMILY[unit] !== UNIT_FAMILY[herb.unitOfMeasure || 'KG']) {
          setMessage(`Unit for ${herb.name} must be ${unitsForHerb(herb).join(' or ')} (same as Herbs page)`);
          setSaving(false);
          return;
        }
        const qty = parseFloat(r.quantity) || 0;
        if (!(qty > 0)) continue;
        items.push({
          herbId,
          quantity: qty,
          unit,
        });
      }
      await medicineCodesApi.updateRecipe(selectedMedicineCodeId, {
        formulaQuantity: medQty,
        formulaUnit,
        items,
      });
      setMessage('Formula saved successfully');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setMessage('');
    setGenerated(null);
    try {
      const payload = {
        medicineCodeId: parseInt(selectedMedicineCodeId, 10),
        batchSize: toBatchSize(generateQuantity, generateUnit, baseFormulaUnit),
      };
      const result = await formulasApi.generate(payload);
      setGenerated(result);
      if (!result.sufficient) {
        setMessage(result.message || 'Insufficient herb stock to generate this formula');
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Generate failed');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrintGenerated = () => {
    if (!generated?.items?.length) return;
    const selected = medicineOptions.find(o => String(o.medicineCodeId) === String(selectedMedicineCodeId));
    const code = generated.medicineCode || selected?.code || '—';
    const name = generated.medicineName || selected?.name || '—';
    const esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const rows = generated.items.map((r, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(r.herbName)}</td>
        <td class="r">${esc(r.quantityPerUnit)} ${esc(r.unitOfMeasure || '')}</td>
        <td class="r">${esc(r.scaledQuantity)} ${esc(r.unitOfMeasure || '')}</td>
        <td class="r">${esc(r.availableInRecipeUnit ?? r.availableStock)} ${esc(r.unitOfMeasure || '')}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Generated Formula — ${esc(code)}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #1c241e; padding: 24px; font-size: 12px; }
    .brand { font-size: 20px; font-weight: 700; color: #2d5a3d; }
    .sub { color: #5c6b60; margin-bottom: 16px; }
    h1 { font-size: 16px; margin: 0 0 12px; letter-spacing: 0.04em; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
    .meta div span { color: #5c6b60; display: inline-block; min-width: 110px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #d5e0d8; padding: 8px; }
    th { background: #e8f2eb; color: #2d5a3d; text-align: left; }
    .c { text-align: center; } .r { text-align: right; }
    .foot { margin-top: 24px; color: #5c6b60; font-size: 11px; border-top: 1px dashed #c5d0c8; padding-top: 8px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="brand">Uttam Laboratories</div>
  <div class="sub">Ayurvedic Stock &amp; Inventory</div>
  <h1>GENERATED FORMULA</h1>
  <div class="meta">
    <div><span>Medicine Code</span><strong>${esc(code)}</strong></div>
    <div><span>Medicine</span><strong>${esc(name)}</strong></div>
    <div><span>Base Formula</span><strong>${esc(generated.formulaQuantity)} ${esc(generated.formulaUnit)}</strong></div>
    <div><span>Generate Qty</span><strong>${esc(generateQuantity)} ${esc(generateUnit)}${generateUnit !== generated.formulaUnit ? ` (${esc(generated.batchSize)} ${esc(generated.formulaUnit)})` : ''}</strong></div>
    <div><span>Date</span><strong>${new Date().toLocaleDateString('en-IN')}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="c">#</th>
        <th>Herb</th>
        <th class="r">Qty / Base</th>
        <th class="r">Required</th>
        <th class="r">Available</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot">Computer-generated formula sheet — Uttam Laboratories</div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  };

  const handleConsume = async () => {
    if (generated && generated.sufficient === false) {
      setMessage(generated.message || 'Cannot consume — insufficient herb stock');
      return;
    }
    if (!confirm('This will deduct herb stock. Continue?')) return;
    setGenerating(true);
    setMessage('');
    try {
      const payload = {
        medicineCodeId: parseInt(selectedMedicineCodeId, 10),
        batchSize: toBatchSize(generateQuantity, generateUnit, baseFormulaUnit),
      };
      const result = await formulasApi.consume(payload);
      setMessage(`Consumed herbs: ${result.map(r => `${r.herbName}: ${r.consumed} ${r.unitOfMeasure || ''}`).join(', ')}`);
      if (generated) {
        const refreshed = await formulasApi.generate(payload);
        setGenerated(refreshed);
        if (!refreshed.sufficient) {
          setMessage(prev => `${prev}. Warning: stock now insufficient for another batch.`);
        }
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Consume failed');
    } finally {
      setGenerating(false);
    }
  };

  const generateColumns = [
    { key: 'herbName', label: 'Herb' },
    { key: 'quantityPerUnit', label: 'Qty / Base', render: r => `${r.quantityPerUnit} ${r.unitOfMeasure || ''}` },
    { key: 'scaledQuantity', label: 'Required', render: r => `${r.scaledQuantity} ${r.unitOfMeasure || ''}` },
    {
      key: 'availableStock',
      label: 'Available',
      render: r => {
        const available = r.availableInRecipeUnit ?? r.availableStock;
        const unit = r.unitOfMeasure || '';
        const stockNote = r.stockUnit && r.stockUnit !== r.unitOfMeasure
          ? ` (${r.availableStock} ${r.stockUnit})`
          : '';
        return (
          <Badge variant={r.sufficient === false ? 'danger' : 'success'}>
            {available} {unit}{stockNote}
          </Badge>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: r => (r.sufficient === false
        ? <span className="text-red-600 font-medium">Shortage {r.shortage ?? ''} {r.unitOfMeasure || ''}</span>
        : <span className="text-forest-700">OK</span>),
    },
  ];

  if (loading) return <Layout><LoadingSpinner /></Layout>;

  return (
    <Layout>
      <PageHeader title="Formula" subtitle="Define base formula and generate by medicine quantity" />

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('define')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'define' ? 'bg-forest-700 text-white' : 'bg-surface text-muted hover:text-ink'
          }`}
        >
          Add Formula
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('generate')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'generate' ? 'bg-forest-700 text-white' : 'bg-surface text-muted hover:text-ink'
          }`}
        >
          Generate Formula
        </button>
      </div>

      {activeTab === 'define' ? (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <DropdownSelect
                label="Medicine"
                searchable
                searchPlaceholder="Type medicine code or name..."
                placeholder="Choose from medicine codes"
                value={selectedMedicineCodeId}
                onChange={val => selectMedicineCode(val)}
                className="min-w-[220px] flex-1"
                options={[
                  { value: '', label: 'Choose from medicine codes' },
                  ...medicineOptions.map(m => ({
                    value: String(m.medicineCodeId),
                    label: `${m.code} — ${m.name}`,
                  })),
                ]}
              />
              <QtyUnitField
                className="w-64"
                quantity={formulaQuantity}
                unit={formulaUnit}
                onQuantityChange={e => setFormulaQuantity(e.target.value)}
                onUnitChange={e => setFormulaUnit(e.target.value)}
                disabled={!canWrite}
              />
            </div>

            {medicineOptions.length === 0 && (
              <Alert type="info">No medicine codes found. Add codes under Medicine Codes first.</Alert>
            )}
            {herbOptions.length === 0 && (
              <Alert type="info">No herb codes found. Add codes under Herb Codes first.</Alert>
            )}
            {message && !selectedMedicineCodeId && <Alert type="error">{message}</Alert>}

            {selectedMedicineCodeId && (
              <>
                {message && <Alert type={message.includes('success') ? 'success' : 'error'}>{message}</Alert>}

                <div className="space-y-2">
                  {recipe.map((item, idx) => {
                    const herb = herbs.find(h => h.id === parseInt(item.herbId, 10));
                    const opt = herbOptions.find(o => String(o.herbCodeId) === String(item.herbCodeId));
                    const unitSource = herb || (opt ? { unitOfMeasure: opt.unit } : null);
                    const unitOptions = unitSource ? unitsForHerb(unitSource) : [];
                    return (
                      <div key={idx} className="flex gap-2 items-end">
                        <DropdownSelect
                          label={idx === 0 ? 'Herb' : ''}
                          searchable
                          searchPlaceholder="Type herb code or name..."
                          placeholder="Select herb code"
                          className="flex-1"
                          value={item.herbCodeId ? String(item.herbCodeId) : ''}
                          onChange={val => selectHerbForRow(idx, val)}
                          options={[
                            { value: '', label: 'Select herb code' },
                            ...herbOptions.map(h => ({
                              value: String(h.herbCodeId),
                              label: `${h.code} — ${h.name} (${h.unit}) — stock: ${h.stock}`,
                            })),
                          ]}
                        />
                        <Input
                          label={idx === 0 ? 'Herb Qty' : ''}
                          type="number"
                          min="0"
                          step="0.0001"
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          className="w-32"
                        />
                        <Select
                          label={idx === 0 ? 'Herb Unit' : ''}
                          value={item.unit}
                          onChange={e => updateItem(idx, 'unit', e.target.value)}
                          className="w-36"
                          disabled={!unitSource}
                        >
                          {!unitSource && <option value="">Select herb first</option>}
                          {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                        </Select>
                        {canWrite && <Button variant="danger" size="sm" onClick={() => removeItem(idx)}>Remove</Button>}
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const medQty = parseFloat(formulaQuantity) || 0;
                  const summed = sumHerbQuantityInUnit(recipe, herbs, formulaUnit);
                  if (summed.error) {
                    return <Alert type="error">{summed.error}</Alert>;
                  }
                  const herbTotal = summed.totalInMedicineUnit || 0;
                  const matched = medQty > 0 && Math.abs(herbTotal - medQty) <= 1e-9;
                  const tooLow = medQty > 0 && herbTotal + 1e-9 < medQty;
                  return (
                    <div className={`text-sm rounded-lg border px-3 py-2 ${
                      matched ? 'border-forest-700/40 bg-forest-700/5 text-ink'
                        : tooLow ? 'border-red-300 bg-red-50 text-red-800'
                          : 'border-line bg-surface/40 text-muted'
                    }`}
                    >
                      Medicine: <strong>{formatQtyLabel(medQty, formulaUnit)}</strong>
                      {' · '}
                      Herbs total: <strong>{formatQtyLabel(herbTotal, formulaUnit)}</strong>
                      {matched && ' — totals match'}
                      {tooLow && ' — herbs are less than medicine quantity'}
                      {!matched && !tooLow && medQty > 0 && herbTotal > 0 && ' — herbs exceed medicine quantity'}
                    </div>
                  );
                })()}
                {canWrite && (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={addItem}>Add Herb</Button>
                    <Button onClick={handleSave} disabled={saving || !selectedMedicineCodeId}>{saving ? 'Saving...' : 'Save Formula'}</Button>
                  </div>
                )}
              </>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <DropdownSelect
                label="Medicine"
                searchable
                searchPlaceholder="Type medicine code or name..."
                placeholder="Choose from medicine codes"
                value={selectedMedicineCodeId}
                onChange={val => {
                  setGenerateQuantity('');
                  selectMedicineCode(val);
                }}
                className="min-w-[220px] flex-1"
                options={[
                  { value: '', label: 'Choose from medicine codes' },
                  ...medicineOptions.map(m => ({
                    value: String(m.medicineCodeId),
                    label: `${m.code} — ${m.name}`,
                  })),
                ]}
              />
              <QtyUnitField
                className="w-64"
                quantity={generateQuantity}
                unit={generateUnit}
                onQuantityChange={e => setGenerateQuantity(e.target.value)}
                onUnitChange={e => setGenerateUnit(e.target.value)}
              />
              <Button onClick={handleGenerate} disabled={!selectedMedicineCodeId || !generateQuantity || generating}>
                {generating ? 'Generating...' : 'Generate'}
              </Button>
            </div>

            {medicineOptions.length === 0 && (
              <Alert type="info">No medicine codes found. Add codes under Medicine Codes first.</Alert>
            )}
            {message && !selectedMedicineCodeId && <Alert type="error">{message}</Alert>}

            {selectedMedicineCodeId && (
              <p className="text-sm text-muted">
                Base formula: {baseFormulaQuantity} {baseFormulaUnit}. Herb requirements scale to the medicine qty you enter.
              </p>
            )}

            {message && (
              <Alert type={message.includes('Consumed') || message.includes('success') ? 'success' : 'error'}>
                {message}
              </Alert>
            )}

            {generated?.items?.length > 0 && (
              <>
                <p className="text-sm text-muted">
                  Scaled from {generated.formulaQuantity} {generated.formulaUnit} to {generateQuantity} {generateUnit}
                  {generateUnit !== generated.formulaUnit ? ` (${generated.batchSize} ${generated.formulaUnit})` : ''}.
                </p>
                <Table columns={generateColumns} data={generated.items} />
                <div className="flex gap-2 flex-wrap">
                  <Button variant="secondary" onClick={handlePrintGenerated}>
                    <Printer className="w-4 h-4" /> Print
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="saffron"
                      onClick={handleConsume}
                      disabled={generating || generated.sufficient === false}
                    >
                      Consume Herbs
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardBody>
        </Card>
      )}
    </Layout>
  );
}
