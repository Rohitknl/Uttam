import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, Eye, Edit3, Trash2, Plus, Search, AlertTriangle, Lock, Unlock, Key } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Select, Input, Textarea, DropdownSelect, Table, Badge, PageHeader, LoadingSpinner, Alert, Modal, PrintPreviewModal } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { medicineCodesApi, herbsApi, herbCodesApi, formulasApi, settingsApi } from '../../api';
import { printHtml } from '../../utils/print';

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

function getItemRateAndAmount(item, herb) {
  const rate = parseFloat(herb?.costPerUnit ?? item?.costPerUnit ?? 0) || 0;
  const stockUnit = herb?.unitOfMeasure || item?.stockUnit || item?.unit || 'KG';
  const qty = parseFloat(item.scaledQuantity ?? item.quantity ?? 0) || 0;
  const unit = item.unitOfMeasure || item.unit || stockUnit;

  let qtyInStockUnit = qty;
  if (UNIT_FAMILY[unit] && UNIT_FAMILY[stockUnit] && UNIT_FAMILY[unit] === UNIT_FAMILY[stockUnit]) {
    qtyInStockUnit = fromBase(toBase(qty, unit), stockUnit);
  }
  const amount = Math.round(qtyInStockUnit * rate * 100) / 100;

  return {
    rate,
    stockUnit,
    rateLabel: rate > 0 ? `₹${rate.toFixed(2)} / ${stockUnit}` : '—',
    amount,
    amountLabel: amount > 0 ? `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
    qtyInStockUnit,
  };
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

/** Calculate ingredient summary and weight totals across elements. */
function sumHerbQuantityInUnit(recipeItems, herbsList, medicineUnit) {
  const medFamily = UNIT_FAMILY[medicineUnit];
  let totalBaseSameFamily = 0;
  let hasSameFamily = false;
  let totalWeightGrams = 0;
  let totalVolumeMl = 0;
  const used = [];

  for (const r of recipeItems) {
    if (!r.herbId || r.quantity === '' || r.quantity == null) continue;
    const qty = parseFloat(r.quantity);
    if (!(qty > 0)) continue;
    const herb = herbsList.find(h => h.id === parseInt(r.herbId, 10));
    const unit = normalizeHerbUnit(herb, r.unit);
    const fam = UNIT_FAMILY[unit] || UNIT_FAMILY.KG;
    if (fam === 'mass') {
      totalWeightGrams += toBase(qty, unit);
    } else if (fam === 'volume') {
      totalVolumeMl += toBase(qty, unit);
    }
    if (medFamily && fam === medFamily) {
      totalBaseSameFamily += toBase(qty, unit);
      hasSameFamily = true;
    }
    used.push({ herbId: parseInt(r.herbId, 10), quantity: qty, unit, herb });
  }

  return {
    items: used,
    isSameFamily: Boolean(hasSameFamily && medFamily),
    totalInMedicineUnit: (hasSameFamily && medFamily) ? round4(fromBase(totalBaseSameFamily, medicineUnit)) : null,
    totalWeightKg: totalWeightGrams > 0 ? round4(totalWeightGrams / 1000) : null,
    totalVolumeLiters: totalVolumeMl > 0 ? round4(totalVolumeMl / 1000) : null,
  };
}

export default function FormulaPage() {
  const { canWrite, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = ['edit', 'view', 'print', 'delete'].includes(tabParam)
    ? tabParam
    : (tabParam === 'define' ? 'edit' : (tabParam === 'generate' ? 'print' : 'edit'));

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
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printSpecificMedId, setPrintSpecificMedId] = useState('');
  const [printingFormula, setPrintingFormula] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewTitle, setPreviewTitle] = useState('Formula Print Preview');
  const [previewSubtitle, setPreviewSubtitle] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [consumeConfirmOpen, setConsumeConfirmOpen] = useState(false);

  // Category password protection state
  const [unlockedCategories, setUnlockedCategories] = useState({
    view: false,
    edit: false,
    delete: false,
    print: false,
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  // Set category password modal state
  const [showSetPasswordModal, setShowSetPasswordModal] = useState(false);
  const [targetCategoryForPassword, setTargetCategoryForPassword] = useState('view');
  const [setPasswordForm, setSetPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [setPasswordMessage, setSetPasswordMessage] = useState('');
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);

  const CATEGORY_NAMES = {
    view: 'View Formula',
    edit: 'Add / Edit Formula',
    print: 'Generate/Print Formula',
    delete: 'Delete Formula',
  };

  const CATEGORY_DESCRIPTIONS = {
    view: 'Inspect base formula recipes, stock quantities, and ingredient breakdowns',
    edit: 'Configure and balance medicine ingredients, quantities, and preparation notes',
    delete: 'Safely remove ingredient associations from medicine formulas',
    print: 'Dynamically scale requirements by batch quantity and print formula sheets',
  };

  const handleUnlockCategory = async (category) => {
    if (!passwordInput.trim()) {
      setPasswordError('Please enter a password');
      return;
    }
    setVerifyingPassword(true);
    setPasswordError('');
    try {
      await settingsApi.verifyCategoryPassword(category, passwordInput);
      setUnlockedCategories(prev => ({
        ...prev,
        [category]: true,
        view: true,
        edit: true,
        print: true,
        delete: prev.delete || category === 'delete',
      }));
      setPasswordInput('');
      setPasswordError('');
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Incorrect password. Please try again.');
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleLockCategory = (category) => {
    setUnlockedCategories(prev => ({ ...prev, [category]: false }));
    setPasswordInput('');
    setPasswordError('');
  };

  const openSetPasswordModal = (category) => {
    setTargetCategoryForPassword(category);
    setSetPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setSetPasswordMessage('');
    setShowSetPasswordModal(true);
  };

  const handleSaveCategoryPassword = async (e) => {
    e.preventDefault();
    setSetPasswordMessage('');
    if (setPasswordForm.newPassword.length < 4) {
      setSetPasswordMessage('New password must be at least 4 characters');
      return;
    }
    if (setPasswordForm.newPassword !== setPasswordForm.confirmPassword) {
      setSetPasswordMessage('New password and confirm password do not match');
      return;
    }
    setSetPasswordLoading(true);
    try {
      const res = await settingsApi.setCategoryPassword({
        category: targetCategoryForPassword,
        currentPassword: setPasswordForm.currentPassword,
        newPassword: setPasswordForm.newPassword,
        confirmPassword: setPasswordForm.confirmPassword,
      });
      setSetPasswordMessage(res.message || 'Password updated successfully!');
      setTimeout(() => {
        setShowSetPasswordModal(false);
        setSetPasswordMessage('');
      }, 1200);
    } catch (err) {
      setSetPasswordMessage(err.response?.data?.message || 'Failed to update password');
    } finally {
      setSetPasswordLoading(false);
    }
  };

  const setActiveTab = (tab) => {
    setMessage('');
    setPasswordInput('');
    setPasswordError('');
    setSearchParams(tab === 'edit' ? {} : { tab });
  };

  useEffect(() => {
    setMessage('');
    setPasswordInput('');
    setPasswordError('');
  }, [activeTab]);

  const buildOptions = (codes) => codes
    .filter(c => c.active !== false)
    .map(c => ({
      medicineCodeId: c.id,
      code: c.code,
      name: c.name,
      firmName: c.firmName || '',
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
        costPerUnit: herb?.costPerUnit ?? 0,
        firmName: herb?.supplierName || '',
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
        costPerUnit: h.costPerUnit ?? 0,
        firmName: h.supplierName || '',
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

  const herbsRef = useRef(herbs);
  herbsRef.current = herbs;
  const herbOptionsRef = useRef(herbOptions);
  herbOptionsRef.current = herbOptions;
  const medicineOptionsRef = useRef(medicineOptions);
  medicineOptionsRef.current = medicineOptions;

  useEffect(() => {
    loadLists().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedMedicineCodeId) {
      setFormulaQuantity('1');
      setFormulaUnit('PIECES');
      setFirmName('');
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
        const opt = medicineOptionsRef.current.find(m => String(m.medicineCodeId) === String(selectedMedicineCodeId));
        setHasRecipe(items.length > 0);
        setFormulaQuantity(String(data.formulaQuantity ?? 1));
        const unit = data.formulaUnit || 'PIECES';
        setFormulaUnit(unit);
        setFirmName(data.firmName || opt?.firmName || '');
        setDescription(data.description || '');
        setBaseFormulaQuantity(data.formulaQuantity ?? 1);
        setBaseFormulaUnit(unit);
        setGenerateUnit(unit);
        setGenerateQuantity(String(data.formulaQuantity ?? 1));
        setRecipe(items.map((r, i) => {
          const herb = herbsRef.current.find(h => h.id === r.herbId);
          const optHerb = herbOptionsRef.current.find(o => o.herbId === r.herbId)
            || herbOptionsRef.current.find(o => o.herbCodeId === herb?.herbCodeId);
          return {
            _key: r.id ? `server-${r.id}` : `recipe-${i}-${Date.now()}`,
            herbId: String(r.herbId),
            herbCodeId: optHerb ? String(optHerb.herbCodeId) : (herb?.herbCodeId ? String(herb.herbCodeId) : ''),
            herbCode: r.herbCode || optHerb?.code || herb?.herbCode || '—',
            herbName: r.herbName || herb?.name || optHerb?.name || '',
            costPerUnit: r.costPerUnit ?? herb?.costPerUnit ?? optHerb?.costPerUnit ?? 0,
            quantity: String(r.quantity ?? ''),
            unit: normalizeHerbUnit(herb || { unitOfMeasure: r.unit }, r.unit),
          };
        }));
      })
      .catch(() => {
        const opt = medicineOptionsRef.current.find(m => String(m.medicineCodeId) === String(selectedMedicineCodeId));
        setHasRecipe(false);
        setFormulaQuantity('1');
        const unit = opt?.formulaUnit || 'PIECES';
        setFormulaUnit(unit);
        setFirmName(opt?.firmName || '');
        setDescription(opt?.description || '');
        setBaseFormulaQuantity(1);
        setBaseFormulaUnit(unit);
        setGenerateUnit(unit);
        setGenerateQuantity('1');
        setRecipe([]);
      });
  }, [selectedMedicineCodeId]);

  useEffect(() => {
    if (herbOptions.length > 0 && recipe.length > 0) {
      setRecipe(prev => {
        let changed = false;
        const updated = prev.map(item => {
          if ((!item.herbCodeId || !item.herbName) && item.herbId) {
            const herb = herbs.find(h => h.id === parseInt(item.herbId, 10));
            const opt = herbOptions.find(o => o.herbId === parseInt(item.herbId, 10))
              || herbOptions.find(o => o.herbCodeId === herb?.herbCodeId);
            if (opt || herb) {
              changed = true;
              return {
                ...item,
                herbCodeId: item.herbCodeId || (opt ? String(opt.herbCodeId) : (herb?.herbCodeId ? String(herb.herbCodeId) : '')),
                herbName: item.herbName || herb?.name || opt?.name || '',
              };
            }
          }
          return item;
        });
        return changed ? updated : prev;
      });
    }
  }, [herbOptions, herbs]);

  useEffect(() => {
    if (activeTab === 'print' && selectedMedicineCodeId && hasRecipe && !generating) {
      const qty = generateQuantity || String(baseFormulaQuantity || 1);
      const batchSize = toBatchSize(qty, generateUnit, baseFormulaUnit);
      if (batchSize > 0) {
        const timer = setTimeout(() => {
          formulasApi.generate({
            medicineCodeId: parseInt(selectedMedicineCodeId, 10),
            batchSize,
          })
            .then(res => setGenerated(res))
            .catch(() => setGenerated(null));
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [activeTab, selectedMedicineCodeId, hasRecipe, generateQuantity, generateUnit, baseFormulaQuantity, baseFormulaUnit]);

  const selectMedicineCode = (medicineCodeId) => {
    setMessage('');
    setGenerated(null);
    setSelectedMedicineCodeId(medicineCodeId ? String(medicineCodeId) : '');
  };

  const addItem = () => {
    setRecipe(prev => [
      ...prev,
      {
        _key: `new-${Date.now()}-${Math.random()}`,
        herbId: '',
        herbCodeId: '',
        herbCode: '',
        herbName: '',
        costPerUnit: 0,
        quantity: '',
        unit: '',
      },
    ]);
  };

  const resolveHerbFromOption = (opt) => {
    if (!opt) return null;
    if (opt.herbId) {
      const found = herbs.find(h => String(h.id) === String(opt.herbId));
      if (found) return found;
    }
    if (opt.herbCodeId) {
      const found = herbs.find(h => h.herbCodeId && String(h.herbCodeId) === String(opt.herbCodeId));
      if (found) return found;
    }
    if (opt.code) {
      const found = herbs.find(h => h.herbCode && String(h.herbCode).trim().toUpperCase() === String(opt.code).trim().toUpperCase());
      if (found) return found;
    }
    if (opt.name) {
      const found = herbs.find(h => h.name && String(h.name).trim().toUpperCase() === String(opt.name).trim().toUpperCase());
      if (found) return found;
    }
    return null;
  };

  const selectHerbForRow = async (idx, herbCodeId) => {
    if (!herbCodeId) {
      setRecipe(prev => {
        const updated = [...prev];
        if (updated[idx]) {
          updated[idx] = { ...updated[idx], herbCodeId: '', herbId: '', herbCode: '', herbName: '', costPerUnit: 0, unit: '', quantity: '' };
        }
        return updated;
      });
      return;
    }
    const alreadyUsed = recipe.some((r, i) => i !== idx && String(r.herbCodeId) === String(herbCodeId));
    if (alreadyUsed) {
      setMessage('This element is already in the formula. Each element can be added only once.');
      return;
    }
    const opt = herbOptions.find(o => String(o.herbCodeId) === String(herbCodeId));
    let herb = resolveHerbFromOption(opt);

    // If herb code exists but has not been added to store yet, automatically ensure it in store!
    if (!herb && opt) {
      const rawCodeId = parseInt(opt.herbCodeId, 10);
      if (Number.isInteger(rawCodeId) && rawCodeId > 0) {
        try {
          const createdHerb = await herbsApi.ensureFromCode(rawCodeId);
          if (createdHerb) {
            herb = createdHerb;
            setHerbs(prev => {
              const exists = prev.some(h => h.id === createdHerb.id);
              return exists ? prev : [...prev, createdHerb];
            });
            setHerbOptions(prev => prev.map(o => {
              if (String(o.herbCodeId) === String(opt.herbCodeId)) {
                return {
                  ...o,
                  herbId: createdHerb.id,
                  code: opt.code,
                  unit: createdHerb.unitOfMeasure || o.unit,
                  stock: createdHerb.currentStock ?? 0,
                  costPerUnit: createdHerb.costPerUnit ?? 0,
                  firmName: createdHerb.supplierName || o.firmName || '',
                };
              }
              return o;
            }));
          }
        } catch (err) {
          console.warn('ensureHerbFromCode notice:', err);
        }
      }
    }

    if (!herb) {
      const err = `Element "${opt?.name || 'Selected element'}" does not exist in Store. Please add it on the Elements page.`;
      setMessage(err);
      return;
    }

    const herbAlreadyUsed = recipe.some((r, i) => i !== idx && String(r.herbId) === String(herb.id));
    if (herbAlreadyUsed) {
      setMessage(`Element "${herb.name}" is already in the formula. Each element can be added only once.`);
      return;
    }

    setRecipe(prev => {
      const updated = [...prev];
      if (!updated[idx]) return prev;
      updated[idx] = {
        ...updated[idx],
        herbCodeId: String(herbCodeId),
        herbId: String(herb.id),
        herbCode: opt?.code || herb.herbCode || '—',
        herbName: herb.name || opt?.name || '',
        costPerUnit: herb.costPerUnit ?? opt?.costPerUnit ?? 0,
        unit: normalizeHerbUnit(herb, opt?.unit),
      };
      return updated;
    });
    setMessage('');

    // Automatically place cursor into the Quantity input so user can immediately type
    setTimeout(() => {
      const qtyInput = document.querySelector(`input[data-recipe-qty="${idx}"]`);
      if (qtyInput) {
        qtyInput.focus();
        qtyInput.select?.();
      }
    }, 50);
  };

  const updateItem = (idx, field, value) => {
    setRecipe(prev => {
      const updated = [...prev];
      if (!updated[idx]) return prev;
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === 'unit') {
        const herb = herbs.find(h => h.id === parseInt(updated[idx].herbId, 10));
        updated[idx].unit = normalizeHerbUnit(herb, value);
      }
      return updated;
    });
  };

  const removeItem = (idx) => setRecipe(prev => prev.filter((_, i) => i !== idx));

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

    const validRecipeItems = recipe.filter(r => r.herbId && parseFloat(r.quantity) > 0);
    if (!validRecipeItems.length) {
      setMessage('Add at least one element with quantity before saving the formula');
      return;
    }

    setSaving(true);
    try {
      const items = [];
      const seen = new Set();
      for (const r of recipe) {
        if (!r.herbId || r.quantity === '') continue;
        const herbId = parseInt(r.herbId, 10);
        if (seen.has(herbId)) {
          const herb = herbs.find(h => h.id === herbId);
          setMessage(`Element "${herb?.name || herbId}" is added more than once. Each element can appear only once.`);
          setSaving(false);
          return;
        }
        seen.add(herbId);
        let herb = herbs.find(h => h.id === herbId);
        if (!herb && r.herbCodeId) {
          const rawCodeId = parseInt(r.herbCodeId, 10);
          if (Number.isInteger(rawCodeId) && rawCodeId > 0) {
            try {
              herb = await herbsApi.ensureFromCode(rawCodeId);
            } catch {}
          }
        }
        if (!herb) {
          const err = `Element "${r.herbName || herbId}" does not exist in Store. Please add it on the Elements page.`;
          setMessage(err);
          setSaving(false);
          return;
        }
        const unit = normalizeHerbUnit(herb, r.unit);
        if (UNIT_FAMILY[unit] !== UNIT_FAMILY[herb.unitOfMeasure || 'KG']) {
          setMessage(`Unit for ${herb.name} must be ${unitsForHerb(herb).join(' or ')} (same as Elements page)`);
          setSaving(false);
          return;
        }
        const qty = parseFloat(r.quantity) || 0;
        if (!(qty > 0)) continue;
        items.push({
          herbId: herb.id,
          quantity: qty,
          unit,
        });
      }
      await medicineCodesApi.updateRecipe(selectedMedicineCodeId, {
        formulaQuantity: medQty,
        formulaUnit,
        description: description ? description.trim() : '',
        firmName: firmName ? firmName.trim() : '',
        items,
      });
      setHasRecipe(true);
      setMedicineOptions(prev => prev.map(m => (
        String(m.medicineCodeId) === String(selectedMedicineCodeId)
          ? {
              ...m,
              firmName: firmName ? firmName.trim() : '',
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

  const handleDeleteFormula = () => {
    if (!selectedMedicineCodeId) return;
    setDeleteConfirmOpen(true);
  };

  const executeDeleteFormula = async () => {
    if (!selectedMedicineCodeId) return;
    const selected = medicineOptions.find(m => String(m.medicineCodeId) === String(selectedMedicineCodeId));
    const medName = selected ? `${selected.code} — ${selected.name}` : 'this medicine';

    setDeleteConfirmOpen(false);
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
      setSelectedMedicineCodeId('');
      setFormulaQuantity('1');
      setFormulaUnit('PIECES');
      setFirmName('');
      setDescription('');
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
    try {
      const payload = {
        medicineCodeId: parseInt(selectedMedicineCodeId, 10),
        batchSize: toBatchSize(generateQuantity, generateUnit, baseFormulaUnit),
      };
      const result = await formulasApi.generate(payload);
      setGenerated(result);
      if (!result.sufficient) {
        setMessage(result.message || 'Insufficient element stock to generate this formula');
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Generate failed');
    } finally {
      setGenerating(false);
    }
  };

  const buildGeneratedFormulaHtml = () => {
    if (!generated?.items?.length) return '';
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

    let totalRequiredQty = 0;
    let totalRequiredAmount = 0;

    const rows = generated.items.map((r, i) => {
      const herb = herbs.find(h => h.id === parseInt(r.herbId, 10));
      const opt = herbOptions.find(o => o.herbId === r.herbId || (r.herbCodeId && String(o.herbCodeId) === String(r.herbCodeId)));
      const elCode = r.herbCode || opt?.code || herb?.herbCode || '—';
      const rateInfo = getItemRateAndAmount(r, herb);
      totalRequiredQty += parseFloat(r.scaledQuantity) || 0;
      totalRequiredAmount += rateInfo.amount || 0;

      return `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="code">${esc(elCode)}</td>
        <td class="bold">${esc(r.herbName)}</td>
        <td class="r bold">${esc(r.scaledQuantity)} ${esc(r.unitOfMeasure || '')}</td>
        <td class="r">${esc(rateInfo.rateLabel)}</td>
        <td class="r bold">${esc(rateInfo.amountLabel)}</td>
        <td class="r">${esc(r.availableInRecipeUnit ?? r.availableStock)} ${esc(r.unitOfMeasure || '')}</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Generated Formula — ${esc(code)}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #111827; padding: 20px; font-size: 14px; }
    .brand { font-size: 22px; font-weight: 800; color: #1e3a2b; letter-spacing: 0.5px; }
    .sub { font-size: 13px; color: #475569; margin-bottom: 12px; font-weight: 500; }
    h1 { font-size: 18px; margin: 0 0 14px; font-weight: 800; color: #0f172a; letter-spacing: 0.5px; border-bottom: 2px solid #1e3a2b; padding-bottom: 6px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; font-size: 13.5px; }
    .meta div span { color: #475569; display: inline-block; min-width: 120px; font-weight: 500; }
    .meta div strong { color: #0f172a; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13.5px; }
    th, td { border: 1px solid #94a3b8; padding: 7px 10px; }
    th { background: #e8efe9; color: #143521; text-align: left; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.3px; }
    td { font-size: 13.5px; color: #0f172a; }
    .c { text-align: center; } .r { text-align: right; }
    .code { font-family: monospace; font-weight: 700; font-size: 13.5px; color: #143521; }
    .bold { font-weight: 700; font-size: 13.5px; color: #0f172a; }
    .desc-box { margin-top: 18px; padding: 12px 14px; background: #f8faf8; border: 1px solid #94a3b8; border-radius: 6px; }
    .desc-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #1e3a2b; margin-bottom: 5px; }
    .desc-content { font-size: 13.5px; color: #0f172a; white-space: pre-wrap; line-height: 1.5; }
    .foot { margin-top: 24px; color: #475569; font-size: 12.5px; font-weight: 500; border-top: 1px dashed #94a3b8; padding-top: 10px; }
    @media print { body { padding: 0; } @page { margin: 10mm; size: auto; } }
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
    <div><span>Base Formula</span><strong>${esc(generated.formulaQuantity)} ${esc(generated.formulaUnit)}</strong></div>
    <div><span>Generate Qty</span><strong>${esc(generateQuantity)} ${esc(generateUnit)}${generateUnit !== generated.formulaUnit ? ` (${esc(generated.batchSize)} ${esc(generated.formulaUnit)})` : ''}</strong></div>
    <div><span>Date</span><strong>${new Date().toLocaleDateString('en-IN')}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="c" style="width: 35px;">#</th>
        <th style="width: 130px;">Element Code</th>
        <th>Element</th>
        <th class="r" style="width: 140px;">Required Qty</th>
        <th class="r" style="width: 130px;">Rate / Unit</th>
        <th class="r" style="width: 140px;">Amount</th>
        <th class="r" style="width: 120px;">Available Stock</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background: #e8efe9; font-weight: 700; border-top: 2px solid #1e3a2b;">
        <td colspan="3" class="bold" style="text-align: right; text-transform: uppercase;">Total Required:</td>
        <td class="r bold" style="font-size: 14px; color: #143521;">${round4(totalRequiredQty)} ${esc(generateUnit || generated.formulaUnit || '')}</td>
        <td class="r bold" style="text-align: right; text-transform: uppercase;">Total Amount:</td>
        <td class="r bold" style="font-size: 14px; color: #143521;">₹${totalRequiredAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  ${displayDescription ? `
  <div class="desc-box">
    <div class="desc-title">Description / Batch Notes</div>
    <div class="desc-content">${esc(displayDescription)}</div>
  </div>` : ''}
  <div class="foot">Computer-generated formula sheet — ${esc(displayFirm)}</div>
</body>
</html>`;
  };

  const handlePrintGenerated = () => {
    const html = buildGeneratedFormulaHtml();
    if (!html) return;
    printHtml(html);
  };

  const handlePreviewGenerated = () => {
    const html = buildGeneratedFormulaHtml();
    if (!html) return;
    const selected = medicineOptions.find(o => String(o.medicineCodeId) === String(selectedMedicineCodeId));
    setPreviewTitle(`Formula Sheet: ${generated?.medicineCode || selected?.code || ''}`);
    setPreviewSubtitle(`${generated?.medicineName || selected?.name || ''} — Batch: ${batchNumber || 'N/A'}`);
    setPreviewHtml(html);
    setPreviewModalOpen(true);
  };

  const handleConsume = () => {
    if (!generated?.items?.length) return;
    setConsumeConfirmOpen(true);
  };

  const executeConsume = async () => {
    setConsumeConfirmOpen(false);
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
      setMessage(`Consumed elements: ${summary}`);
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

  const buildSpecificFormulaHtml = async (medId) => {
    const targetId = medId || selectedMedicineCodeId;
    if (!targetId) return null;

    const med = medicineOptions.find(m => String(m.medicineCodeId) === String(targetId));
    let recipeData = [];
    let baseQty = med?.formulaQuantity ?? 1;
    let baseUnit = med?.formulaUnit || 'PIECES';
    let medDesc = med?.description || '';
    let medFirm = (firmName || med?.firmName || '').trim() || 'Uttam Laboratories';

    if (String(targetId) === String(selectedMedicineCodeId) && recipe.length > 0) {
      recipeData = recipe.map(r => {
        const herb = herbs.find(h => String(h.id) === String(r.herbId));
        const opt = herbOptions.find(o => String(o.herbCodeId) === String(r.herbCodeId))
          || herbOptions.find(o => String(o.herbId) === String(r.herbId));
        return {
          herbId: r.herbId,
          herbCode: r.herbCode || opt?.code || herb?.herbCode || '—',
          herbName: r.herbName || opt?.name || herb?.name || 'Element',
          quantity: r.quantity,
          unit: r.unit,
        };
      });
      baseQty = formulaQuantity;
      baseUnit = formulaUnit;
      medDesc = description;
      medFirm = (firmName || med?.firmName || '').trim() || 'Uttam Laboratories';
    } else {
      const data = await medicineCodesApi.getRecipe(targetId);
      const items = data.items || [];
      baseQty = data.formulaQuantity ?? med?.formulaQuantity ?? 1;
      baseUnit = data.formulaUnit || med?.formulaUnit || 'PIECES';
      medDesc = data.description || med?.description || '';
      medFirm = (data.firmName || med?.firmName || '').trim() || 'Uttam Laboratories';
      recipeData = items.map(r => {
        const herb = herbs.find(h => h.id === r.herbId);
        const opt = herbOptions.find(o => o.herbId === r.herbId)
          || herbOptions.find(o => o.herbCodeId === herb?.herbCodeId);
        return {
          herbId: r.herbId,
          herbCode: r.herbCode || opt?.code || herb?.herbCode || '—',
          herbName: r.herbName || herb?.name || opt?.name || 'Element',
          quantity: r.quantity ?? '',
          unit: normalizeHerbUnit(herb || { unitOfMeasure: r.unit }, r.unit),
        };
      });
    }

    if (!recipeData.length) {
      setMessage(`No formula ingredients configured for ${med?.code || 'this medicine'}.`);
      return null;
    }

    const esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const code = med?.code || '—';
    const name = med?.name || '—';

    let totalFormulaQty = 0;
    let totalFormulaAmount = 0;

    const rows = recipeData.map((r, i) => {
      const herb = herbs.find(h => String(h.id) === String(r.herbId));
      const rateInfo = getItemRateAndAmount(r, herb);
      totalFormulaQty += parseFloat(r.quantity) || 0;
      totalFormulaAmount += rateInfo.amount || 0;

      return `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="code">${esc(r.herbCode)}</td>
        <td class="bold">${esc(r.herbName)}</td>
        <td class="r bold">${esc(r.quantity)} ${esc(r.unit)}</td>
        <td class="r">${esc(rateInfo.rateLabel)}</td>
        <td class="r bold">${esc(rateInfo.amountLabel)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Formula — ${esc(code)}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #111827; padding: 20px; font-size: 14px; }
    .brand { font-size: 22px; font-weight: 800; color: #1e3a2b; letter-spacing: 0.5px; }
    .sub { font-size: 13px; color: #475569; margin-bottom: 12px; font-weight: 500; }
    h1 { font-size: 18px; margin: 0 0 14px; font-weight: 800; color: #0f172a; letter-spacing: 0.5px; border-bottom: 2px solid #1e3a2b; padding-bottom: 6px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; background: #f6faf7; padding: 14px; border: 1px solid #94a3b8; border-radius: 6px; font-size: 13.5px; }
    .meta div span { color: #475569; display: inline-block; min-width: 130px; font-size: 13px; font-weight: 500; }
    .meta div strong { color: #0f172a; font-weight: 700; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13.5px; }
    th, td { border: 1px solid #94a3b8; padding: 7px 10px; }
    th { background: #e8efe9; color: #143521; text-align: left; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
    td { font-size: 13.5px; color: #0f172a; }
    tr:nth-child(even) { background: #f8faf8; }
    .c { text-align: center; } .r { text-align: right; }
    .code { font-family: monospace; font-weight: 700; font-size: 14px; color: #143521; }
    .bold { font-weight: 700; font-size: 14px; color: #0f172a; }
    .desc-box { margin-top: 18px; padding: 12px 14px; background: #f8faf8; border: 1px solid #94a3b8; border-radius: 6px; }
    .desc-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #1e3a2b; margin-bottom: 5px; }
    .desc-content { font-size: 13.5px; color: #0f172a; white-space: pre-wrap; line-height: 1.5; }
    .foot { margin-top: 30px; color: #475569; font-size: 12.5px; font-weight: 500; border-top: 1px dashed #94a3b8; padding-top: 10px; display: flex; justify-content: space-between; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; font-size: 13px; font-weight: 600; color: #111827; }
    .signatures div { border-top: 1px solid #94a3b8; padding-top: 8px; text-align: center; color: #334155; }
    @media print { body { padding: 0; } @page { margin: 10mm; size: auto; } }
  </style>
</head>
<body>
  <div class="brand">${esc(medFirm)}</div>
  <div class="sub">Ayurvedic Stock &amp; Inventory</div>
  <h1>AYURVEDIC MEDICINE FORMULA SPECIFICATION</h1>
  <div class="meta">
    <div><span>Medicine Code</span><strong class="code">${esc(code)}</strong></div>
    <div><span>Medicine Name</span><strong>${esc(name)}</strong></div>
    <div><span>Firm Name</span><strong>${esc(medFirm)}</strong></div>
    <div><span>Base Formula</span><strong>${esc(baseQty)} ${esc(baseUnit)}</strong></div>
    <div><span>Total Ingredients</span><strong>${recipeData.length} elements</strong></div>
    <div><span>Printed Date</span><strong>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="c" style="width: 40px;">#</th>
        <th style="width: 140px;">Element Code</th>
        <th>Element</th>
        <th class="r" style="width: 150px;">Quantity</th>
        <th class="r" style="width: 130px;">Rate / Unit</th>
        <th class="r" style="width: 150px;">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background: #e8efe9; font-weight: 700; border-top: 2px solid #1e3a2b;">
        <td colspan="3" class="bold" style="text-align: right; text-transform: uppercase;">Total Base Formula:</td>
        <td class="r bold" style="font-size: 14px; color: #143521;">${round4(totalFormulaQty)} ${esc(baseUnit)}</td>
        <td class="r bold" style="text-align: right; text-transform: uppercase;">Total Cost:</td>
        <td class="r bold" style="font-size: 14px; color: #143521;">₹${totalFormulaAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    </tfoot>
  </table>
  ${medDesc ? `
  <div class="desc-box">
    <div class="desc-title">Description / Preparation Notes</div>
    <div class="desc-content">${esc(medDesc)}</div>
  </div>` : ''}
  <div class="signatures">
    <div>Prepared / Checked By</div>
    <div>Authorized Signatory (${esc(medFirm)})</div>
  </div>
  <div class="foot">
    <span>Formula Specification Sheet — ${esc(code)}</span>
    <span>${esc(medFirm)}</span>
  </div>
</body>
</html>`;

    return { code, name, html };
  };

  const handlePrintSpecificFormula = async (medId) => {
    setPrintingFormula(true);
    try {
      const res = await buildSpecificFormulaHtml(medId);
      if (res?.html) {
        printHtml(res.html);
      }
    } catch (err) {
      console.error(err);
      setMessage('Failed to load formula recipe for printing.');
    } finally {
      setPrintingFormula(false);
    }
  };

  const handlePreviewSpecificFormula = async (medId) => {
    setPrintingFormula(true);
    try {
      const res = await buildSpecificFormulaHtml(medId);
      if (res?.html) {
        setPreviewTitle(`Formula Specification: ${res.code}`);
        setPreviewSubtitle(res.name);
        setPreviewHtml(res.html);
        setPreviewModalOpen(true);
      }
    } catch (err) {
      console.error(err);
      setMessage('Failed to load formula recipe for preview.');
    } finally {
      setPrintingFormula(false);
    }
  };

  const buildFormulaListHtml = () => {
    const list = filteredMedicines;
    const esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const configuredCount = list.filter(m => m.hasRecipe).length;

    const rows = list.map((m, idx) => `
      <tr>
        <td class="c">${idx + 1}</td>
        <td class="code">${esc(m.code)}</td>
        <td class="bold">${esc(m.name)}</td>
        <td>${esc(m.firmName || '—')}</td>
        <td class="c">${esc(m.formulaQuantity ?? 1)} ${esc(m.formulaUnit || 'PIECES')}</td>
        <td class="c">${m.hasRecipe ? `${m.recipeItemsCount} elements` : '—'}</td>
        <td class="c">${m.hasRecipe ? '<span style="color:#2d5a3d;font-weight:600;">Configured</span>' : '<span style="color:#777;">Not Configured</span>'}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Medicine Formulas Directory — Uttam Laboratories</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #111827; padding: 20px; font-size: 14px; }
    .brand { font-size: 22px; font-weight: 800; color: #1e3a2b; letter-spacing: 0.5px; }
    .sub { font-size: 13px; color: #475569; margin-bottom: 12px; font-size: 13px; font-weight: 500; }
    h1 { font-size: 18px; margin: 0 0 14px; font-weight: 800; color: #0f172a; border-bottom: 2px solid #1e3a2b; padding-bottom: 6px; }
    .meta { display: flex; flex-wrap: wrap; gap: 24px; margin-bottom: 14px; font-size: 13px; color: #475569; }
    .meta strong { color: #0f172a; font-weight: 700; margin-left: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13.5px; }
    th, td { border: 1px solid #94a3b8; padding: 7px 10px; text-align: left; }
    th { background: #e8efe9; color: #143521; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.3px; }
    td { font-size: 13.5px; color: #0f172a; }
    tr:nth-child(even) { background: #f8faf8; }
    .c { text-align: center; } .r { text-align: right; }
    .code { font-family: monospace; font-weight: 700; font-size: 14px; color: #143521; }
    .bold { font-weight: 700; font-size: 14px; color: #0f172a; }
    .foot { margin-top: 24px; color: #475569; font-size: 12.5px; font-weight: 500; border-top: 1px dashed #94a3b8; padding-top: 10px; display: flex; justify-content: space-between; }
    @media print { body { padding: 0; } @page { margin: 10mm; size: auto; } }
  </style>
</head>
<body>
  <div class="brand">Uttam Laboratories</div>
  <div class="sub">Ayurvedic Stock &amp; Inventory</div>
  <h1>ALL MEDICINE FORMULAS DIRECTORY</h1>
  <div class="meta">
    <div>Total Medicine Codes:<strong>${list.length}</strong></div>
    <div>Configured Formulas:<strong>${configuredCount}</strong></div>
    <div>Printed Date:<strong>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="c" style="width: 35px;">#</th>
        <th style="width: 110px;">Medicine Code</th>
        <th>Medicine Name</th>
        <th>Firm Name</th>
        <th class="c" style="width: 120px;">Base Formula</th>
        <th class="c" style="width: 100px;">Ingredients</th>
        <th class="c" style="width: 110px;">Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot">
    <span>Formula Directory — Uttam Laboratories</span>
    <span>Total: ${list.length} records</span>
  </div>
</body>
</html>`;
  };

  const handlePrintFormulaList = () => {
    const html = buildFormulaListHtml();
    if (!html) return;
    printHtml(html);
  };

  const handlePreviewFormulaList = () => {
    const html = buildFormulaListHtml();
    if (!html) return;
    setPreviewTitle('Medicine Formulas Directory');
    setPreviewSubtitle(`${filteredMedicines.length} medicine records`);
    setPreviewHtml(html);
    setPreviewModalOpen(true);
  };

  const selectedMedicine = useMemo(() => (
    medicineOptions.find(m => String(m.medicineCodeId) === String(selectedMedicineCodeId))
  ), [medicineOptions, selectedMedicineCodeId]);

  const filteredMedicines = useMemo(() => {
    if (!overviewSearch.trim()) return medicineOptions;
    const q = overviewSearch.toLowerCase().trim();
    return medicineOptions.filter(m => (
      m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
    ));
  }, [medicineOptions, overviewSearch]);

  const viewColumns = [
    {
      key: 'index',
      label: '#',
      render: (r, idx) => (
        <span className="text-muted font-mono font-medium">
          {Number.isFinite(idx) ? idx + 1 : 1}
        </span>
      ),
    },
    {
      key: 'herbName',
      label: 'Element',
      render: r => {
        const opt = herbOptions.find(o => String(o.herbCodeId) === String(r.herbCodeId));
        const herb = herbs.find(h => h.id === parseInt(r.herbId, 10));
        const code = opt?.code || herb?.herbCode;
        const name = r.herbName || herb?.name || opt?.name || 'Element';
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
      key: 'srNo',
      label: '#',
      render: (_, idx) => (
        <span className="text-forest-800 font-mono text-sm font-bold">
          {Number.isFinite(idx) ? idx + 1 : 1}
        </span>
      ),
    },
    {
      key: 'code',
      label: 'Medicine Code',
      render: (m) => (
        <span className="inline-flex px-3 py-1 rounded-lg bg-forest-100 text-forest-950 border-2 border-forest-600 font-mono font-black text-sm tracking-wide shadow-2xs hover:bg-forest-200 cursor-pointer">
          {m.code}
        </span>
      ),
    },
    {
      key: 'name',
      label: 'Medicine Name',
      render: m => (
        <span className="font-bold text-base text-ink hover:text-forest-700 cursor-pointer">{m.name}</span>
      ),
    },
    {
      key: 'firmName',
      label: 'Firm Name',
      render: m => (
        <span className="font-medium text-slate-800">{m.firmName || '—'}</span>
      ),
    },
    {
      key: 'baseFormula',
      label: 'Base Formula',
      render: m => (
        <span className="font-semibold text-[15px] text-slate-800">
          {m.formulaQuantity ?? 1} <strong className="text-forest-700 font-bold">{m.formulaUnit || 'PIECES'}</strong>
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: m => (m.hasRecipe ? (
        <Badge variant="success">Configured ({m.recipeItemsCount} elements)</Badge>
      ) : (
        <Badge variant="warning">Not Configured</Badge>
      )),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: m => (
        <div className="flex gap-2">
          {canWrite && (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e?.stopPropagation?.();
                selectMedicineCode(m.medicineCodeId);
                setActiveTab('edit');
              }}
            >
              <Edit3 className="w-3.5 h-3.5" /> {m.hasRecipe ? 'Edit Formula' : 'Add Formula'}
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={(e) => {
              e?.stopPropagation?.();
              selectMedicineCode(m.medicineCodeId);
              setActiveTab('view');
            }}
          >
            <Eye className="w-3.5 h-3.5" /> View
          </Button>
          {m.hasRecipe && isAdmin && (
            <Button
              size="sm"
              variant="danger"
              onClick={(e) => {
                e?.stopPropagation?.();
                selectMedicineCode(m.medicineCodeId);
                setActiveTab('delete');
              }}
              className="flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  const deleteOverviewColumns = [
    {
      key: 'srNo',
      label: '#',
      render: (_, idx) => (
        <span className="text-muted font-mono text-xs font-semibold">
          {Number.isFinite(idx) ? idx + 1 : 1}
        </span>
      ),
    },
    {
      key: 'code',
      label: 'Medicine Code',
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
      render: m => (m.hasRecipe ? (
        <Badge variant="success">{m.recipeItemsCount} elements</Badge>
      ) : (
        <Badge variant="neutral">None</Badge>
      )),
    },
    {
      key: 'actions',
      label: 'Action',
      render: m => (
        m.hasRecipe ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => selectMedicineCode(m.medicineCodeId)}
            className="flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> Select to Delete
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              selectMedicineCode(m.medicineCodeId);
              setActiveTab('edit');
            }}
            className="flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Define Formula
          </Button>
        )
      ),
    },
  ];

  const printOverviewColumns = [
    {
      key: 'srNo',
      label: '#',
      render: (_, idx) => (
        <span className="text-muted font-mono text-xs font-semibold">
          {Number.isFinite(idx) ? idx + 1 : 1}
        </span>
      ),
    },
    {
      key: 'code',
      label: 'Medicine Code',
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
      render: m => <Badge variant="neutral">{m.recipeItemsCount} elements</Badge>,
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
    { key: 'herbName', label: 'Element' },
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
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-ink">Formula Management</h1>
            <Badge variant="default">{CATEGORY_NAMES[activeTab] || 'Formula'}</Badge>
          </div>
          <p className="text-muted mt-1 text-sm">
            {CATEGORY_DESCRIPTIONS[activeTab]}
          </p>
        </div>
      </div>

      {/* Category Lock Screen */}
      {!unlockedCategories[activeTab] ? (
        <Card className="max-w-md mx-auto my-12 border-line shadow-sm">
          <CardBody className="p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-forest-100/80 text-forest-800 flex items-center justify-center">
              <Lock className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-ink">
                {CATEGORY_NAMES[activeTab]}
              </h2>
              <p className="text-sm text-muted mt-1">
                This category is password protected. Enter password to unlock.
              </p>
            </div>

            {passwordError && (
              <Alert type="error">{passwordError}</Alert>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleUnlockCategory(activeTab);
              }}
              className="space-y-4 text-left pt-2"
            >
              <Input
                type="password"
                label="Category Password"
                placeholder="Enter password..."
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError('');
                }}
                showPasswordToggle={true}
                autoFocus
              />

              <Button
                type="submit"
                className="w-full justify-center"
                disabled={verifyingPassword || !passwordInput}
              >
                {verifyingPassword ? 'Verifying...' : `Unlock ${CATEGORY_NAMES[activeTab]}`}
              </Button>
            </form>

            <div className="pt-3 text-xs text-muted border-t border-line/60">
              Accepts Formula password, category password, or admin login password.
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Unlocked Category Status & Security Bar */}
          <div className="flex items-center justify-between text-xs text-muted mb-3 px-1">
            <div className="flex items-center gap-1.5 text-forest-700 font-medium">
              <Unlock className="w-3.5 h-3.5 text-forest-600" />
              <span>{CATEGORY_NAMES[activeTab]} (Unlocked)</span>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => openSetPasswordModal(activeTab)}
                  className="inline-flex items-center gap-1 text-muted hover:text-forest-700 transition-colors cursor-pointer"
                  title="Set or change password for this category"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Set / Change Password</span>
                </button>
              )}
              {isAdmin && <span className="text-line">|</span>}
              <button
                type="button"
                onClick={() => handleLockCategory(activeTab)}
                className="inline-flex items-center gap-1 text-muted hover:text-red-600 transition-colors cursor-pointer"
                title="Lock this category"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock Category</span>
              </button>
            </div>
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
                <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-xl bg-forest-50/70 border-2 border-forest-600/50 shadow-xs">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-2xl font-black text-forest-950 tracking-tight">{selectedMedicine?.code} — {selectedMedicine?.name}</h2>
                      {hasRecipe ? (
                        <Badge variant="success">Formula Configured</Badge>
                      ) : (
                        <Badge variant="warning">No Formula</Badge>
                      )}
                    </div>
                    <p className="text-base text-muted font-medium mt-1">
                      Base formula: <strong className="text-forest-900 font-bold underline decoration-2">{formulaQuantity} {formulaUnit}</strong>
                      {' · '}Firm: <strong className="text-forest-900 font-bold">{firmName || selectedMedicine?.firmName || 'Uttam Laboratories'}</strong>
                      {hasRecipe && ` · ${recipe.length} element${recipe.length === 1 ? '' : 's'} defined`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canWrite && (
                      <Button
                        size="md"
                        variant="primary"
                        onClick={() => setActiveTab('edit')}
                        className="flex items-center gap-1.5 shadow-xs"
                      >
                        <Edit3 className="w-4 h-4" /> {hasRecipe ? 'Edit Formula' : 'Add Formula'}
                      </Button>
                    )}
                    {canWrite && (
                      <Button
                        size="md"
                        variant="secondary"
                        onClick={() => {
                          setActiveTab('edit');
                          addItem();
                        }}
                        className="flex items-center gap-1.5 shadow-xs"
                      >
                        <Plus className="w-4 h-4" /> Add Element
                      </Button>
                    )}
                    {hasRecipe && isAdmin && (
                      <Button
                        size="md"
                        variant="danger"
                        onClick={() => setActiveTab('delete')}
                        className="flex items-center gap-1.5 shadow-xs"
                      >
                        <Trash2 className="w-4 h-4" /> Delete Formula
                      </Button>
                    )}
                  </div>
                </div>

                {description && (
                  <div className="p-4 rounded-xl bg-amber-50/60 border-2 border-amber-300/80 shadow-2xs">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900 block mb-1">
                      Formula Description &amp; Notes
                    </span>
                    <p className="text-base font-medium text-ink whitespace-pre-wrap">{description}</p>
                  </div>
                )}

                {hasRecipe && recipe.length > 0 ? (
                  <div className="space-y-3">
                    <Table columns={viewColumns} data={recipe} />

                    {canWrite && (
                      <div className="flex justify-end pt-1">
                        <Button
                          size="md"
                          variant="secondary"
                          onClick={() => {
                            setActiveTab('edit');
                            addItem();
                          }}
                          className="flex items-center gap-1.5 shadow-xs"
                        >
                          <Plus className="w-4 h-4" /> Add Element to Formula
                        </Button>
                      </div>
                    )}

                    {(() => {
                      const medQty = parseFloat(formulaQuantity) || 0;
                      const summed = sumHerbQuantityInUnit(recipe, herbs, formulaUnit);
                      const validCount = recipe.filter(r => r.herbId && parseFloat(r.quantity) > 0).length;
                      if (validCount === 0) return null;

                      if (summed.isSameFamily && summed.totalInMedicineUnit !== null) {
                        const herbTotal = summed.totalInMedicineUnit;
                        const matched = medQty > 0 && Math.abs(herbTotal - medQty) <= 1e-4;
                        const pct = medQty > 0 ? ((herbTotal / medQty) * 100).toFixed(1) : '100';
                        return (
                          <div className={`text-base font-bold rounded-xl border-2 px-5 py-3 shadow-xs transition-all ${
                            matched ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                              : 'border-forest-400 bg-forest-50/70 text-forest-950'
                          }`}>
                            <span className="text-forest-900">Base Medicine: <strong className="underline decoration-2">{formatQtyLabel(medQty, formulaUnit)}</strong></span>
                            {' · '}
                            <span className="text-forest-900">Raw Elements Total: <strong className="underline decoration-2">{formatQtyLabel(herbTotal, formulaUnit)}</strong></span>
                            {matched ? (
                              <span className="ml-2 inline-flex items-center gap-1 text-emerald-800 font-black">✓ 100% Balanced proportion</span>
                            ) : (
                              <span className="ml-2 inline-flex items-center gap-1 text-forest-800 font-medium">({pct}% of batch volume/weight)</span>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div className="text-base font-bold rounded-xl border-2 border-forest-400 bg-forest-50/70 text-forest-950 px-5 py-3 shadow-xs transition-all">
                          <span className="text-forest-900">Base Medicine: <strong className="underline decoration-2">{formatQtyLabel(medQty, formulaUnit)}</strong></span>
                          {' · '}
                          <span className="text-forest-900">Configured Elements: <strong className="underline decoration-2">{validCount} ingredient{validCount === 1 ? '' : 's'}</strong></span>
                          {summed.totalWeightKg !== null && (
                            <span className="ml-2 inline-flex items-center gap-1 text-forest-800 font-medium">({summed.totalWeightKg} KG total raw element weight)</span>
                          )}
                          {summed.totalVolumeLiters !== null && (
                            <span className="ml-2 inline-flex items-center gap-1 text-forest-800 font-medium">({summed.totalVolumeLiters} L liquid ingredients)</span>
                          )}
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
                        onClick={() => {
                          setActiveTab('edit');
                          if (recipe.length === 0) addItem();
                        }}
                        className="flex items-center gap-1.5"
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
                <Table
                  columns={overviewColumns}
                  data={filteredMedicines}
                  onRowClick={m => selectMedicineCode(m.medicineCodeId)}
                />
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
              <div className="p-3 rounded-lg bg-forest-50 border border-forest-200">
                <span className="text-sm font-medium text-forest-800">
                  {hasRecipe ? 'Editing Formula for:' : 'Configuring New Formula for:'}{' '}
                  <strong>{selectedMedicine?.code} — {selectedMedicine?.name}</strong>
                </span>
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
              <Input
                label="Firm Name"
                placeholder="e.g. Uttam Laboratories"
                value={firmName}
                onChange={e => setFirmName(e.target.value)}
                className="w-64"
                disabled={!canWrite}
              />
            </div>

            {medicineOptions.length === 0 && (
              <Alert type="info">No medicine codes found. Add codes under Medicine Codes first.</Alert>
            )}
            {herbOptions.length === 0 && (
              <Alert type="info">No element codes found. Add codes under Element Codes first.</Alert>
            )}
            {message && !selectedMedicineCodeId && <Alert type="error">{message}</Alert>}

            {selectedMedicineCodeId && (
              <>
                {message && <Alert type={message.includes('success') ? 'success' : 'error'}>{message}</Alert>}

                <div className="space-y-3">
                  {recipe.map((item, idx) => {
                    const herb = herbs.find(h => h.id === parseInt(item.herbId, 10));
                    const opt = herbOptions.find(o => String(o.herbCodeId) === String(item.herbCodeId));
                    const unitSource = herb || (opt ? { unitOfMeasure: opt.unit } : null);
                    const unitOptions = unitSource ? unitsForHerb(unitSource) : [];
                    return (
                      <div key={item._key || `recipe-item-${idx}`} className="flex gap-3 items-end p-3.5 rounded-xl bg-surface/80 border-2 border-line hover:border-forest-600/50 transition-all shadow-2xs">
                        <div className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-forest-700 text-white font-black text-xs shadow-xs mb-2">
                          {idx + 1}
                        </div>
                        <DropdownSelect
                          label={idx === 0 ? 'Element' : ''}
                          searchable
                          searchPlaceholder="Type element code or name..."
                          placeholder="Select element code"
                          className="flex-1"
                          value={item.herbCodeId ? String(item.herbCodeId) : ''}
                          onChange={val => selectHerbForRow(idx, val)}
                          options={[
                            { value: '', label: 'Select element code' },
                            ...herbOptions.map(h => ({
                              value: String(h.herbCodeId),
                              label: `${h.code} — ${h.name}${!h.herbId ? ' (Not in Store)' : ` (${h.unit}) — stock: ${h.stock}`}`,
                            })),
                          ]}
                        />
                        <Input
                          data-recipe-qty={idx}
                          label={idx === 0 ? 'Element Qty' : ''}
                          type="number"
                          min="0"
                          step="0.0001"
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          className="w-36"
                        />
                        <Select
                          label={idx === 0 ? 'Element Unit' : ''}
                          value={item.unit}
                          onChange={e => updateItem(idx, 'unit', e.target.value)}
                          className="w-40"
                          disabled={!unitSource}
                        >
                          {!unitSource && <option value="">Select element first</option>}
                          {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                        </Select>
                        {canWrite && <Button variant="danger" size="md" onClick={() => removeItem(idx)}>Remove</Button>}
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const medQty = parseFloat(formulaQuantity) || 0;
                  const summed = sumHerbQuantityInUnit(recipe, herbs, formulaUnit);
                  const validCount = recipe.filter(r => r.herbId && parseFloat(r.quantity) > 0).length;
                  if (validCount === 0) return null;

                  if (summed.isSameFamily && summed.totalInMedicineUnit !== null) {
                    const herbTotal = summed.totalInMedicineUnit;
                    const matched = medQty > 0 && Math.abs(herbTotal - medQty) <= 1e-4;
                    const pct = medQty > 0 ? ((herbTotal / medQty) * 100).toFixed(1) : '100';
                    return (
                      <div className={`text-base font-bold rounded-xl border-2 px-5 py-3.5 shadow-sm transition-all ${
                        matched ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/20'
                          : 'border-forest-400 bg-forest-50/70 text-forest-950 ring-2 ring-forest-500/20'
                      }`}
                      >
                        <span className="text-forest-900">Medicine Base: <strong className="underline decoration-2">{formatQtyLabel(medQty, formulaUnit)}</strong></span>
                        {' · '}
                        <span className="text-forest-900">Raw Elements Total: <strong className="underline decoration-2">{formatQtyLabel(herbTotal, formulaUnit)}</strong></span>
                        {matched ? (
                          <span className="ml-2 inline-flex items-center gap-1 text-emerald-800 font-black">✓ 100% Balanced proportion</span>
                        ) : (
                          <span className="ml-2 inline-flex items-center gap-1 text-forest-800 font-medium">({pct}% of batch volume/weight)</span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="text-base font-bold rounded-xl border-2 border-forest-400 bg-forest-50/70 text-forest-950 px-5 py-3.5 shadow-sm ring-2 ring-forest-500/20 transition-all">
                      <span className="text-forest-900">Medicine Base: <strong className="underline decoration-2">{formatQtyLabel(medQty, formulaUnit)}</strong></span>
                      {' · '}
                      <span className="text-forest-900">Configured Elements: <strong className="underline decoration-2">{validCount} ingredient{validCount === 1 ? '' : 's'}</strong></span>
                      {summed.totalWeightKg !== null && (
                        <span className="ml-2 inline-flex items-center gap-1 text-forest-800 font-medium">({summed.totalWeightKg} KG total raw element weight)</span>
                      )}
                      {summed.totalVolumeLiters !== null && (
                        <span className="ml-2 inline-flex items-center gap-1 text-forest-800 font-medium">({summed.totalVolumeLiters} L liquid ingredients)</span>
                      )}
                    </div>
                  );
                })()}
                {canWrite && (
                  <>
                    <Textarea
                      label="Description / Preparation Notes"
                      placeholder={selectedMedicineCodeId ? "Enter formula description, preparation instructions, or notes (optional)..." : "Select a medicine to enter description..."}
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      disabled={!canWrite || !selectedMedicineCodeId}
                      rows={2}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={addItem}>Add Element</Button>
                        <Button onClick={handleSave} disabled={saving || !selectedMedicineCodeId}>{saving ? 'Saving...' : 'Save Formula'}</Button>
                      </div>
                      {hasRecipe && isAdmin && (
                        <Button
                          variant="danger"
                          onClick={() => setActiveTab('delete')}
                          className="flex items-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" /> Delete Formula
                        </Button>
                      )}
                    </div>
                  </>
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
                  { value: '', label: 'Choose from medicine codes' },
                  ...medicineOptions.map(m => ({
                    value: String(m.medicineCodeId),
                    label: `${m.code} — ${m.name}${m.hasRecipe ? ` (${m.recipeItemsCount} elements configured)` : ' (No formula configured)'}`,
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
                          {r.herbName || 'Element'}: <strong>{r.quantity} {r.unit}</strong>
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
                        onClick={() => selectMedicineCode('')}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center rounded-xl bg-surface/30 border border-dashed border-line space-y-3">
                  <p className="text-muted text-sm">
                    No formula is currently defined for <strong>{selectedMedicine?.code} — {selectedMedicine?.name}</strong>. There are no formula ingredients to delete.
                  </p>
                  {canWrite && (
                    <Button
                      size="sm"
                      onClick={() => setActiveTab('edit')}
                      className="flex items-center gap-1.5 mx-auto"
                    >
                      <Plus className="w-4 h-4" /> Define Formula Now
                    </Button>
                  )}
                </div>
              )
            ) : (
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-ink">Formulas &amp; Medicine Codes Overview</h3>
                    <p className="text-xs text-muted">Select a configured formula to delete, or click any medicine to manage its formula.</p>
                  </div>
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
                {medicineOptions.length === 0 ? (
                  <p className="text-sm text-muted p-4 text-center rounded-lg bg-surface/30 border border-line">
                    No medicine codes are currently registered. Register medicine codes in Admin → Medicine Codes first.
                  </p>
                ) : (
                  <Table
                    columns={deleteOverviewColumns}
                    data={filteredMedicines}
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
                {generating ? 'Generating...' : 'Generate'}
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
                      Base formula: <strong className="text-ink">{baseFormulaQuantity} {baseFormulaUnit}</strong>. Element requirements scale dynamically to your entered batch quantity.
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
                        <Button
                          variant="secondary"
                          onClick={handlePreviewGenerated}
                          className="flex items-center gap-1.5 border-2 border-forest-600 text-forest-800 font-bold"
                        >
                          <Eye className="w-4 h-4 text-forest-600" /> Print Preview
                        </Button>
                        <Button variant="secondary" onClick={handlePrintGenerated}>
                          <Printer className="w-4 h-4" /> Print Formula
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="saffron"
                            onClick={handleConsume}
                            disabled={generating || saving}
                          >
                            Consume Elements
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
                  <div className="flex items-center gap-2">
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPrintModal(true)}
                      className="flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Printer className="w-4 h-4" /> Print Options
                    </Button>
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
        </>
      )}

      {/* Print Formulas Modal */}
      <Modal
        open={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="Print Formulas"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Choose whether to print the complete directory list of all medicine formulas or print the detailed recipe specification for an individual medicine.
          </p>

          {/* Option 1: Print All Formulas List */}
          <div className="p-4 rounded-xl border border-line bg-surface/40 hover:bg-surface/70 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="font-semibold text-ink text-sm flex items-center gap-2">
                  <Printer className="w-4 h-4 text-forest-700" /> Print All Formulas (List Directory)
                </h4>
                <p className="text-xs text-muted mt-1">
                  Prints a comprehensive directory table listing all {filteredMedicines.length} medicine codes, base quantities, and configuration status.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setShowPrintModal(false);
                    handlePreviewFormulaList();
                  }}
                  className="whitespace-nowrap flex items-center gap-1.5 border-2 border-forest-600 text-forest-800 font-bold"
                >
                  <Eye className="w-4 h-4 text-forest-600" /> Preview All
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setShowPrintModal(false);
                    handlePrintFormulaList();
                  }}
                  className="whitespace-nowrap shrink-0"
                >
                  Print All List
                </Button>
              </div>
            </div>
          </div>

          {/* Option 2: Print Specific Formula */}
          <div className="p-4 rounded-xl border border-line bg-surface/40 space-y-3">
            <div>
              <h4 className="font-semibold text-ink text-sm flex items-center gap-2">
                <Printer className="w-4 h-4 text-forest-700" /> Print Specific Formula
              </h4>
              <p className="text-xs text-muted mt-1">
                Select a specific medicine to print its complete recipe card with all ingredient quantities and units.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-1">
              <DropdownSelect
                label="Choose Medicine Formula"
                searchable
                searchPlaceholder="Search medicine code or name..."
                placeholder="Choose medicine formula..."
                value={printSpecificMedId}
                onChange={val => setPrintSpecificMedId(val)}
                className="min-w-[240px] flex-1"
                options={[
                  { value: '', label: 'Choose medicine formula to print' },
                  ...medicineOptions.filter(m => m.hasRecipe).map(m => ({
                    value: String(m.medicineCodeId),
                    label: `${m.code} — ${m.name} (${m.recipeItemsCount} elements)`,
                  })),
                ]}
              />
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!printSpecificMedId || printingFormula}
                  onClick={() => {
                    setShowPrintModal(false);
                    handlePreviewSpecificFormula(printSpecificMedId);
                  }}
                  className="whitespace-nowrap flex items-center gap-1.5 border-2 border-forest-600 text-forest-800 font-bold"
                >
                  <Eye className="w-4 h-4 text-forest-600" /> Preview Formula
                </Button>
                <Button
                  size="sm"
                  disabled={!printSpecificMedId || printingFormula}
                  onClick={() => {
                    setShowPrintModal(false);
                    handlePrintSpecificFormula(printSpecificMedId);
                  }}
                  className="whitespace-nowrap shrink-0"
                >
                  {printingFormula ? 'Loading...' : 'Print Formula'}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-line">
            <Button variant="secondary" onClick={() => setShowPrintModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Set Category Password Modal */}
      <Modal
        open={showSetPasswordModal}
        onClose={() => {
          setShowSetPasswordModal(false);
          setSetPasswordMessage('');
        }}
        title={`Set Password for ${CATEGORY_NAMES[targetCategoryForPassword] || 'Category'}`}
      >
        <form onSubmit={handleSaveCategoryPassword} className="space-y-4">
          <p className="text-xs text-muted">
            You can set a dedicated password for this category. Once set, users can enter this password (or the administrator password) to unlock <strong>{CATEGORY_NAMES[targetCategoryForPassword]}</strong>.
          </p>

          {setPasswordMessage && (
            <Alert type={setPasswordMessage.includes('success') ? 'success' : 'error'}>
              {setPasswordMessage}
            </Alert>
          )}

          <Input
            type="password"
            label="Current Category or Admin Password"
            value={setPasswordForm.currentPassword}
            onChange={e => setSetPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
            showPasswordToggle={true}
            placeholder="Enter current password..."
            required
          />

          <Input
            type="password"
            label="New Category Password (min 4 characters)"
            value={setPasswordForm.newPassword}
            onChange={e => setSetPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
            showPasswordToggle={true}
            placeholder="Enter new password..."
            required
          />

          <Input
            type="password"
            label="Confirm New Password"
            value={setPasswordForm.confirmPassword}
            onChange={e => setSetPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
            showPasswordToggle={true}
            placeholder="Re-enter new password..."
            required
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button
              variant="secondary"
              onClick={() => {
                setShowSetPasswordModal(false);
                setSetPasswordMessage('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={setPasswordLoading || !setPasswordForm.newPassword}
            >
              {setPasswordLoading ? 'Saving...' : 'Save Password'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Formula Confirmation Modal */}
      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Formula Confirmation"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink">
            Are you sure you want to delete the formula for{' '}
            <strong>
              {medicineOptions.find(m => String(m.medicineCodeId) === String(selectedMedicineCodeId))?.code || 'this medicine'}
            </strong>?
          </p>
          <p className="text-xs text-muted">
            This will remove all element ingredients configured in the formula. The medicine code itself will not be deleted.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={executeDeleteFormula} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete Formula'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Consume Elements Confirmation Modal */}
      <Modal
        open={consumeConfirmOpen}
        onClose={() => setConsumeConfirmOpen(false)}
        title="Confirm Consume Elements"
        size="md"
      >
        <div className="space-y-4">
          {generated?.sufficient === false || generated?.items?.some(it => it.sufficient === false) ? (
            <Alert type="error">
              Some elements have insufficient stock. Consuming will reduce their available inventory into negative numbers.
            </Alert>
          ) : (
            <p className="text-sm text-ink">
              This will deduct the required element quantities directly from current stock.
            </p>
          )}
          <p className="text-xs text-muted">
            Are you sure you want to proceed with consuming these elements?
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button variant="secondary" onClick={() => setConsumeConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={executeConsume} disabled={generating}>
              {generating ? 'Processing...' : 'Confirm Consume'}
            </Button>
          </div>
        </div>
      </Modal>

      <PrintPreviewModal
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title={previewTitle}
        subtitle={previewSubtitle}
        html={previewHtml}
      />
    </Layout>
  );
}
