import { useEffect, useState } from 'react';
import { DatabaseBackup, Download, Upload } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Select, Input, PageHeader, LoadingSpinner, Alert } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { backupApi } from '../../api';

export default function BackupPage() {
  const { isAdmin } = useAuth();
  const [destinations, setDestinations] = useState([]);
  const [backupDestinationId, setBackupDestinationId] = useState('c_uttam');
  const [restoreDestinationId, setRestoreDestinationId] = useState('c_uttam');
  const [backups, setBackups] = useState([]);
  const [selectedBackup, setSelectedBackup] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadDestinations = async () => {
    const list = await backupApi.destinations();
    setDestinations(list);
    if (list.length && !list.find(d => d.id === backupDestinationId)) {
      setBackupDestinationId(list[0].id);
      setRestoreDestinationId(list[0].id);
    }
  };

  const loadBackupList = async (destinationId = restoreDestinationId) => {
    const data = await backupApi.list(destinationId);
    setBackups(data.backups || []);
    if (data.backups?.length) {
      setSelectedBackup((prev) => (
        data.backups.some(b => b.name === prev) ? prev : data.backups[0].name
      ));
    } else {
      setSelectedBackup('');
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadDestinations()
      .then(() => loadBackupList('c_uttam'))
      .catch(err => setError(err.response?.data?.message || 'Failed to load backup options'))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || loading) return;
    loadBackupList(restoreDestinationId).catch(() => setBackups([]));
  }, [restoreDestinationId]);

  const handleBackup = async () => {
    if (!backupPassword.trim()) {
      setError('Enter Edit/Delete Herb Password to create a backup');
      return;
    }
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await backupApi.create(backupDestinationId, backupPassword);
      setMessage(`Backup saved: ${result.backup.path}`);
      setBackupPassword('');
      if (backupDestinationId === restoreDestinationId) {
        await loadBackupList(restoreDestinationId);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Backup failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) {
      setError('Select a backup file to install');
      return;
    }
    if (!restorePassword.trim()) {
      setError('Enter Edit/Delete Herb Password to restore a backup');
      return;
    }
    if (!confirm(`Install backup "${selectedBackup}"?\n\nCurrent data will be replaced. A safety copy is saved under _pre_restore.`)) {
      return;
    }
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await backupApi.restore(restoreDestinationId, selectedBackup, restorePassword);
      setMessage(result.message + ` (${result.restoredFrom})`);
      setRestorePassword('');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err.response?.data?.message || 'Install failed');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <Layout>
        <PageHeader title="Backup & Restore" subtitle="Admin only" />
        <Alert type="warning">Only administrators can back up or install data.</Alert>
      </Layout>
    );
  }

  if (loading) return <Layout><LoadingSpinner /></Layout>;

  return (
    <Layout>
      <PageHeader
        title="Backup & Restore"
        subtitle="Save all app data to your hard drive, or install a previous backup"
      />

      {message && <div className="mb-4"><Alert type="success">{message}</Alert></div>}
      {error && <div className="mb-4"><Alert type="error" onClose={() => setError('')}>{error}</Alert></div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-2 text-forest-700 font-semibold">
              <Download className="w-5 h-5" />
              Data Backup
            </div>
            <p className="text-sm text-muted">
              Creates a full SQLite backup of all current data (codes, bills, herbs, medicines, formulas, users).
            </p>
            <Select
              label="Save to location"
              value={backupDestinationId}
              onChange={e => setBackupDestinationId(e.target.value)}
            >
              {destinations.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </Select>
            <Input
              label="Edit/Delete Herb Password"
              type="password"
              value={backupPassword}
              onChange={e => setBackupPassword(e.target.value)}
              placeholder="Required to create backup"
            />
            <Button onClick={handleBackup} disabled={busy}>
              <DatabaseBackup className="w-4 h-4" />
              {busy ? 'Working...' : 'Backup Data Now'}
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-2 text-forest-700 font-semibold">
              <Upload className="w-5 h-5" />
              Data Install
            </div>
            <p className="text-sm text-muted">
              Replace current data with a selected backup file from the chosen folder.
            </p>
            <Select
              label="Backup folder"
              value={restoreDestinationId}
              onChange={e => setRestoreDestinationId(e.target.value)}
            >
              {destinations.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </Select>
            <Select
              label="Select backup to install"
              value={selectedBackup}
              onChange={e => setSelectedBackup(e.target.value)}
            >
              {backups.length === 0 ? (
                <option value="">No backups found in this folder</option>
              ) : (
                backups.map(b => (
                  <option key={b.name} value={b.name}>
                    {b.name} — {b.sizeLabel} — {new Date(b.modifiedAt).toLocaleString()}
                  </option>
                ))
              )}
            </Select>
            <Input
              label="Edit/Delete Herb Password"
              type="password"
              value={restorePassword}
              onChange={e => setRestorePassword(e.target.value)}
              placeholder="Required to restore backup"
            />
            <Button variant="saffron" onClick={handleRestore} disabled={busy || !selectedBackup}>
              <Upload className="w-4 h-4" />
              {busy ? 'Installing...' : 'Install Selected Data'}
            </Button>
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
