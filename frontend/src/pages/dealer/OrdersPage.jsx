import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { Card, CardBody, Badge, Table, PageHeader, LoadingSpinner } from '../../components/ui';
import { ordersApi } from '../../api';

export default function DealerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ordersApi.getMine().then(setOrders).finally(() => setLoading(false));
  }, []);

  const statusVariant = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', DISPATCHED: 'info' };

  const columns = [
    { key: 'orderNumber', label: 'Order #' },
    { key: 'totalAmount', label: 'Amount', render: r => `₹${r.totalAmount.toLocaleString()}` },
    { key: 'status', label: 'Status', render: r => <Badge variant={statusVariant[r.status]}>{r.status}</Badge> },
    { key: 'createdAt', label: 'Date', render: r => new Date(r.createdAt).toLocaleDateString() },
    { key: 'items', label: 'Items', render: r => r.items?.map(i => `${i.medicineName} × ${i.quantity}`).join(', ') || '—' },
  ];

  return (
    <Layout portal="dealer">
      <PageHeader title="My Orders" subtitle="Track your order history" />
      <Card>
        <CardBody>
          {loading ? <LoadingSpinner /> : <Table columns={columns} data={orders} />}
        </CardBody>
      </Card>
    </Layout>
  );
}
