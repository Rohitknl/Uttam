import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi, settingsApi } from '../api';
import { Button, Input, Alert } from '../components/ui';

export default function PasswordSetupPage() {
  const {
    user,
    logout,
    needsLoginPasswordSetup,
    needsCrudPasswordSetup,
    needsPasswordSetup,
    refreshUser,
    refreshSecurity,
  } = useAuth();
  const navigate = useNavigate();
  const [loginForm, setLoginForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [crudForm, setCrudForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const goHome = () => {
    navigate(user?.role === 'ROLE_DEALER' ? '/dealer' : '/admin', { replace: true });
  };

  useEffect(() => {
    if (!needsPasswordSetup) goHome();
  }, [needsPasswordSetup, user?.role]);

  const handleLoginPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await authApi.changePassword(loginForm);
      await refreshUser();
      setLoginForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('Login password saved');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save login password');
    } finally {
      setSaving(false);
    }
  };

  const handleCrudPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const result = await settingsApi.setCrudPassword(crudForm);
      await refreshSecurity();
      setCrudForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage(result.message || 'Edit/delete password saved');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save Edit/Delete Herb Password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-forest-950 mb-4">
            <Package className="w-8 h-8 text-saffron-500" />
          </div>
          <h1 className="font-display text-3xl font-bold text-ink">Uttam Laboratories</h1>
          <p className="text-muted mt-2">Complete one-time setup before using the app</p>
        </div>

        {error && <Alert type="error">{error}</Alert>}
        {message && <Alert type="success">{message}</Alert>}

        {needsLoginPasswordSetup && (
          <div className="bg-white rounded-xl border border-line shadow-sm p-6">
            <h2 className="font-display text-lg font-semibold mb-2">Set Login Password</h2>
            <p className="text-sm text-muted mb-4">Choose a new password for your account. You will use this to sign in.</p>
            <form onSubmit={handleLoginPassword} className="space-y-3">
              <Input
                label="Current temporary password"
                type="password"
                value={loginForm.currentPassword}
                onChange={e => setLoginForm({ ...loginForm, currentPassword: e.target.value })}
                placeholder="Enter current password"
              />
              <Input
                label="New login password"
                type="password"
                value={loginForm.newPassword}
                onChange={e => setLoginForm({ ...loginForm, newPassword: e.target.value })}
                required
              />
              <Input
                label="Confirm login password"
                type="password"
                value={loginForm.confirmPassword}
                onChange={e => setLoginForm({ ...loginForm, confirmPassword: e.target.value })}
                required
              />
              <Button type="submit" className="w-full justify-center" disabled={saving}>
                Save Login Password
              </Button>
            </form>
          </div>
        )}

        {needsCrudPasswordSetup && (
          <div className="bg-white rounded-xl border border-line shadow-sm p-6">
            <h2 className="font-display text-lg font-semibold mb-2">Set Edit/Delete Herb Password</h2>
            <p className="text-sm text-muted mb-4">
              This password is required when editing or deleting herb codes, medicine codes, herbs, and medicines.
            </p>
            <form onSubmit={handleCrudPassword} className="space-y-3">
              <Input
                label="New Edit/Delete Herb Password"
                type="password"
                value={crudForm.newPassword}
                onChange={e => setCrudForm({ ...crudForm, newPassword: e.target.value })}
                required
              />
              <Input
                label="Confirm Edit/Delete Herb Password"
                type="password"
                value={crudForm.confirmPassword}
                onChange={e => setCrudForm({ ...crudForm, confirmPassword: e.target.value })}
                required
              />
              <Button type="submit" className="w-full justify-center" disabled={saving}>
                Save Edit/Delete Herb Password
              </Button>
            </form>
          </div>
        )}

        <div className="flex gap-2 justify-between">
          <Button variant="secondary" onClick={() => { logout(); navigate('/login'); }}>Sign Out</Button>
          {!needsPasswordSetup && (
            <Button onClick={goHome}>Continue to App</Button>
          )}
        </div>
      </div>
    </div>
  );
}
