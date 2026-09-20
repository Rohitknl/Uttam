import { useEffect, useState, useRef } from 'react';
import { DatabaseBackup, Download, Upload, RefreshCw, FolderOpen, FileSearch } from 'lucide-react';
import Layout from '../../components/Layout';
import { Card, CardBody, Button, Select, Input, PageHeader, LoadingSpinner, Alert } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { backupApi } from '../../api';

export default function BackupPage() {
  const { isAdmin } = useAuth();
  const [destinations, setDestinations] = useState([]);
  const [backupDestinationId, setBackupDestinationId] = useState('');
  const [restoreDestinationId, setRestoreDestinationId] = useState('');
  const [backups, setBackups] = useState([]);
  const [selectedBackup, setSelectedBackup] = useState('');
  const [customBackupPath, setCustomBackupPath] = useState('');
  const [customRestoreFile, setCustomRestoreFile] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

  const loadDestinations = async () => {
    const list = await backupApi.destinations();
    setDestinations(list);
    if (list.length && !backupDestinationId) {
      setBackupDestinationId(list[0].id);
      setRestoreDestinationId(list[0].id);
    }
    return list;
  };

  const refreshDrives = async () => {
    setRefreshing(true);
    setError('');
    try {
      const list = await backupApi.destinations();
      setDestinations(list);
      if (list.length && !list.some(d => d.id === backupDestinationId)) {
        setBackupDestinationId(list[0].id);
        setRestoreDestinationId(list[0].id);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to refresh drives');
    } finally {
      setRefreshing(false);
    }
  };

  const loadBackupList = async (destinationId = restoreDestinationId) => {
    if (!destinationId) return;
    try {
      const data = await backupApi.list(destinationId);
      setBackups(data.backups || []);
      if (data.backups?.length) {
        setSelectedBackup((prev) => (
          data.backups.some(b => b.name === prev) ? prev : data.backups[0].name
        ));
      } else {
        setSelectedBackup('');
      }
    } catch (err) {
      setBackups([]);
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
      .then(() => loadBackupList('dir_desktop'))
      .catch(err => setError(err.response?.data?.message || 'Failed to load backup options'))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || loading || customRestoreFile) return;
    loadBackupList(restoreDestinationId).catch(() => setBackups([]));
  }, [restoreDestinationId, customRestoreFile]);

  // Browse folder popup (Native Electron or Web fallback)
  const handleBrowseBackupFolder = async () => {
    setError('');
    if (window.electronAPI?.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        setCustomBackupPath(folder);
        setBackupDestinationId(folder);
        // Add to destinations if not present
        if (!destinations.some(d => d.id === folder || d.path === folder)) {
          setDestinations(prev => [{ id: folder, label: `Custom Folder: ${folder}`, path: folder }, ...prev]);
        }
      }
    } else if (window.showDirectoryPicker) {
      try {
        const handle = await window.showDirectoryPicker();
        if (handle?.name) {
          const pathStr = handle.name;
          setCustomBackupPath(pathStr);
          setBackupDestinationId(pathStr);
        }
      } catch (e) {
        // User cancelled picker
      }
    } else {
      const manual = prompt('Enter or paste folder path on your computer:');
      if (manual && manual.trim()) {
        const pathStr = manual.trim();
        setCustomBackupPath(pathStr);
        setBackupDestinationId(pathStr);
        if (!destinations.some(d => d.id === pathStr)) {
          setDestinations(prev => [{ id: pathStr, label: `Custom: ${pathStr}`, path: pathStr }, ...prev]);
        }
      }
    }
  };

  // Browse restore file popup (Native Electron or HTML File Input)
  const handleBrowseRestoreFile = async () => {
    setError('');
    if (window.electronAPI?.selectFile) {
      const filePath = await window.electronAPI.selectFile();
      if (filePath) {
        setCustomRestoreFile(filePath);
        setSelectedBackup(filePath);
      }
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleHTMLFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setCustomRestoreFile(file.name);
      setSelectedBackup(file.name);
    }
  };

  const handleBackup = async () => {
    if (!backupPassword.trim()) {
      setError('Enter Edit/Delete Herb Password to create a backup');
      return;
    }
    const targetDest = customBackupPath || backupDestinationId;
    if (!targetDest) {
      setError('Select a folder location first');
      return;
    }
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await backupApi.create(targetDest, backupPassword);
      setMessage(`Backup saved: ${result.backup.path}`);
      setBackupPassword('');
      if (targetDest === restoreDestinationId) {
        await loadBackupList(restoreDestinationId);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Backup failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    const targetFile = customRestoreFile || selectedBackup;
    if (!targetFile) {
      setError('Select a backup file to restore');
      return;
    }
    if (!restorePassword.trim()) {
      setError('Enter Edit/Delete Herb Password to restore a backup');
      return;
    }
    if (!confirm(`Restore backup "${targetFile}"?\n\nCurrent data will be replaced. A safety copy is saved under _pre_restore.`)) {
      return;
    }
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await backupApi.restore(restoreDestinationId, targetFile, restorePassword);
      setMessage(result.message + ` (${result.restoredFrom})`);
      setRestorePassword('');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err.response?.data?.message || 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <Layout>
        <PageHeader title="Backup & Restore" subtitle="Admin only" />
        <Card className="p-6">
          You do not have permission to manage backups.
        </Card>
      </Layout>
    );
  }

  if (loading) return <Layout><LoadingSpinner /></Layout>;

  return (
    <Layout>
      <input
        type="file"
        ref={fileInputRef}
        accept=".db"
        className="hidden"
        onChange={handleHTMLFileSelected}
      />

      <PageHeader
        title="Backup & Restore"
        subtitle="Save backups to any location on your computer or USB drive, or restore data from any backup file."
        action={
          <Button variant="outline" size="sm" onClick={refreshDrives} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Drives
          </Button>
        }
      />

      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      {message && <Alert type="success" className="mb-4">{message}</Alert>}

      <div className="grid md:grid-cols-2 gap-6">
        {/* DATA BACKUP CARD */}
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-2 text-forest-700 font-semibold text-lg">
              <Download className="w-5 h-5" />
              Data Backup
            </div>
            <p className="text-sm text-muted">
              Saves a snapshot of herbs, medicines, bills, and orders to any folder or drive on your computer.
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium text-forest-900 block">
                Select Destination Folder
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={backupDestinationId}
                    onChange={e => {
                      setBackupDestinationId(e.target.value);
                      setCustomBackupPath('');
                    }}
                  >
                    {destinations.map(d => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBrowseBackupFolder}
                  title="Browse My Computer for any folder"
                  className="whitespace-nowrap"
                >
                  <FolderOpen className="w-4 h-4 mr-1" />
                  Browse Computer
                </Button>
              </div>
              {customBackupPath && (
                <div className="text-xs text-forest-700 bg-forest-50 p-2 rounded border border-forest-200 break-all">
                  Selected Folder: <strong>{customBackupPath}</strong>
                </div>
              )}
            </div>

            <Input
              label="Edit/Delete Herb Password"
              type="password"
              value={backupPassword}
              onChange={e => setBackupPassword(e.target.value)}
              placeholder="Required to create backup"
            />
            <Button onClick={handleBackup} disabled={busy} className="w-full">
              <DatabaseBackup className="w-4 h-4 mr-2" />
              {busy ? 'Working...' : 'Backup Data Now'}
            </Button>
          </CardBody>
        </Card>

        {/* RESTORE BACKUP CARD */}
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-2 text-forest-700 font-semibold text-lg">
              <Upload className="w-5 h-5" />
              Restore Backup
            </div>
            <p className="text-sm text-muted">
              Replace current data with a selected backup file from any folder or USB drive.
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium text-forest-900 block">
                Select Backup File to Restore
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={selectedBackup}
                    onChange={e => {
                      setSelectedBackup(e.target.value);
                      setCustomRestoreFile('');
                    }}
                  >
                    {backups.length === 0 ? (
                      <option value="">No backups found in folder</option>
                    ) : (
                      backups.map(b => (
                        <option key={b.name} value={b.name}>
                          {b.name} — {b.sizeLabel} — {new Date(b.modifiedAt).toLocaleString()}
                        </option>
                      ))
                    )}
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBrowseRestoreFile}
                  title="Browse My Computer for any backup file"
                  className="whitespace-nowrap"
                >
                  <FileSearch className="w-4 h-4 mr-1" />
                  Browse File
                </Button>
              </div>
              {customRestoreFile && (
                <div className="text-xs text-forest-700 bg-forest-50 p-2 rounded border border-forest-200 break-all">
                  Selected Backup File: <strong>{customRestoreFile}</strong>
                </div>
              )}
            </div>

            <Input
              label="Edit/Delete Herb Password"
              type="password"
              value={restorePassword}
              onChange={e => setRestorePassword(e.target.value)}
              placeholder="Required to restore backup"
            />
            <Button
              variant="saffron"
              onClick={handleRestore}
              disabled={busy || (!selectedBackup && !customRestoreFile)}
              className="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              {busy ? 'Restoring...' : 'Restore Selected Backup'}
            </Button>
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
