import { useEffect, useState } from 'react';
import { AlertTriangle, Package, Printer } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardHeader, CardBody, Badge, Button, LoadingSpinner, PageHeader, Modal } from '../../components/ui';
import { analyticsApi } from '../../api';

const TILES = {
  lowHerbs: {
    key: 'lowHerbs',
    label: 'Low Stock Herbs',
    empty: 'All herbs are above minimum stock levels.',
    color: 'text-red-500',
    icon: AlertTriangle,
  },
  lowMedicines: {
    key: 'lowMedicines',
    label: 'Low Stock Medicines',
    empty: 'All medicines are above minimum stock levels.',
    color: 'text-red-500',
    icon: Package,
  },
  expiring: {
    key: 'expiring',
    label: 'Expiring Medicines (30 days)',
    empty: 'No medicines expiring soon.',
    color: 'text-red-500',
    icon: AlertTriangle,
  },
};

function printList(title, rowsHtml) {
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #1c241e; padding: 24px; font-size: 12px; }
    .brand { font-size: 20px; font-weight: 700; color: #2d5a3d; }
    .sub { color: #5c6b60; margin-bottom: 16px; }
    h1 { font-size: 16px; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #d5e0d8; padding: 8px; text-align: left; }
    th { background: #e8f2eb; color: #2d5a3d; }
    .r { text-align: right; }
    .foot { margin-top: 24px; color: #5c6b60; font-size: 11px; border-top: 1px dashed #c5d0c8; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="brand">Uttam Laboratories</div>
  <div class="sub">Printed ${esc(new Date().toLocaleString())}</div>
  <h1>${esc(title)}</h1>
  <table>
    <thead>${rowsHtml.head}</thead>
    <tbody>${rowsHtml.body}</tbody>
  </table>
  <div class="foot">${esc(rowsHtml.count)} record(s)</div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function buildPrintRows(type, items) {
  if (type === 'lowHerbs') {
    return {
      head: '<tr><th>#</th><th>Herb</th><th class="r">Stock</th><th class="r">Min Alert</th><th>Unit</th></tr>',
      body: items.map((h, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${h.name}</td>
          <td class="r">${h.currentStock}</td>
          <td class="r">${h.minimumStockAlert}</td>
          <td>${h.unitOfMeasure || ''}</td>
        </tr>`).join(''),
      count: items.length,
    };
  }
  if (type === 'lowMedicines') {
    return {
      head: '<tr><th>#</th><th>Medicine</th><th class="r">Stock</th><th class="r">Min Alert</th></tr>',
      body: items.map((m, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${m.name}</td>
          <td class="r">${m.currentStock}</td>
          <td class="r">${m.minimumStockAlert}</td>
        </tr>`).join(''),
      count: items.length,
    };
  }
  return {
    head: '<tr><th>#</th><th>Medicine</th><th class="r">Stock</th><th>Expiry</th><th>Status</th></tr>',
    body: items.map((m, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${m.name}</td>
        <td class="r">${m.currentStock}</td>
        <td>${m.expiryDate ? new Date(m.expiryDate).toLocaleDateString() : '—'}</td>
        <td>${m.expired ? 'Expired' : 'Expiring soon'}</td>
      </tr>`).join(''),
    count: items.length,
  };
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState(null);

  useEffect(() => {
    analyticsApi.admin().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <Layout><LoadingSpinner /></Layout>;

  const lists = {
    lowHerbs: data.lowStockHerbs || [],
    lowMedicines: data.lowStockMedicines || [],
    expiring: data.expiringMedicines || [],
  };

  const active = popup ? TILES[popup] : null;
  const activeItems = popup ? lists[popup] : [];

  const openTile = (key) => setPopup(key);

  const handlePrint = () => {
    if (!active) return;
    printList(active.label, buildPrintRows(popup, activeItems));
  };

  return (
    <Layout>
      <PageHeader title="Dashboard" subtitle="Inventory overview and analytics" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={TILES.lowHerbs.icon}
          label={TILES.lowHerbs.label}
          value={lists.lowHerbs.length}
          color={TILES.lowHerbs.color}
          onClick={() => openTile('lowHerbs')}
        />
        <StatCard
          icon={TILES.lowMedicines.icon}
          label={TILES.lowMedicines.label}
          value={lists.lowMedicines.length}
          color={TILES.lowMedicines.color}
          onClick={() => openTile('lowMedicines')}
        />
        <StatCard
          icon={TILES.expiring.icon}
          label="Expiring Medicines"
          value={lists.expiring.length}
          color={TILES.expiring.color}
          onClick={() => openTile('expiring')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className={lists.lowHerbs.length > 0 ? 'bg-red-50/50 border-red-300' : ''}>
          <CardHeader title={<span className={lists.lowHerbs.length > 0 ? 'text-red-700' : ''}>Low Stock Herbs</span>} />
          <CardBody className="p-0">
            {lists.lowHerbs.length === 0 ? (
              <p className="px-6 py-4 text-muted text-sm">{TILES.lowHerbs.empty}</p>
            ) : (
              <ul className="divide-y divide-line">
                {lists.lowHerbs.map(h => (
                  <li key={h.id} className="px-6 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-ink">{h.name}</span>
                    <Badge variant="danger">{h.currentStock} {h.unitOfMeasure}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className={lists.lowMedicines.length > 0 ? 'bg-red-50/50 border-red-300' : ''}>
          <CardHeader title={<span className={lists.lowMedicines.length > 0 ? 'text-red-700' : ''}>Low Stock Medicines</span>} />
          <CardBody className="p-0">
            {lists.lowMedicines.length === 0 ? (
              <p className="px-6 py-4 text-muted text-sm">{TILES.lowMedicines.empty}</p>
            ) : (
              <ul className="divide-y divide-line">
                {lists.lowMedicines.map(m => (
                  <li key={m.id} className="px-6 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-ink">{m.name}</span>
                    <Badge variant="danger">{m.currentStock}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className={lists.expiring.length > 0 ? 'bg-red-50/50 border-red-300' : ''}>
          <CardHeader title={<span className={lists.expiring.length > 0 ? 'text-red-700' : ''}>Expiring Medicines (30 days)</span>} />
          <CardBody className="p-0">
            {lists.expiring.length === 0 ? (
              <p className="px-6 py-4 text-muted text-sm">{TILES.expiring.empty}</p>
            ) : (
              <ul className="divide-y divide-line">
                {lists.expiring.map(m => (
                  <li key={m.id} className="px-6 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-ink">{m.name}</span>
                    <Badge variant={m.expired ? 'danger' : 'warning'}>
                      {new Date(m.expiryDate).toLocaleDateString()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={Boolean(popup)}
        onClose={() => setPopup(null)}
        title={active?.label || ''}
        size="lg"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPopup(null)}>Close</Button>
            <Button onClick={handlePrint} disabled={!activeItems.length}>
              <Printer className="w-4 h-4" /> Print
            </Button>
          </div>
        )}
      >
        {activeItems.length === 0 ? (
          <p className="text-sm text-muted py-2">{active?.empty}</p>
        ) : popup === 'lowHerbs' ? (
          <div className="border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface/50">
                  <th className="px-3 py-2 text-left font-medium text-muted">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted">Herb</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Stock</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Min Alert</th>
                  <th className="px-3 py-2 text-left font-medium text-muted">Unit</th>
                </tr>
              </thead>
              <tbody>
                {activeItems.map((h, i) => (
                  <tr key={h.id} className="border-b border-line/50">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{h.name}</td>
                    <td className="px-3 py-2 text-right">{h.currentStock}</td>
                    <td className="px-3 py-2 text-right">{h.minimumStockAlert}</td>
                    <td className="px-3 py-2">{h.unitOfMeasure}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : popup === 'lowMedicines' ? (
          <div className="border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface/50">
                  <th className="px-3 py-2 text-left font-medium text-muted">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted">Medicine</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Stock</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Min Alert</th>
                </tr>
              </thead>
              <tbody>
                {activeItems.map((m, i) => (
                  <tr key={m.id} className="border-b border-line/50">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{m.name}</td>
                    <td className="px-3 py-2 text-right">{m.currentStock}</td>
                    <td className="px-3 py-2 text-right">{m.minimumStockAlert}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface/50">
                  <th className="px-3 py-2 text-left font-medium text-muted">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted">Medicine</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Stock</th>
                  <th className="px-3 py-2 text-left font-medium text-muted">Expiry</th>
                  <th className="px-3 py-2 text-left font-medium text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeItems.map((m, i) => (
                  <tr key={m.id} className="border-b border-line/50">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{m.name}</td>
                    <td className="px-3 py-2 text-right">{m.currentStock}</td>
                    <td className="px-3 py-2">{m.expiryDate ? new Date(m.expiryDate).toLocaleDateString() : '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant={m.expired ? 'danger' : 'warning'}>
                        {m.expired ? 'Expired' : 'Expiring soon'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </Layout>
  );
}

function StatCard({ icon: Icon, label, value, color, onClick }) {
  const isAlert = value > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left w-full rounded-xl focus:outline-none focus:ring-2 ${
        isAlert ? 'focus:ring-red-500/30' : 'focus:ring-forest-700/30'
      }`}
    >
      <Card className={`transition-all duration-200 cursor-pointer h-full ${
        isAlert
          ? 'bg-red-50/80 border-red-300 hover:border-red-400 shadow-sm shadow-red-100'
          : 'hover:border-forest-700/40'
      }`}>
        <CardBody className="flex items-center gap-4">
          <div className={`p-3 rounded-lg ${isAlert ? 'bg-red-100 text-red-600' : `bg-forest-100 ${color}`}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className={`text-2xl font-bold ${isAlert ? 'text-red-600' : 'text-ink'}`}>{value}</p>
            <p className={`text-sm ${isAlert ? 'text-red-900 font-semibold' : 'text-muted'}`}>{label}</p>
            <p className={`text-xs mt-1 ${isAlert ? 'text-red-600 font-medium' : 'text-forest-700'}`}>Click to view list</p>
          </div>
        </CardBody>
      </Card>
    </button>
  );
}
