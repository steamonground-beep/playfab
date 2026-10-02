import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Security() {
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState('');
  
  // TOTP state
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrUri, setTotpQrUri] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetupStep, setTotpSetupStep] = useState<'none' | 'setup' | 'verify'>('none');
  const [totpError, setTotpError] = useState('');

  useEffect(() => {
    api<Array<Record<string, unknown>>>('/admin/audit-logs?limit=50').then(setLogs).catch(console.error);
  }, []);

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    const result = await api<{ key: string; prefix: string }>('/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: newKeyName, permissions: ['read'] }),
    });
    setCreatedKey(result.key);
    setNewKeyName('');
  }

  async function handleSetup2FA() {
    try {
      const result = await api<{ secret: string; qrUri: string }>('/admin/2fa/setup', { method: 'POST' });
      setTotpSecret(result.secret);
      setTotpQrUri(result.qrUri);
      setTotpSetupStep('verify');
    } catch (err) {
      setTotpError(err instanceof Error ? err.message : 'Failed to setup 2FA');
    }
  }

  async function handleEnable2FA(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/admin/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ totpCode }),
      });
      setTotpEnabled(true);
      setTotpSetupStep('none');
      setTotpCode('');
      setTotpSecret('');
      setTotpQrUri('');
    } catch (err) {
      setTotpError(err instanceof Error ? err.message : 'Invalid 2FA code');
    }
  }

  return (
    <div>
      <h1>Security</h1>
      
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2>Two-Factor Authentication (2FA)</h2>
        {totpEnabled ? (
          <p style={{ color: 'var(--success)' }}>✓ 2FA is enabled for your account</p>
        ) : totpSetupStep === 'verify' ? (
          <div>
            <p>Scan this QR code with your authenticator app:</p>
            {totpQrUri && (
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpQrUri)}`} 
                alt="QR Code" 
                style={{ margin: '1rem 0' }}
              />
            )}
            <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
              Or enter this secret manually: <code>{totpSecret}</code>
            </p>
            <form onSubmit={handleEnable2FA} className="form-row">
              <input 
                placeholder="Enter 6-digit code from app" 
                value={totpCode} 
                onChange={e => setTotpCode(e.target.value)} 
                maxLength={6}
                required 
              />
              <button type="submit">Enable 2FA</button>
            </form>
            <button 
              type="button" 
              onClick={() => setTotpSetupStep('none')}
              style={{ marginTop: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            {totpError && <p className="error" style={{ marginTop: '0.5rem' }}>{totpError}</p>}
          </div>
        ) : (
          <button onClick={handleSetup2FA}>Enable 2FA</button>
        )}
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2>API Keys</h2>
        <form onSubmit={handleCreateKey} className="form-row">
          <input placeholder="Key name" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} required />
          <button type="submit">Create API Key</button>
        </form>
        {createdKey && (
          <p style={{ marginTop: '0.75rem', color: 'var(--warning)' }}>
            Key created (save now, shown once): <code>{createdKey}</code>
          </p>
        )}
      </div>
      
      <div className="card">
        <h2>Audit Logs</h2>
        <table>
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id as string}>
                <td>{new Date(log.created_at as string).toLocaleString()}</td>
                <td>{log.actor_type as string}</td>
                <td>{log.action as string}</td>
                <td>{log.resource_type as string}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
