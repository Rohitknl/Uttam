import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Layout from '../../components/Layout';
import { Card, CardHeader, CardBody, PageHeader, LoadingSpinner } from '../../components/ui';
import { analyticsApi } from '../../api';

export default function DealerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyticsApi.dealer().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <Layout portal="dealer"><LoadingSpinner /></Layout>;

  return (
    <Layout portal="dealer">
      <PageHeader title="Dealer Dashboard" subtitle="Your order overview" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Order Status" />
          <CardBody>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.orderStatusBreakdown}>
                <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#2d5a3d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Monthly Purchase History" />
          <CardBody>
            {data.monthlyPurchaseHistory.length === 0 ? (
              <p className="text-muted text-sm">No purchase history yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.monthlyPurchaseHistory}>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip formatter={v => `₹${v.toLocaleString()}`} />
                  <Bar dataKey="totalAmount" fill="#c4782a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
