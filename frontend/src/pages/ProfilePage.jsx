import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Card, CardBody, PageHeader, Button, Input, Alert } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { authApi, settingsApi } from '../api';

export default function ProfilePage({ portal = 'admin' }) {
  const {
    user,
    isAdmin,
    crudPasswordSet,
    refreshUser,
    refreshSecurity,
  } = useAuth();

  const [loginForm, setLoginForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [crudForm, setCrudForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [securityLoaded, setSecurityLoaded] = useState(!isAdmin);

  useEffect(() => {
    if (!isAdmin) {
      setSecurityLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await refreshSecurity();
      } finally {
        if (!cancelled) setSecurityLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const saveLoginPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await authApi.changePassword(loginForm);
      await refreshUser();
      setLoginForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('Login password updated');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update login password');
    } finally {
      setSaving(false);
    }
  };

  const saveCrudPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const result = await settingsApi.setCrudPassword({
        currentPassword: crudForm.currentPassword,
        newPassword: crudForm.newPassword,
        confirmPassword: crudForm.confirmPassword,
      });
      await refreshSecurity();
      setCrudForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage(result.message || 'Edit/Delete Herb Password updated');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update Edit/Delete Herb Password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout portal={portal}>
      <PageHeader title="Profile" subtitle="Your account and passwords" />
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {message && <Alert type="success" className="mb-4">{message}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody className="space-y-4">
            <div><label className="text-sm text-muted">Full Name</label><p className="font-medium">{user?.fullName}</p></div>
            <div><label className="text-sm text-muted">Username</label><p className="font-medium">{user?.username}</p></div>
            <div><label className="text-sm text-muted">Role</label><p className="font-medium">{user?.role?.replace('ROLE_', '')}</p></div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="font-display text-lg font-semibold mb-2">Reset Login Password</h3>
            <p className="text-sm text-muted mb-4">Change the password used to sign in.</p>
            <form onSubmit={saveLoginPassword} className="space-y-3">
              <Input
                label="Current login password"
                type="password"
                value={loginForm.currentPassword}
                onChange={e => setLoginForm({ ...loginForm, currentPassword: e.target.value })}
                required
              />
              <Input
                label="New login password"
                type="password"
                value={loginForm.newPassword}
                onChange={e => setLoginForm({ ...loginForm, newPassword: e.target.value })}
                required
              />
              <Input
                label="Confirm new login password"
                type="password"
                value={loginForm.confirmPassword}
                onChange={e => setLoginForm({ ...loginForm, confirmPassword: e.target.value })}
                required
              />
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Reset Login Password'}</Button>
            </form>
          </CardBody>
        </Card>

        {isAdmin && (
          <Card className="lg:col-span-2">
            <CardBody>
              <h3 className="font-display text-lg font-semibold mb-2">
                {!securityLoaded
                  ? 'Edit/Delete Herb Password'
                  : (crudPasswordSet ? 'Reset Edit/Delete Herb Password' : 'Set Edit/Delete Herb Password')}
              </h3>
              <p className="text-sm text-muted mb-4">
                Used when editing or deleting herb codes, medicine codes, herbs, and medicines.
              </p>

              <form onSubmit={saveCrudPassword} className="grid gap-3 md:grid-cols-3">
                {securityLoaded && crudPasswordSet && (
                  <Input
                    label="Current Edit/Delete Herb Password"
                    type="password"
                    value={crudForm.currentPassword}
                    onChange={e => setCrudForm({ ...crudForm, currentPassword: e.target.value })}
                    required
                  />
                )}
                <Input
                  label="New Edit/Delete Herb Password"
                  type="password"
                  value={crudForm.newPassword}
                  onChange={e => setCrudForm({ ...crudForm, newPassword: e.target.value })}
                  required
                />
                <Input
                  label="Confirm new password"
                  type="password"
                  value={crudForm.confirmPassword}
                  onChange={e => setCrudForm({ ...crudForm, confirmPassword: e.target.value })}
                  required
                />
                <div className="md:col-span-3">
                  <Button type="submit" disabled={saving || !securityLoaded}>
                    {saving
                      ? 'Saving...'
                      : (crudPasswordSet ? 'Reset Edit/Delete Herb Password' : 'Set Edit/Delete Herb Password')}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        )}
      </div>
    </Layout>
  );
}
