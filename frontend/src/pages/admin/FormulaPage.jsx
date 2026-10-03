import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, Eye, Edit3, Trash2, Plus, Search, AlertTriangle } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Select, Input, Textarea, DropdownSelect, Table, Badge, PageHeader, LoadingSpinner, Alert } from '../../components/ui';
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

function isDecimalInput(value) {
  return value === '' || /^\d*\.?\d*$/.test(value);
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
          type="text"
          inputMode="decimal"
          value={quantity}
          onChange={e => {
            const v = e.target.value;
            if (isDecimalInput(v)) onQuantityChange(e);
          }}
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
  const tabParam = searchParams.get('tab');
  const activeTab = ['view', 'edit', 'delete', 'print'].includes(tabParam)
    ? tabParam
    : (tabParam === 'define' ? 'edit' : (tabParam === 'generate' ? 'print' : 'view'));

  const [medicineOptions, setMedicineOptions] = useState([]);
  const [herbs, setHerbs] = useState([]);
  const [herbOptions, setHerbOptions] = useState([]);
  const [selectedMedicineCodeId, setSelectedMedicineCodeId] = useState('');
  const [formulaQuantity, setFormulaQuantity] = useState('1');
  const [formulaUnit, setFormulaUnit] = useState('PIECES');
  const [description, setDescription] = useState('');
  const [recipe, setRecipe] = useState([]);
  const [hasRecipe, setHasRecipe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [generated, setGenerated] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generateQuantity, setGenerateQuantity] = useState('');
  const [generateUnit, setGenerateUnit] = useState('PIECES');
  const [baseFormulaQuantity, setBaseFormulaQuantity] = useState(1);
  const [baseFormulaUnit, setBaseFormulaUnit] = useState('PIECES');
  const [batchNumber, setBatchNumber] = useState('');
  const [firmName, setFirmName] = useState('');
  const [overviewSearch, setOverviewSearch] = useState('');

  const setActiveTab = (tab) => {
    setMessage('');
    setSearchParams(tab === 'view' ? {} : { tab });
  };

  const buildOptions = (codes) => codes
    .filter(c => c.active !== false)
    .map(c => ({
      medicineCodeId: c.id,
      code: c.code,
      name: c.name,
      description: c.description || '',
      formulaQuantity: c.formulaQuantity ?? 1,
      formulaUnit: c.formulaUnit || 'PIECES',
      hasRecipe: !!c.hasRecipe,
      recipeItemsCount: c.recipeItemsCount || 0,
      assigned: c.assigned,
      linkedItemName: c.linkedItemName,
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
    if (!selectedMedicineCodeId) {
      setFormulaQuantity('1');
      setFormulaUnit('PIECES');
      setDescription('');
      setRecipe([]);
      setHasRecipe(false);
      setGenerateQuantity('');
      setGenerateUnit('PIECES');
      setBaseFormulaQuantity(1);
      setBaseFormulaUnit('PIECES');
      setGenerated(null);
      return;
    }

    medicineCodesApi.getRecipe(selectedMedicineCodeId)
      .then(data => {
        const items = data.items || [];
        setHasRecipe(items.length > 0);
        setFormulaQuantity(String(data.formulaQuantity ?? 1));
        const unit = data.formulaUnit || 'PIECES';
        setFormulaUnit(unit);
        setDescription(data.description || '');
        setBaseFormulaQuantity(data.formulaQuantity ?? 1);
        setBaseFormulaUnit(unit);
        setGenerateUnit(unit);
        setGenerateQuantity(String(data.formulaQuantity ?? 1));
        setRecipe(items.map(r => {
          const herb = herbs.find(h => h.id === r.herbId);
          const opt = herbOptions.find(o => o.herbId === r.herbId)
            || herbOptions.find(o => o.herbCodeId === herb?.herbCodeId);
          return {
            herbId: String(r.herbId),
            herbCodeId: opt ? String(opt.herbCodeId) : (herb?.herbCodeId ? String(herb.herbCodeId) : ''),
            herbName: r.herbName || herb?.name || opt?.name || '',
            quantity: String(r.quantity ?? ''),
            unit: normalizeHerbUnit(herb || { unitOfMeasure: r.unit }, r.unit),
          };
        }));
      })
      .catch(() => {
        const opt = medicineOptions.find(m => String(m.medicineCodeId) === String(selectedMedicineCodeId));
        setHasRecipe(false);
        setFormulaQuantity('1');
        const unit = opt?.formulaUnit || 'PIECES';
        setFormulaUnit(unit);
        setDescription(opt?.description || '');
        setBaseFormulaQuantity(1);
        setBaseFormulaUnit(unit);
        setGenerateUnit(unit);
        setGenerateQuantity('1');
        setRecipe([]);
      });
  }, [selectedMedicineCodeId, herbs, herbOptions, medicineOptions]);

  useEffect(() => {
    if (activeTab === 'print' && selectedMedicineCodeId && hasRecipe && !generating) {
      const qty = generateQuantity || String(baseFormulaQuantity || 1);
      const batchSize = toBatchSize(qty, generateUnit, baseFormulaUnit);
      if (batchSize > 0) {
        formulasApi.generate({
          medicineCodeId: parseInt(selectedMedicineCodeId, 10),
          batchSize,
        })
          .then(res => setGenerated(res))
          .catch(() => setGenerated(null));
      }
    }
  }, [activeTab, selectedMedicineCodeId, hasRecipe, generateQuantity, generateUnit, baseFormulaQuantity, baseFormulaUnit]);

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
        description: description ? description.trim() : '',
        items,
      });
      setHasRecipe(true);
      setMedicineOptions(prev => prev.map(m => (
        String(m.medicineCodeId) === String(selectedMedicineCodeId)
          ? {
              ...m,
              description: description ? description.trim() : '',
              formulaQuantity: medQty,
              formulaUnit,
              hasRecipe: true,
              recipeItemsCount: items.length,
            }
          : m
      )));
      setMessage('Formula saved successfully');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFormula = async () => {
    if (!selectedMedicineCodeId) return;
    const selected = medicineOptions.find(m => String(m.medicineCodeId) === String(selectedMedicineCodeId));
    const medName = selected ? `${selected.code} — ${selected.name}` : 'this medicine';

    if (!window.confirm(`Are you sure you want to delete the formula for ${medName}?\n\nThis will remove all ingredients from the formula. The medicine code itself will not be deleted.`)) {
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await medicineCodesApi.deleteRecipe(selectedMedicineCodeId);
      setRecipe([]);
      setHasRecipe(false);
      setGenerated(null);
      setMedicineOptions(prev => prev.map(m => (
        String(m.medicineCodeId) === String(selectedMedicineCodeId)
          ? { ...m, hasRecipe: false, recipeItemsCount: 0 }
          : m
      )));
      setMessage(`Formula for ${medName} has been deleted successfully.`);
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to delete formula');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setMessage('');
    setGenerated(null);
    setIsModified(false);
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
    const displayFirm = (firmName || '').trim() || 'Uttam Laboratories';
    const displayBatch = (batchNumber || '').trim();
    const displayDescription = (description || generated?.description || '').trim();
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
  <div class="brand">${esc(displayFirm)}</div>
  <div class="sub">Ayurvedic Stock &amp; Inventory</div>
  <h1>GENERATED FORMULA</h1>
  <div class="meta">
    <div><span>Firm Name</span><strong>${esc(displayFirm)}</strong></div>
    <div><span>Batch Number</span><strong>${esc(displayBatch || '—')}</strong></div>
    <div><span>Medicine Code</span><strong>${esc(code)}</strong></div>
    <div><span>Medicine</span><strong>${esc(name)}</strong></div>
    ${displayDescription ? `<div style="grid-column: span 2;"><span>Description</span><strong>${esc(displayDescription)}</strong></div>` : ''}
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
  <div class="foot">Computer-generated formula sheet — ${esc(displayFirm)}</div>
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
    if (!generated?.items?.length) return;

    const hasShortage = generated.sufficient === false || generated.items.some(it => it.sufficient === false);
    const confirmMsg = hasShortage
      ? 'Some herbs have insufficient stock and consuming will turn their stock negative. Continue?'
      : 'This will deduct herb stock. Continue?';

    if (!confirm(confirmMsg)) return;

    setGenerating(true);
    setMessage('');
    try {
      const batchSize = toBatchSize(generateQuantity, generateUnit, baseFormulaUnit);
      const medicineCodeId = parseInt(selectedMedicineCodeId, 10);
      const payload = { medicineCodeId, batchSize };
      const result = await formulasApi.consume(payload);
      const summary = result.map(r => {
        const rem = r.remainingStock < 0 ? ` (Remaining: ${r.remainingStock} ${r.stockUnit})` : '';
        return `${r.herbName}: -${r.consumed} ${r.unitOfMeasure || ''}${rem}`;
      }).join(', ');
      setMessage(`Consumed herbs: ${summary}`);
      if (generated) {
        const refreshed = await formulasApi.generate({ medicineCodeId, batchSize });
        setGenerated(refreshed);
      }
      herbsApi.getAll().then(data => setHerbs(data)).catch(() => {});
    } catch (err) {
      setMessage(err.response?.data?.message || 'Consume failed');
    } finally {
      setGenerating(false);
    }
  };

  const selectedMedicine = medicineOptions.find(m => String(m.medicineCodeId) === String(selectedMedicineCodeId));

  const filteredMedicines = medicineOptions.filter(m => {
    if (!overviewSearch.trim()) return true;
    const q = overviewSearch.toLowerCase().trim();
    return m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
  });

  const viewColumns = [
    {
      key: 'index',
      label: '#',
      render: (_, __, idx) => <span className="text-muted font-mono">{idx + 1}</span>,
    },
    {
      key: 'herbName',
      label: 'Herb',
      render: r => {
        const opt = herbOptions.find(o => String(o.herbCodeId) === String(r.herbCodeId));
        const herb = herbs.find(h => h.id === parseInt(r.herbId, 10));
        const code = opt?.code || herb?.herbCode;
        const name = r.herbName || herb?.name || opt?.name || 'Herb';
        return (
          <div>
            <div className="font-medium text-ink">{name}</div>
            {code && <div className="text-xs text-muted">Code: {code}</div>}
          </div>
        );
      },
    },
    {
      key: 'quantity',
      label: 'Qty in Base Formula',
      render: r => (
        <span className="font-semibold text-forest-800">
          {r.quantity} {r.unit}
        </span>
      ),
    },
    {
      key: 'stock',
      label: 'Current Available Stock',
      render: r => {
        const herb = herbs.find(h => h.id === parseInt(r.herbId, 10));
        const opt = herbOptions.find(o => String(o.herbCodeId) === String(r.herbCodeId));
        const stock = herb?.currentStock ?? opt?.stock ?? 0;
        const stockUnit = herb?.unitOfMeasure ?? opt?.unit ?? r.unit;
        return (
          <Badge variant={stock > 0 ? 'success' : 'danger'}>
            {stock} {stockUnit}
          </Badge>
        );
      },
    },
  ];

  const overviewColumns = [
    {
      key: 'code',
      label: 'Code',
      render: m => <span className="font-mono font-medium text-ink">{m.code}</span>,
    },
    {
      key: 'name',
      label: 'Medicine Name',
      render: m => (
        <div>
          <span className="font-medium text-ink">{m.name}</span>
          {m.description && <div className="text-xs text-muted line-clamp-1">{m.description}</div>}
        </div>
      ),
    },
    {
      key: 'baseFormula',
      label: 'Base Formula',
      render: m => `${m.formulaQuantity ?? 1} ${m.formulaUnit || 'PIECES'}`,
    },
    {
      key: 'status',
      label: 'Status',
      render: m => (m.hasRecipe ? (
        <Badge variant="success">Defined ({m.recipeItemsCount} herbs)</Badge>
      ) : (
        <Badge variant="neutral">Not Configured</Badge>
      )),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: m => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => selectMedicineCode(m.medicineCodeId)}
          >
            <Eye className="w-3.5 h-3.5" /> View
          </Button>
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                selectMedicineCode(m.medicineCodeId);
                setActiveTab('edit');
              }}
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
          {m.hasRecipe && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                selectMedicineCode(m.medicineCodeId);
                setActiveTab('print');
              }}
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
          )}
        </div>
      ),
    },
  ];

  const deleteOverviewColumns = [
    {
      key: 'code',
      label: 'Code',
      render: m => <span className="font-mono font-medium text-ink">{m.code}</span>,
    },
    {
      key: 'name',
      label: 'Medicine Name',
      render: m => <span className="font-medium text-ink">{m.name}</span>,
    },
    {
      key: 'baseFormula',
      label: 'Base Formula',
      render: m => `${m.formulaQuantity ?? 1} ${m.formulaUnit || 'PIECES'}`,
    },
    {
      key: 'herbs',
      label: 'Ingredients',
      render: m => <Badge variant="neutral">{m.recipeItemsCount} herbs</Badge>,
    },
    {
      key: 'actions',
      label: 'Action',
      render: m => (
        <Button
          size="sm"
          variant="danger"
          onClick={() => selectMedicineCode(m.medicineCodeId)}
        >
          <Trash2 className="w-3.5 h-3.5" /> Select to Delete
        </Button>
      ),
    },
  ];

  const printOverviewColumns = [
    {
      key: 'code',
      label: 'Code',
      render: m => <span className="font-mono font-medium text-ink">{m.code}</span>,
    },
    {
      key: 'name',
      label: 'Medicine Name',
      render: m => <span className="font-medium text-ink">{m.name}</span>,
    },
    {
      key: 'baseFormula',
      label: 'Base Formula',
      render: m => `${m.formulaQuantity ?? 1} ${m.formulaUnit || 'PIECES'}`,
    },
    {
      key: 'herbs',
      label: 'Ingredients',
      render: m => <Badge variant="neutral">{m.recipeItemsCount} herbs</Badge>,
    },
    {
      key: 'actions',
      label: 'Action',
      render: m => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => selectMedicineCode(m.medicineCodeId)}
        >
          <Printer className="w-3.5 h-3.5" /> Select &amp; Print
        </Button>
      ),
    },
  ];

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
      <PageHeader
        title="Formula"
        subtitle="Manage medicine formulas: view recipes, add/edit ingredients, delete formulas, and print batch sheets"
      />

      {/* Subcategory Navigation Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-line pb-4">
        <button
          type="button"
          onClick={() => setActiveTab('view')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'view' ? 'bg-forest-700 text-white shadow-sm' : 'bg-surface text-muted hover:text-ink hover:bg-forest-50'
          }`}
        >
          <Eye className="w-4 h-4" /> View Formula
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('edit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'edit' ? 'bg-forest-700 text-white shadow-sm' : 'bg-surface text-muted hover:text-ink hover:bg-forest-50'
          }`}
        >
          <Edit3 className="w-4 h-4" /> Add / Edit Formula
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('delete')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'delete' ? 'bg-forest-700 text-white shadow-sm' : 'bg-surface text-muted hover:text-ink hover:bg-forest-50'
          }`}
        >
          <Trash2 className="w-4 h-4" /> Delete Formula
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('print')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'print' ? 'bg-forest-700 text-white shadow-sm' : 'bg-surface text-muted hover:text-ink hover:bg-forest-50'
          }`}
        >
          <Printer className="w-4 h-4" /> Print Formula
        </button>
      </div>

      {/* 1. VIEW FORMULA TAB */}
      {activeTab === 'view' && (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <DropdownSelect
                label="Select Medicine to View"
                searchable
                searchPlaceholder="Type medicine code or name..."
                placeholder="Choose from medicine codes"
                value={selectedMedicineCodeId}
                onChange={val => selectMedicineCode(val)}
                className="min-w-[260px] flex-1"
                options={[
                  { value: '', label: 'All Medicines (Overview)' },
                  ...medicineOptions.map(m => ({
                    value: String(m.medicineCodeId),
                    label: `${m.code} — ${m.name}${m.hasRecipe ? ' (Formula Defined)' : ''}`,
                  })),
                ]}
              />
              {selectedMedicineCodeId && (
                <Button
                  variant="secondary"
                  onClick={() => selectMedicineCode('')}
                >
                  View All Medicines
                </Button>
              )}
            </div>

            {message && <Alert type={message.includes('success') ? 'success' : 'error'}>{message}</Alert>}

            {selectedMedicineCodeId ? (
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-surface/50 border border-line">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-ink">{selectedMedicine?.code} — {selectedMedicine?.name}</h2>
                      {hasRecipe ? (
                        <Badge variant="success">Formula Configured</Badge>
                      ) : (
                        <Badge variant="neutral">No Formula</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted mt-1">
                      Base formula: <strong className="text-ink">{formulaQuantity} {formulaUnit}</strong>
                      {hasRecipe && ` · ${recipe.length} herb${recipe.length === 1 ? '' : 's'} defined`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canWrite && (
                      <Button
                        size="sm"
                        onClick={() => setActiveTab('edit')}
                        className="flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> {hasRecipe ? 'Edit Formula' : 'Add Formula'}
                      </Button>
                    )}
                    {hasRecipe && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveTab('print')}
                        className="flex items-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" /> Print Formula
                      </Button>
                    )}
                    {hasRecipe && isAdmin && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setActiveTab('delete')}
                        className="flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </Button>
                    )}
                  </div>
                </div>

                {description && (
                  <div className="p-3.5 rounded-lg bg-white border border-line shadow-2xs">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted block mb-1">
                      Formula Description &amp; Notes
                    </span>
                    <p className="text-sm text-ink whitespace-pre-wrap">{description}</p>
                  </div>
                )}

                {hasRecipe && recipe.length > 0 ? (
                  <div className="space-y-3">
                    <Table columns={viewColumns} data={recipe} />

                    {(() => {
                      const medQty = parseFloat(formulaQuantity) || 0;
                      const summed = sumHerbQuantityInUnit(recipe, herbs, formulaUnit);
                      const herbTotal = summed.totalInMedicineUnit || 0;
                      const matched = medQty > 0 && Math.abs(herbTotal - medQty) <= 1e-9;
                      const tooLow = medQty > 0 && herbTotal + 1e-9 < medQty;
                      return (
                        <div className={`text-sm rounded-lg border px-3.5 py-2.5 ${
                          matched ? 'border-forest-700/40 bg-forest-700/5 text-ink'
                            : tooLow ? 'border-red-300 bg-red-50 text-red-800'
                              : 'border-line bg-surface/40 text-muted'
                        }`}>
                          Base Medicine Quantity: <strong>{formatQtyLabel(medQty, formulaUnit)}</strong>
                          {' · '}
                          Total Herbs: <strong>{formatQtyLabel(herbTotal, formulaUnit)}</strong>
                          {matched && ' — balanced (100%)'}
                          {tooLow && ' — herb sum is less than base medicine quantity'}
                          {!matched && !tooLow && medQty > 0 && herbTotal > 0 && ' — herb sum exceeds base medicine quantity'}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-6 text-center rounded-xl bg-surface/30 border border-dashed border-line space-y-3">
                    <p className="text-muted text-sm">No formula ingredients have been configured for this medicine code yet.</p>
                    {canWrite && (
                      <Button
                        size="sm"
                        onClick={() => setActiveTab('edit')}
                      >
                        <Plus className="w-4 h-4" /> Add Formula Now
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-ink">All Medicine Codes &amp; Formulas</h3>
                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search medicines..."
                      value={overviewSearch}
                      onChange={e => setOverviewSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-line text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-forest-700/30"
                    />
                  </div>
                </div>
                <Table columns={overviewColumns} data={filteredMedicines} />
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* 2. ADD / EDIT FORMULA TAB */}
      {activeTab === 'edit' && (
        <Card>
          <CardBody className="space-y-4">
            {selectedMedicineCodeId && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-forest-50 border border-forest-200">
                <span className="text-sm font-medium text-forest-800">
                  {hasRecipe ? 'Editing Formula for:' : 'Configuring New Formula for:'}{' '}
                  <strong>{selectedMedicine?.code} — {selectedMedicine?.name}</strong>
                </span>
                <Button size="sm" variant="outline" onClick={() => setActiveTab('view')}>
                  <Eye className="w-3.5 h-3.5" /> View Mode
                </Button>
              </div>
            )}

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
                    label: `${m.code} — ${m.name}${m.hasRecipe ? ' (Configured)' : ''}`,
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

            <Textarea
              label="Description / Preparation Notes"
              placeholder={selectedMedicineCodeId ? "Enter formula description, preparation instructions, or notes (optional)..." : "Select a medicine to enter description..."}
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={!canWrite || !selectedMedicineCodeId}
              rows={2}
            />

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
      )}

      {/* 3. DELETE FORMULA TAB */}
      {activeTab === 'delete' && (
        <Card>
          <CardBody className="space-y-4">
            {!isAdmin && (
              <Alert type="error">Administrator permissions are required to delete formulas.</Alert>
            )}

            <div className="flex flex-wrap gap-4 items-end">
              <DropdownSelect
                label="Select Medicine Formula to Delete"
                searchable
                searchPlaceholder="Type medicine code or name..."
                placeholder="Choose from medicine codes"
                value={selectedMedicineCodeId}
                onChange={val => selectMedicineCode(val)}
                className="min-w-[260px] flex-1"
                disabled={!isAdmin}
                options={[
                  { value: '', label: 'Choose a medicine' },
                  ...medicineOptions.filter(m => m.hasRecipe).map(m => ({
                    value: String(m.medicineCodeId),
                    label: `${m.code} — ${m.name} (${m.recipeItemsCount || 'configured'} herbs)`,
                  })),
                ]}
              />
              {selectedMedicineCodeId && (
                <Button
                  variant="secondary"
                  onClick={() => selectMedicineCode('')}
                >
                  Clear Selection
                </Button>
              )}
            </div>

            {message && <Alert type={message.includes('success') ? 'success' : 'error'}>{message}</Alert>}

            {selectedMedicineCodeId ? (
              hasRecipe && recipe.length > 0 ? (
                <div className="p-5 rounded-xl border border-red-200 bg-red-50/40 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-red-100 text-red-700 shrink-0">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-red-900">
                        Confirm Formula Deletion: {selectedMedicine?.code} — {selectedMedicine?.name}
                      </h3>
                      <p className="text-sm text-red-700 mt-1">
                        Are you sure you want to delete the formula for this medicine? All <strong>{recipe.length}</strong> ingredient associations
                        for base quantity <strong>{formulaQuantity} {formulaUnit}</strong> will be permanently removed.
                        The medicine code itself will remain intact.
                      </p>
                    </div>
                  </div>

                  {description && (
                    <div className="text-sm text-muted bg-white p-3 rounded-lg border border-red-100">
                      <span className="font-semibold text-ink mr-2">Description:</span>
                      {description}
                    </div>
                  )}

                  <div className="bg-white rounded-lg border border-red-100 p-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted block mb-2">
                      Ingredients to be removed ({recipe.length}):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {recipe.map((r, i) => (
                        <span key={i} className="inline-flex items-center px-2.5 py-1 rounded bg-surface text-ink text-xs font-medium border border-line">
                          {r.herbName || 'Herb'}: <strong>{r.quantity} {r.unit}</strong>
                        </span>
                      ))}
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        variant="danger"
                        onClick={handleDeleteFormula}
                        disabled={saving}
                        className="flex items-center gap-1.5"
                      >
                        <Trash2 className="w-4 h-4" /> {saving ? 'Deleting...' : 'Yes, Delete This Formula'}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setActiveTab('view')}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <Alert type="info">
                  No formula is defined for <strong>{selectedMedicine?.code} — {selectedMedicine?.name}</strong>. There are no formula ingredients to delete.
                </Alert>
              )
            ) : (
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-ink">Formulas Available for Deletion</h3>
                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search formulas..."
                      value={overviewSearch}
                      onChange={e => setOverviewSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-line text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-forest-700/30"
                    />
                  </div>
                </div>
                {medicineOptions.filter(m => m.hasRecipe).length === 0 ? (
                  <p className="text-sm text-muted p-4 text-center rounded-lg bg-surface/30 border border-line">
                    No medicine formulas are currently defined.
                  </p>
                ) : (
                  <Table
                    columns={deleteOverviewColumns}
                    data={filteredMedicines.filter(m => m.hasRecipe)}
                  />
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* 4. PRINT FORMULA TAB */}
      {activeTab === 'print' && (
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
                    label: `${m.code} — ${m.name}${m.hasRecipe ? ' (Configured)' : ''}`,
                  })),
                ]}
              />
              <QtyUnitField
                label="Generate Qty"
                className="w-64"
                quantity={generateQuantity}
                unit={generateUnit}
                onQuantityChange={e => setGenerateQuantity(e.target.value)}
                onUnitChange={e => setGenerateUnit(e.target.value)}
              />
              <Input
                label="Batch Number"
                placeholder="e.g. BAT-001"
                value={batchNumber}
                onChange={e => setBatchNumber(e.target.value)}
                className="w-48"
              />
              <Input
                label="Firm Name"
                placeholder="e.g. Uttam Laboratories"
                value={firmName}
                onChange={e => setFirmName(e.target.value)}
                className="w-56"
              />
              <Button onClick={handleGenerate} disabled={!selectedMedicineCodeId || !generateQuantity || !(parseFloat(generateQuantity) > 0) || generating}>
                {generating ? 'Generating...' : 'Calculate Sheet'}
              </Button>
            </div>

            {message && !selectedMedicineCodeId && <Alert type="error">{message}</Alert>}

            {selectedMedicineCodeId ? (
              !hasRecipe ? (
                <div className="p-6 text-center rounded-xl bg-surface/30 border border-dashed border-line space-y-3">
                  <p className="text-muted text-sm">No base formula is defined for <strong>{selectedMedicine?.code} — {selectedMedicine?.name}</strong>. Define a formula first before generating or printing.</p>
                  {canWrite && (
                    <Button size="sm" onClick={() => setActiveTab('edit')}>
                      <Plus className="w-4 h-4" /> Define Formula Now
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted">
                      Base formula: <strong className="text-ink">{baseFormulaQuantity} {baseFormulaUnit}</strong>. Herb requirements scale dynamically to your entered batch quantity.
                    </p>
                    {description && (
                      <p className="text-sm text-ink bg-surface/80 rounded-lg p-2.5 border border-line">
                        <span className="font-medium text-muted mr-1.5">Description:</span>
                        {description}
                      </p>
                    )}
                  </div>

                  {message && (
                    <Alert type={message.includes('Consumed') || message.includes('success') ? 'success' : 'error'}>
                      {message}
                    </Alert>
                  )}

                  {generated?.items?.length > 0 && (
                    <>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                        <p>
                          Scaled from {generated.formulaQuantity} {generated.formulaUnit} to {generateQuantity} {generateUnit}
                          {generateUnit !== generated.formulaUnit ? ` (${generated.batchSize} ${generated.formulaUnit})` : ''}.
                        </p>
                        {batchNumber && <p>Batch: <strong className="text-ink">{batchNumber}</strong></p>}
                        {firmName && <p>Firm: <strong className="text-ink">{firmName}</strong></p>}
                      </div>
                      <Table columns={generateColumns} data={generated.items} />
                      <div className="flex gap-2 flex-wrap items-center">
                        <Button variant="secondary" onClick={handlePrintGenerated}>
                          <Printer className="w-4 h-4" /> Print Formula Sheet
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="saffron"
                            onClick={handleConsume}
                            disabled={generating || saving}
                          >
                            Consume Herbs
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            ) : (
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-ink">Formulas Ready to Print</h3>
                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search formulas to print..."
                      value={overviewSearch}
                      onChange={e => setOverviewSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-line text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-forest-700/30"
                    />
                  </div>
                </div>
                {medicineOptions.filter(m => m.hasRecipe).length === 0 ? (
                  <p className="text-sm text-muted p-4 text-center rounded-lg bg-surface/30 border border-line">
                    No medicine formulas are currently defined.
                  </p>
                ) : (
                  <Table
                    columns={printOverviewColumns}
                    data={filteredMedicines.filter(m => m.hasRecipe)}
                  />
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </Layout>
  );
}
