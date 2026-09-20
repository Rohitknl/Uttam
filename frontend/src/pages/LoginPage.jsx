import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Package } from 'lucide-react';
import { Button, Input, Alert } from '../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(username, password);
      if (result.needsPasswordSetup) {
        navigate('/setup-password', { replace: true });
        return;
      }
      navigate(result.role === 'ROLE_DEALER' ? '/dealer' : '/admin');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-forest-950 mb-4">
            <Package className="w-8 h-8 text-saffron-500" />
          </div>
          <h1 className="font-display text-3xl font-bold text-ink">Uttam Laboratories</h1>
          <p className="text-muted mt-2">Ayurvedic Stock & Inventory Management</p>
        </div>

        <div className="bg-white rounded-xl border border-line shadow-sm p-8">
          <h2 className="font-display text-xl font-semibold mb-6">Sign In</h2>
          {error && <Alert type="error" className="mb-4">{error}</Alert>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Username" value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
            <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            <Button type="submit" className="w-full justify-center" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
