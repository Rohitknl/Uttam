import { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Pencil, Printer } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Modal, Input, Select, DropdownSelect, Table, SearchBar, PageHeader, LoadingSpinner, Alert, Textarea } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { billsApi, herbCodesApi, inventoryApi } from '../../api';

const UNITS = ['KG', 'GRAMS', 'LITERS', 'ML', 'PIECES'];

const emptyForm = () => ({
  billNumber: '',
  supplierName: '',
  supplierContact: '',
  supplierEmail: '',
  supplierAddress: '',
  consigneeName: '',
  consigneeAddress: '',
  billDate: new Date().toISOString().slice(0, 10),
  applyGst: false,
  gstPercent: '',
  applyIgst: false,
  igstPercent: '',
  notes: '',
  lines: [],
});

function isDecimalInput(value) {
  return value === '' || /^\d*\.?\d*$/.test(value);
}

function parsePositiveNumber(value) {
  const n = parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) ? n : NaN;
}

function buildPartyDirectory(bills) {
  const suppliers = new Map();
  const consignees = new Map();
  for (const b of bills || []) {
    const sKey = String(b.supplierName || '').trim().toLowerCase();
    if (sKey && !suppliers.has(sKey)) {
      suppliers.set(sKey, {
        name: String(b.supplierName).trim(),
        supplierContact: b.supplierContact || '',
        supplierEmail: b.supplierEmail || '',
        supplierAddress: b.supplierAddress || '',
      });
    }
    const cKey = String(b.consigneeName || '').trim().toLowerCase();
    if (cKey && !consignees.has(cKey)) {
      consignees.set(cKey, {
        name: String(b.consigneeName).trim(),
        consigneeAddress: b.consigneeAddress || '',
      });
    }
  }
  return {
    suppliers: [...suppliers.values()].sort((a, b) => a.name.localeCompare(b.name)),
    consignees: [...consignees.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function calcTotals(lines, applyGst, gstPercent, applyIgst, igstPercent) {
  const subtotal = lines.reduce((sum, line) => sum + (line.amount ?? line.quantity * line.rate), 0);
  const gstPct = applyGst ? (parseFloat(gstPercent) || 0) : 0;
  const igstPct = applyIgst ? (parseFloat(igstPercent) || 0) : 0;
  const gstAmount = gstPct > 0 ? subtotal * (gstPct / 100) : 0;
  const igstAmount = igstPct > 0 ? subtotal * (igstPct / 100) : 0;
  const taxAmount = gstAmount + igstAmount;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    gstAmount: Math.round(gstAmount * 100) / 100,
    igstAmount: Math.round(igstAmount * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round((subtotal + taxAmount) * 100) / 100,
  };
}

function taxLabelFromBill(bill) {
  if (!bill?.taxType || bill.taxType === 'NONE') return '—';
  if (bill.taxType === 'BOTH') {
    return `GST ${bill.taxPercent || 0}% + IGST ${bill.igstPercent || 0}%`;
  }
  if (bill.taxType === 'GST') return `GST ${bill.taxPercent || 0}%`;
  if (bill.taxType === 'IGST') return `IGST ${bill.igstPercent || bill.taxPercent || 0}%`;
  return bill.taxType;
}

function billToForm(bill) {
  const taxType = bill.taxType || 'NONE';
  const applyGst = taxType === 'GST' || taxType === 'BOTH';
  const applyIgst = taxType === 'IGST' || taxType === 'BOTH';
  const gstPercent = applyGst ? String(bill.taxPercent ?? '') : '';
  const igstPercent = applyIgst
    ? String((bill.igstPercent > 0 ? bill.igstPercent : (taxType === 'IGST' ? bill.taxPercent : '')) ?? '')
    : '';
  return {
    billNumber: bill.billNumber,
    supplierName: bill.supplierName,
    supplierContact: bill.supplierContact || '',
    supplierEmail: bill.supplierEmail || '',
    supplierAddress: bill.supplierAddress || '',
    consigneeName: bill.consigneeName || '',
    consigneeAddress: bill.consigneeAddress || '',
    billDate: bill.billDate.slice(0, 10),
    applyGst,
    gstPercent,
    applyIgst,
    igstPercent,
    notes: bill.notes || '',
    lines: bill.lines.map(l => ({
      ...l,
      quantity: l.quantity == null ? '' : String(l.quantity),
      rate: l.rate == null ? '' : String(l.rate),
    })),
  };
}

export default function BillsPage() {
  const { canWrite } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'history' ? 'history' : 'bills';
  const [bills, setBills] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [availableCodes, setAvailableCodes] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [lineForm, setLineForm] = useState({ herbCodeId: '', herbCode: '', herbName: '', quantity: '', rate: '', unit: 'KG' });
  const qtyRef = useRef(null);
  const rateRef = useRef(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [queryResult, setQueryResult] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const [partyDirectory, setPartyDirectory] = useState({ suppliers: [], consignees: [] });

  const setActiveTab = (tab) => {
    if (tab === 'bills') setSearchParams({});
    else setSearchParams({ tab: 'history' });
  };

  const isEditing = typeof modal === 'number';

  const herbCodeOptions = useMemo(
    () => availableCodes
      .slice()
      .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }))
      .map(c => ({ value: String(c.id), label: `${c.code} — ${c.name}` })),
    [availableCodes],
  );

  const totals = useMemo(
    () => calcTotals(form.lines, form.applyGst, form.gstPercent, form.applyIgst, form.igstPercent),
    [form.lines, form.applyGst, form.gstPercent, form.applyIgst, form.igstPercent],
  );

  const loadPartyDirectory = async () => {
    try {
      const all = await billsApi.getAll();
      setPartyDirectory(buildPartyDirectory(all));
    } catch {
      setPartyDirectory(buildPartyDirectory(bills));
    }
  };

  const applySupplierName = (name) => {
    const key = String(name || '').trim().toLowerCase();
    const match = partyDirectory.suppliers.find(s => s.name.toLowerCase() === key);
    setForm(prev => ({
      ...prev,
      supplierName: name,
      ...(match
        ? {
          supplierContact: match.supplierContact,
          supplierEmail: match.supplierEmail,
          supplierAddress: match.supplierAddress,
        }
        : {}),
    }));
  };

  const applyConsigneeName = (name) => {
    const key = String(name || '').trim().toLowerCase();
    const match = partyDirectory.consignees.find(c => c.name.toLowerCase() === key);
    setForm(prev => ({
      ...prev,
      consigneeName: name,
      ...(match ? { consigneeAddress: match.consigneeAddress } : {}),
    }));
  };

  const load = () => {
    setLoading(true);
    billsApi.getAll(search || undefined).then(setBills).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  const handleQuery = async () => {
    setQueryLoading(true);
    try {
      const data = await inventoryApi.query({ supplierSearch, fromDate, toDate });
      setQueryResult(data);
    } finally {
      setQueryLoading(false);
    }
  };

  const historyColumns = [
    { key: 'herbName', label: 'Herb' },
    { key: 'herbCode', label: 'Code', render: r => r.herbCode || '—' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'rate', label: 'Rate', render: r => `₹${r.rate}` },
    { key: 'amount', label: 'Amount', render: r => `₹${r.amount.toLocaleString()}` },
    { key: 'supplierName', label: 'Supplier', render: r => r.supplierName || '—' },
    { key: 'purchaseDate', label: 'Date', render: r => new Date(r.purchaseDate).toLocaleDateString() },
  ];

  const resetLineInputs = () => {
    setLineForm({ herbCodeId: '', herbCode: '', herbName: '', quantity: '', rate: '', unit: 'KG' });
    if (qtyRef.current) qtyRef.current.value = '';
    if (rateRef.current) rateRef.current.value = '';
  };

  const loadAvailableCodes = async (billLines = []) => {
    const codes = await herbCodesApi.getAvailable();
    const merged = [...codes];
    billLines.forEach(line => {
      if (line.herbCodeId && !merged.find(c => c.id === line.herbCodeId)) {
        merged.push({ id: line.herbCodeId, code: line.herbCode, name: line.herbName });
      }
    });
    setAvailableCodes(merged);
  };

  const openCreate = async () => {
    await Promise.all([loadAvailableCodes(), loadPartyDirectory()]);
    setForm(emptyForm());
    resetLineInputs();
    setModal('create');
    setError('');
  };

  const openEdit = async (billRow) => {
    try {
      const bill = await billsApi.getById(billRow.id);
      await Promise.all([loadAvailableCodes(bill.lines), loadPartyDirectory()]);
      setForm(billToForm(bill));
      resetLineInputs();
      setModal(bill.id);
      setError('');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to load bill');
    }
  };

  const closeModal = () => {
    setModal(null);
    setError('');
    setMissingFields([]);
  };

  const getMissingBillFields = () => {
    const missing = [];
    if (!form.supplierName.trim()) missing.push('Supplier Name');
    if (form.supplierEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.supplierEmail.trim())) {
      missing.push('Supplier Email (valid address)');
    }
    if (!form.supplierAddress.trim()) missing.push('Supplier Address');
    if (!form.billNumber.trim()) missing.push('Invoice Number');
    if (!form.billDate) missing.push('Invoice Date');
    if (!form.consigneeName.trim()) missing.push('Consignee Name');
    if (!form.consigneeAddress.trim()) missing.push('Consignee Address');
    if (!form.lines.length) missing.push('At least one line item');
    if (form.applyGst && !(parseFloat(form.gstPercent) > 0)) missing.push('GST Percentage');
    if (form.applyIgst && !(parseFloat(form.igstPercent) > 0)) missing.push('IGST Percentage');
    form.lines.forEach((line, i) => {
      const n = i + 1;
      if (!String(line.herbName || '').trim()) missing.push(`Line ${n}: Goods Name`);
      if (!(parseFloat(line.quantity) > 0)) missing.push(`Line ${n}: Quantity`);
      if (line.rate === '' || line.rate == null || Number.isNaN(parseFloat(line.rate))) missing.push(`Line ${n}: Per Rate`);
    });
    return missing;
  };

  const selectHerbCodeId = (id) => {
    const code = availableCodes.find(c => String(c.id) === String(id));
    if (!code) {
      setLineForm(prev => ({ ...prev, herbCodeId: '', herbCode: '', herbName: '' }));
      return;
    }
    setLineForm(prev => ({
      ...prev,
      herbCodeId: String(code.id),
      herbCode: code.code,
      herbName: code.name,
    }));
  };

  const addLine = () => {
    const quantityRaw = String(qtyRef.current?.value ?? lineForm.quantity).trim();
    const rateRaw = String(rateRef.current?.value ?? lineForm.rate).trim();
    const quantity = parsePositiveNumber(quantityRaw);
    const rate = parsePositiveNumber(rateRaw);

    const lineMissing = [];
    if (!lineForm.herbCodeId) lineMissing.push('Herb Code');
    if (!String(lineForm.herbName || '').trim()) lineMissing.push('Goods Name');
    if (!(quantity > 0)) lineMissing.push('Quantity');
    if (rateRaw === '' || Number.isNaN(rate)) lineMissing.push('Per Rate');
    if (lineMissing.length) {
      setMissingFields(lineMissing);
      return;
    }
    const code = availableCodes.find(c => c.id === parseInt(lineForm.herbCodeId, 10));
    if (!code) {
      setMissingFields(['Herb Code']);
      return;
    }
    const line = {
      herbCodeId: code.id,
      herbCode: code.code,
      herbName: lineForm.herbName || code.name,
      quantity,
      rate,
      unit: lineForm.unit,
      amount: Math.round(quantity * rate * 100) / 100,
    };
    setForm(prev => ({ ...prev, lines: [...prev.lines, line] }));
    setAvailableCodes(prev => prev.filter(c => c.id !== code.id));
    resetLineInputs();
    setMissingFields([]);
  };

  const removeLine = (idx) => {
    const removed = form.lines[idx];
    if (removed.herbCodeId && !availableCodes.find(c => c.id === removed.herbCodeId)) {
      setAvailableCodes(prev => [...prev, { id: removed.herbCodeId, code: removed.herbCode, name: removed.herbName }]);
    }
    setForm(prev => ({ ...prev, lines: prev.lines.filter((_, i) => i !== idx) }));
  };

  const updateLineField = (idx, field, value) => {
    setForm(prev => {
      const lines = [...prev.lines];
      const line = { ...lines[idx], [field]: value };
      if (field === 'quantity' || field === 'rate') {
        const qty = parsePositiveNumber(field === 'quantity' ? value : line.quantity);
        const rate = parsePositiveNumber(field === 'rate' ? value : line.rate);
        const q = Number.isFinite(qty) ? qty : 0;
        const r = Number.isFinite(rate) ? rate : 0;
        line.amount = Math.round(q * r * 100) / 100;
      }
      lines[idx] = line;
      return { ...prev, lines };
    });
  };

  const handleSave = async () => {
    const missing = getMissingBillFields();
    if (missing.length) {
      setMissingFields(missing);
      return;
    }
    try {
      const payload = {
        ...form,
        supplierEmail: form.supplierEmail || null,
        applyGst: form.applyGst,
        applyIgst: form.applyIgst,
        gstPercent: form.applyGst ? (parseFloat(form.gstPercent) || 0) : 0,
        igstPercent: form.applyIgst ? (parseFloat(form.igstPercent) || 0) : 0,
        taxPercent: form.applyGst ? (parseFloat(form.gstPercent) || 0) : 0,
        taxType: form.applyGst && form.applyIgst
          ? 'BOTH'
          : form.applyGst
            ? 'GST'
            : form.applyIgst
              ? 'IGST'
              : 'NONE',
        lines: form.lines.map(({ id, herbCodeId, herbCode, herbName, quantity, rate, unit, amount }) => ({
          ...(id ? { id } : {}),
          herbCodeId,
          herbCode,
          herbName,
          quantity: parseFloat(quantity),
          rate: parseFloat(rate),
          unit,
          amount: amount ?? Math.round(parseFloat(quantity) * parseFloat(rate) * 100) / 100,
        })),
      };

      if (isEditing) {
        await billsApi.update(modal, payload);
      } else {
        await billsApi.create(payload);
      }

      closeModal();
      load();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${isEditing ? 'update' : 'create'} bill`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await billsApi.delete(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete bill');
    }
  };

  const handlePrintHistory = () => {
    if (!queryResult) return;
    const invoices = queryResult.invoices?.length
      ? queryResult.invoices
      : null;

    const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const dateLabel = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');
    const esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const invoiceHtml = (inv) => {
      const taxRows = [];
      if (inv.taxType === 'GST' || inv.taxType === 'BOTH') {
        taxRows.push(`<tr><td>GST (${esc(inv.taxPercent)}%)</td><td class="r">${money(inv.gstAmount ?? (inv.taxType === 'GST' ? inv.taxAmount : 0))}</td></tr>`);
      }
      if (inv.taxType === 'IGST' || inv.taxType === 'BOTH') {
        const igstPct = inv.igstPercent || (inv.taxType === 'IGST' ? inv.taxPercent : 0);
        taxRows.push(`<tr><td>IGST (${esc(igstPct)}%)</td><td class="r">${money(inv.igstAmount ?? (inv.taxType === 'IGST' ? inv.taxAmount : 0))}</td></tr>`);
      }
      const lineRows = (inv.lines || []).map((l, i) => `
        <tr>
          <td class="c">${i + 1}</td>
          <td>${esc(l.herbCode || '—')}</td>
          <td>${esc(l.herbName || '')}</td>
          <td class="c">${esc(l.unit || 'KG')}</td>
          <td class="r">${esc(l.quantity)}</td>
          <td class="r">${money(l.rate)}</td>
          <td class="r">${money(l.amount)}</td>
        </tr>
      `).join('');

      return `
      <section class="invoice">
        <header class="top">
          <div>
            <div class="brand">Uttam Laboratories</div>
            <div class="sub">Ayurvedic Stock &amp; Inventory</div>
          </div>
          <div class="title-block">
            <div class="doc-title">TAX INVOICE</div>
            <div class="meta"><span>Invoice No.</span><strong>${esc(inv.billNumber)}</strong></div>
            <div class="meta"><span>Invoice Date</span><strong>${dateLabel(inv.billDate)}</strong></div>
          </div>
        </header>

        <div class="parties">
          <div class="box">
            <div class="box-label">Supplier</div>
            <div class="name">${esc(inv.supplierName || '—')}</div>
            ${inv.supplierContact ? `<div>${esc(inv.supplierContact)}</div>` : ''}
            ${inv.supplierEmail ? `<div>${esc(inv.supplierEmail)}</div>` : ''}
            ${inv.supplierAddress ? `<div class="addr">${esc(inv.supplierAddress)}</div>` : ''}
          </div>
          <div class="box">
            <div class="box-label">Consignee</div>
            <div class="name">${esc(inv.consigneeName || 'Uttam Laboratories')}</div>
            ${inv.consigneeAddress ? `<div class="addr">${esc(inv.consigneeAddress)}</div>` : ''}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="c" style="width:40px">#</th>
              <th>Herb Code</th>
              <th>Goods Name</th>
              <th class="c">Per</th>
              <th class="r">Quantity</th>
              <th class="r">Rate</th>
              <th class="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineRows || '<tr><td colspan="7" class="c">No line items</td></tr>'}
          </tbody>
        </table>

        <div class="totals-wrap">
          <div class="notes">
            ${inv.notes ? `<div class="box-label">Notes</div><div>${esc(inv.notes)}</div>` : ''}
          </div>
          <table class="totals">
            <tr><td>Subtotal</td><td class="r">${money(inv.subtotalAmount)}</td></tr>
            ${taxRows.join('')}
            <tr class="grand"><td>Grand Total</td><td class="r">${money(inv.totalAmount)}</td></tr>
          </table>
        </div>

        <footer class="foot">
          <div>This is a computer-generated purchase invoice.</div>
          <div>Uttam Laboratories</div>
        </footer>
      </section>`;
    };

    let bodyContent;
    if (invoices) {
      bodyContent = invoices.map(invoiceHtml).join('');
    } else {
      // Fallback if older API response without invoices
      const fromLabel = fromDate || 'Any';
      const toLabel = toDate || 'Any';
      const supplierLabel = supplierSearch.trim() || 'All suppliers';
      bodyContent = `
        <section class="invoice">
          <header class="top">
            <div>
              <div class="brand">Uttam Laboratories</div>
              <div class="sub">Ayurvedic Stock &amp; Inventory</div>
            </div>
            <div class="title-block">
              <div class="doc-title">PURCHASE STATEMENT</div>
              <div class="meta"><span>Supplier</span><strong>${esc(supplierLabel)}</strong></div>
              <div class="meta"><span>Period</span><strong>${esc(fromLabel)} — ${esc(toLabel)}</strong></div>
            </div>
          </header>
          <table>
            <thead>
              <tr>
                <th>#</th><th>Herb</th><th>Code</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th><th>Supplier</th><th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${queryResult.lines.map((r, i) => `
                <tr>
                  <td class="c">${i + 1}</td>
                  <td>${esc(r.herbName)}</td>
                  <td>${esc(r.herbCode || '—')}</td>
                  <td class="r">${esc(r.quantity)}</td>
                  <td class="r">${money(r.rate)}</td>
                  <td class="r">${money(r.amount)}</td>
                  <td>${esc(r.supplierName || '—')}</td>
                  <td>${dateLabel(r.purchaseDate)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          <div class="totals-wrap">
            <div></div>
            <table class="totals">
              <tr class="grand"><td>Grand Total</td><td class="r">${money(queryResult.totalAmount)}</td></tr>
            </table>
          </div>
        </section>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Purchase Invoices — Uttam Laboratories</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: "Segoe UI", Arial, sans-serif;
      color: #1c241e;
      background: #fff;
      font-size: 12px;
    }
    .invoice {
      max-width: 900px;
      margin: 0 auto 24px;
      border: 1px solid #c5d0c8;
      padding: 24px;
      page-break-after: always;
    }
    .invoice:last-child { page-break-after: auto; }
    .top {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 2px solid #2d5a3d;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .brand { font-size: 22px; font-weight: 700; color: #2d5a3d; }
    .sub { color: #5c6b60; margin-top: 2px; }
    .doc-title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-align: right;
      margin-bottom: 8px;
    }
    .meta {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      font-size: 12px;
      margin-top: 2px;
    }
    .meta span { color: #5c6b60; min-width: 90px; text-align: right; }
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .box {
      border: 1px solid #d5e0d8;
      border-radius: 6px;
      padding: 10px 12px;
      min-height: 88px;
    }
    .box-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #5c6b60;
      margin-bottom: 4px;
      font-weight: 600;
    }
    .name { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
    .addr { white-space: pre-wrap; color: #334038; margin-top: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    th, td {
      border: 1px solid #d5e0d8;
      padding: 7px 8px;
      vertical-align: top;
    }
    th {
      background: #e8f2eb;
      color: #2d5a3d;
      font-weight: 600;
      text-align: left;
    }
    .c { text-align: center; }
    .r { text-align: right; }
    .totals-wrap {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
    }
    .notes { flex: 1; font-size: 11px; color: #445248; }
    .totals { width: 260px; margin: 0; }
    .totals td { border: 1px solid #d5e0d8; }
    .totals .grand td {
      background: #e8f2eb;
      font-weight: 700;
      font-size: 13px;
    }
    .foot {
      display: flex;
      justify-content: space-between;
      margin-top: 28px;
      padding-top: 10px;
      border-top: 1px dashed #c5d0c8;
      color: #5c6b60;
      font-size: 11px;
    }
    @media print {
      body { padding: 0; }
      .invoice {
        border: none;
        padding: 0;
        margin: 0;
        max-width: none;
      }
    }
  </style>
</head>
<body>
  ${bodyContent}
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  };

  const columns = [
    { key: 'billNumber', label: 'Invoice #' },
    { key: 'supplierName', label: 'Supplier' },
    { key: 'consigneeName', label: 'Consignee', render: r => r.consigneeName || '—' },
    { key: 'billDate', label: 'Invoice Date', render: r => new Date(r.billDate).toLocaleDateString() },
    { key: 'subtotalAmount', label: 'Subtotal', render: r => `₹${(r.subtotalAmount ?? r.totalAmount).toLocaleString()}` },
    { key: 'taxAmount', label: 'Tax', render: r => r.taxAmount > 0 ? `₹${r.taxAmount.toLocaleString()} (${taxLabelFromBill(r)})` : '—' },
    { key: 'totalAmount', label: 'Total', render: r => `₹${r.totalAmount.toLocaleString()}` },
    { key: 'lines', label: 'Items', render: r => r.lines?.length || 0 },
    ...(canWrite ? [{
      key: 'actions',
      label: '',
      render: r => (
        <div className="flex gap-2">
          <button onClick={() => openEdit(r)} className="text-forest-700 hover:text-forest-950" title="Edit bill">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => { setDeleteTarget(r); setError(''); }} className="text-red-500 hover:text-red-700" title="Delete bill">
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
            title="Supplier Bills"
            subtitle="Record invoices and search purchase history"
            action={canWrite && activeTab === 'bills' && <Button onClick={openCreate}><Plus className="w-4 h-4" /> New Bill</Button>}
          />
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setActiveTab('bills')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'bills' ? 'bg-forest-700 text-white' : 'bg-surface text-muted hover:text-ink'
              }`}
            >
              Bills
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'history' ? 'bg-forest-700 text-white' : 'bg-surface text-muted hover:text-ink'
              }`}
            >
              Purchase History
            </button>
          </div>
        </div>

        {activeTab === 'bills' ? (
          <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <CardBody className="flex-1 min-h-0 flex flex-col overflow-hidden !py-4">
              <div className="mb-3 max-w-sm shrink-0"><SearchBar value={search} onChange={setSearch} placeholder="Search bills..." /></div>
              <div className="flex-1 min-h-0 overflow-auto overscroll-contain panel-scroll border border-line rounded-lg">
                {loading ? <LoadingSpinner /> : <Table columns={columns} data={bills} />}
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden gap-4">
            <Card className="shrink-0">
              <CardBody className="!py-3">
                <div className="grid grid-cols-4 gap-3 items-end">
                  <Input label="Supplier Search" value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} />
                  <Input label="From Date" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                  <Input label="To Date" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                  <Button onClick={handleQuery}>Search</Button>
                </div>
              </CardBody>
            </Card>

            {queryLoading ? <LoadingSpinner /> : queryResult && (
              <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <CardBody className="flex-1 min-h-0 flex flex-col overflow-hidden !py-4">
                  <div className="flex justify-between items-center mb-3 shrink-0">
                    <p className="text-sm text-muted">{queryResult.lines.length} purchase records</p>
                    <div className="flex items-center gap-3">
                      <p className="text-lg font-semibold">Total: ₹{queryResult.totalAmount.toLocaleString()}</p>
                      <Button variant="secondary" onClick={handlePrintHistory} disabled={!queryResult.lines.length}>
                        <Printer className="w-4 h-4" /> Print
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto overscroll-contain panel-scroll border border-line rounded-lg">
                    <Table columns={historyColumns} data={queryResult.lines} />
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        )}
      </div>

      <Modal
        open={!!modal}
        onClose={closeModal}
        title={isEditing ? 'Edit Supplier Bill' : 'New Supplier Bill'}
        size="full"
        scrollable
        footer={(
          <div className="w-full flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
              <div className="flex flex-col gap-2 pb-1">
                <span className="text-sm font-medium text-ink">Apply Tax</span>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.applyGst}
                      onChange={e => setForm({
                        ...form,
                        applyGst: e.target.checked,
                        gstPercent: e.target.checked ? form.gstPercent : '',
                      })}
                    />
                    GST
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.applyIgst}
                      onChange={e => setForm({
                        ...form,
                        applyIgst: e.target.checked,
                        igstPercent: e.target.checked ? form.igstPercent : '',
                      })}
                    />
                    IGST
                  </label>
                </div>
              </div>
              {form.applyGst && (
                <div className="w-28">
                  <Input
                    label="GST %"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.gstPercent}
                    onChange={e => setForm({ ...form, gstPercent: e.target.value })}
                  />
                </div>
              )}
              {form.applyIgst && (
                <div className="w-28">
                  <Input
                    label="IGST %"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.igstPercent}
                    onChange={e => setForm({ ...form, igstPercent: e.target.value })}
                  />
                </div>
              )}
              <div className="text-sm space-y-0.5 pb-1">
                <div className="flex gap-4 justify-between min-w-[160px]"><span className="text-muted">Subtotal</span><span>₹{totals.subtotal.toLocaleString()}</span></div>
                {form.applyGst && (
                  <div className="flex gap-4 justify-between"><span className="text-muted">GST ({form.gstPercent || 0}%)</span><span>₹{totals.gstAmount.toLocaleString()}</span></div>
                )}
                {form.applyIgst && (
                  <div className="flex gap-4 justify-between"><span className="text-muted">IGST ({form.igstPercent || 0}%)</span><span>₹{totals.igstAmount.toLocaleString()}</span></div>
                )}
                <div className="flex gap-4 justify-between font-semibold"><span>Grand Total</span><span>₹{totals.total.toLocaleString()}</span></div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" onClick={closeModal}>Cancel</Button>
              <Button onClick={handleSave}>
                {isEditing ? 'Update Bill' : 'Create Bill'}
              </Button>
            </div>
          </div>
        )}
      >
        {error && <Alert type="error" className="mb-3">{error}</Alert>}
        <div className="space-y-4">
          <section>
            <h4 className="text-sm font-semibold text-forest-700 mb-2 uppercase tracking-wide">Supplier Details</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  label="Supplier Name"
                  list="bill-supplier-names"
                  value={form.supplierName}
                  onChange={e => applySupplierName(e.target.value)}
                  onBlur={e => applySupplierName(e.target.value)}
                  autoComplete="off"
                />
                <datalist id="bill-supplier-names">
                  {partyDirectory.suppliers.map(s => (
                    <option key={s.name} value={s.name} />
                  ))}
                </datalist>
              </div>
              <Input label="Supplier Telephone (optional)" value={form.supplierContact} onChange={e => setForm({ ...form, supplierContact: e.target.value })} />
              <Input label="Supplier Email (optional)" type="email" value={form.supplierEmail} onChange={e => setForm({ ...form, supplierEmail: e.target.value })} />
              <div className="col-span-2">
                <Textarea rows={2} label="Supplier Address" value={form.supplierAddress} onChange={e => setForm({ ...form, supplierAddress: e.target.value })} />
              </div>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-forest-700 mb-2 uppercase tracking-wide">Invoice Details</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Invoice Number" value={form.billNumber} onChange={e => setForm({ ...form, billNumber: e.target.value })} />
              <Input label="Invoice Date" type="date" value={form.billDate} onChange={e => setForm({ ...form, billDate: e.target.value })} />
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-forest-700 mb-2 uppercase tracking-wide">Consignee Details</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  label="Consignee Name"
                  list="bill-consignee-names"
                  value={form.consigneeName}
                  onChange={e => applyConsigneeName(e.target.value)}
                  onBlur={e => applyConsigneeName(e.target.value)}
                  autoComplete="off"
                />
                <datalist id="bill-consignee-names">
                  {partyDirectory.consignees.map(c => (
                    <option key={c.name} value={c.name} />
                  ))}
                </datalist>
              </div>
              <div className="col-span-2">
                <Textarea rows={2} label="Consignee Address" value={form.consigneeAddress} onChange={e => setForm({ ...form, consigneeAddress: e.target.value })} />
              </div>
            </div>
          </section>

          <section className="border border-line rounded-lg p-3">
            <h4 className="text-sm font-semibold text-forest-700 mb-2 uppercase tracking-wide">Line Items</h4>
            <div className="grid grid-cols-6 gap-2 mb-3">
              <DropdownSelect
                className="col-span-2"
                label="Herb Code"
                searchable
                searchPlaceholder="Type code or name..."
                placeholder="Select herb code"
                value={lineForm.herbCodeId}
                onChange={selectHerbCodeId}
                options={herbCodeOptions}
              />
              <Input label="Goods Name" value={lineForm.herbName} readOnly placeholder="Select herb code" className="bg-surface/50" />
              <Select label="Per" value={lineForm.unit} onChange={e => setLineForm(prev => ({ ...prev, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Quantity</label>
                <input
                  ref={qtyRef}
                  type="text"
                  inputMode="decimal"
                  value={lineForm.quantity}
                  onChange={e => {
                    const v = e.target.value;
                    if (isDecimalInput(v)) setLineForm(prev => ({ ...prev, quantity: v }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700"
                />
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-ink mb-1">Per Rate</label>
                  <input
                    ref={rateRef}
                    type="text"
                    inputMode="decimal"
                    value={lineForm.rate}
                    onChange={e => {
                      const v = e.target.value;
                      if (isDecimalInput(v)) setLineForm(prev => ({ ...prev, rate: v }));
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-line bg-white text-ink focus:outline-none focus:ring-2 focus:ring-forest-700/30 focus:border-forest-700"
                  />
                </div>
                <Button type="button" onClick={addLine} size="sm" className="shrink-0 mb-0.5">Add</Button>
              </div>
            </div>

            {form.lines.length > 0 ? (
              <div className="border border-line rounded-lg overflow-x-auto panel-scroll">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface/50">
                      <th className="px-3 py-2 text-left font-medium text-muted">Herb Code</th>
                      <th className="px-3 py-2 text-left font-medium text-muted">Goods Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted">Per</th>
                      <th className="px-3 py-2 text-right font-medium text-muted">Quantity</th>
                      <th className="px-3 py-2 text-right font-medium text-muted">Per Rate</th>
                      <th className="px-3 py-2 text-right font-medium text-muted">Amount</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lines.map((l, i) => (
                      <tr key={l.id || `new-${i}`} className="border-b border-line/50">
                        <td className="px-3 py-2">{l.herbCode}</td>
                        <td className="px-3 py-2">
                          <input
                            value={l.herbName}
                            onChange={e => updateLineField(i, 'herbName', e.target.value)}
                            className="w-full px-2 py-1 rounded border border-line bg-white text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={l.unit}
                            onChange={e => updateLineField(i, 'unit', e.target.value)}
                            className="w-full px-2 py-1 rounded border border-line bg-white text-sm"
                          >
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={l.quantity}
                            onChange={e => {
                              const v = e.target.value;
                              if (isDecimalInput(v)) updateLineField(i, 'quantity', v);
                            }}
                            className="w-24 px-2 py-1 rounded border border-line bg-white text-sm text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={l.rate}
                            onChange={e => {
                              const v = e.target.value;
                              if (isDecimalInput(v)) updateLineField(i, 'rate', v);
                            }}
                            className="w-24 px-2 py-1 rounded border border-line bg-white text-sm text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">₹{(l.amount ?? l.quantity * l.rate).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => removeLine(i)} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">Add at least one line item.</p>
            )}
          </section>
        </div>
      </Modal>

      <Modal open={missingFields.length > 0} onClose={() => setMissingFields([])} title="Missing fields" size="sm">
        <p className="text-sm text-muted mb-3">Please fill the following before continuing:</p>
        <ul className="list-disc pl-5 text-sm text-ink space-y-1 mb-4">
          {missingFields.map(field => <li key={field}>{field}</li>)}
        </ul>
        <div className="flex justify-end">
          <Button onClick={() => setMissingFields([])}>OK</Button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setError(''); }} title="Delete Bill">
        {error && <Alert type="error" className="mb-4">{error}</Alert>}
        <p className="text-sm text-muted mb-4">
          Delete invoice <span className="font-medium text-ink">{deleteTarget?.billNumber}</span>? Herb stock from this bill will be reversed.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setDeleteTarget(null); setError(''); }}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirmDelete}>Delete</Button>
        </div>
      </Modal>
    </Layout>
  );
}
