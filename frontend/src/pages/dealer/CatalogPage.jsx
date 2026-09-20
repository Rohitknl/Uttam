import { useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Badge, SearchBar, PageHeader, LoadingSpinner, Alert } from '../../components/ui';
import { medicinesApi, ordersApi } from '../../api';

export default function CatalogPage() {
  const [medicines, setMedicines] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLoading(true);
    medicinesApi.getAll({ activeOnly: true, search: search || undefined }).then(setMedicines).finally(() => setLoading(false));
  }, [search]);

  const addToCart = (med) => {
    const existing = cart.find(c => c.medicineId === med.id);
    if (existing) {
      setCart(cart.map(c => c.medicineId === med.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { medicineId: med.id, name: med.name, quantity: 1, pricePerUnit: med.pricePerUnit }]);
    }
  };

  const updateQty = (id, qty) => {
    if (qty <= 0) setCart(cart.filter(c => c.medicineId !== id));
    else setCart(cart.map(c => c.medicineId === id ? { ...c, quantity: qty } : c));
  };

  const placeOrder = async () => {
    setOrdering(true);
    setMessage('');
    try {
      await ordersApi.create({ items: cart.map(c => ({ medicineId: c.medicineId, quantity: c.quantity })) });
      setCart([]);
      setMessage('Order placed successfully!');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Order failed');
    } finally {
      setOrdering(false);
    }
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.quantity * c.pricePerUnit, 0);

  return (
    <Layout portal="dealer">
      <PageHeader title="Product Catalog" subtitle="Browse available medicines and place orders" />

      {message && <Alert type={message.includes('success') ? 'success' : 'error'} className="mb-4">{message}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="mb-4 max-w-sm"><SearchBar value={search} onChange={setSearch} placeholder="Search catalog..." /></div>
          {loading ? <LoadingSpinner /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {medicines.filter(m => m.pricePerUnit > 0).map(m => (
                <Card key={m.id}>
                  <CardBody>
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-ink">{m.name}</h3>
                        <p className="text-sm text-muted">{m.type} · {m.category}</p>
                        <p className="text-lg font-semibold text-forest-700 mt-2">₹{m.pricePerUnit}</p>
                        <Badge variant={m.currentStock > 0 ? 'success' : 'danger'} className="mt-1">
                          Stock: {m.currentStock}
                        </Badge>
                      </div>
                      <Button size="sm" onClick={() => addToCart(m)} disabled={m.currentStock <= 0}>
                        <ShoppingCart className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <Card className="sticky top-24">
            <CardBody>
              <h3 className="font-display font-semibold mb-4">Order Cart ({cart.length})</h3>
              {cart.length === 0 ? (
                <p className="text-sm text-muted">Add items from the catalog</p>
              ) : (
                <>
                  <ul className="space-y-3 mb-4">
                    {cart.map(c => (
                      <li key={c.medicineId} className="flex items-center justify-between text-sm">
                        <span>{c.name}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateQty(c.medicineId, c.quantity - 1)} className="w-6 h-6 rounded bg-forest-100 text-forest-700">−</button>
                          <span>{c.quantity}</span>
                          <button onClick={() => updateQty(c.medicineId, c.quantity + 1)} className="w-6 h-6 rounded bg-forest-100 text-forest-700">+</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-line pt-3 flex justify-between font-semibold">
                    <span>Total</span>
                    <span>₹{cartTotal.toLocaleString()}</span>
                  </div>
                  <Button className="w-full mt-4 justify-center" onClick={placeOrder} disabled={ordering}>
                    {ordering ? 'Placing...' : 'Place Order'}
                  </Button>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
