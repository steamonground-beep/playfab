import { useEffect, useState } from 'react';
import { api } from '../api';

export default function PhotonConfig() {
  const [config, setConfig] = useState({
    realtimeAppId: '',
    voiceAppId: '',
    region: 'us',
    appVersion: '1.0',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<typeof config>('/admin/photon/config').then(setConfig).catch(console.error);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await api('/admin/photon/config', { method: 'PUT', body: JSON.stringify(config) });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div>
      <h1>Photon Configuration</h1>
      <p style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>
        Configure separate App IDs for Photon Realtime and Photon Voice. Never substitute one for the other.
      </p>
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <form onSubmit={handleSave}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
            Photon Realtime App ID
          </label>
          <input value={config.realtimeAppId} onChange={e => setConfig({ ...config, realtimeAppId: e.target.value })} placeholder="Realtime App ID" />
          
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
            Photon Voice App ID (separate from Realtime)
          </label>
          <input value={config.voiceAppId} onChange={e => setConfig({ ...config, voiceAppId: e.target.value })} placeholder="Voice App ID" />
          
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Region</label>
          <input value={config.region} onChange={e => setConfig({ ...config, region: e.target.value })} />
          
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>App Version</label>
          <input value={config.appVersion} onChange={e => setConfig({ ...config, appVersion: e.target.value })} />
          
          <button type="submit">Save Configuration</button>
          {saved && <span style={{ marginLeft: '1rem', color: 'var(--success)' }}>Saved!</span>}
        </form>
      </div>
    </div>
  );
}
