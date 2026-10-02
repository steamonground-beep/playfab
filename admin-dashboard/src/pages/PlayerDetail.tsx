import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';

export default function PlayerDetail() {
  const { publicId } = useParams();
  const [player, setPlayer] = useState<Record<string, unknown> | null>(null);
  const [banReason, setBanReason] = useState('');
  const [grantItemId, setGrantItemId] = useState('');
  const [grantCurrency, setGrantCurrency] = useState({ code: 'GC', amount: 100 });

  useEffect(() => {
    if (publicId) api<Record<string, unknown>>(`/admin/players/${publicId}`).then(setPlayer).catch(console.error);
  }, [publicId]);

  async function handleBan() {
    await api(`/admin/players/${publicId}/ban`, { method: 'POST', body: JSON.stringify({ reason: banReason }) });
    const updated = await api(`/admin/players/${publicId}`);
    setPlayer(updated as Record<string, unknown>);
  }

  async function handleUnban() {
    await api(`/admin/players/${publicId}/unban`, { method: 'POST', body: JSON.stringify({}) });
    const updated = await api(`/admin/players/${publicId}`);
    setPlayer(updated as Record<string, unknown>);
  }

  async function handleGrantItem() {
    await api(`/admin/players/${publicId}/grant-item`, { method: 'POST', body: JSON.stringify({ itemId: grantItemId, quantity: 1 }) });
    const updated = await api(`/admin/players/${publicId}`);
    setPlayer(updated as Record<string, unknown>);
  }

  async function handleGrantCurrency() {
    await api(`/admin/players/${publicId}/grant-currency`, {
      method: 'POST',
      body: JSON.stringify({ currencyCode: grantCurrency.code, amount: grantCurrency.amount }),
    });
    const updated = await api(`/admin/players/${publicId}`);
    setPlayer(updated as Record<string, unknown>);
  }

  if (!player) return <p>Loading...</p>;

  return (
    <div>
      <h1>{player.display_name as string}</h1>
      <p style={{ color: 'var(--muted)' }}>ID: {player.public_id as string}</p>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2>Moderation</h2>
        <input placeholder="Ban reason" value={banReason} onChange={e => setBanReason(e.target.value)} />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="danger" onClick={handleBan}>Ban Player</button>
          <button className="secondary" onClick={handleUnban}>Unban</button>
        </div>
      </div>

      <div className="card">
        <h2>Grant Items</h2>
        <input placeholder="Item ID" value={grantItemId} onChange={e => setGrantItemId(e.target.value)} />
        <button onClick={handleGrantItem}>Grant Item</button>
      </div>

      <div className="card">
        <h2>Grant Currency</h2>
        <div className="form-row">
          <input value={grantCurrency.code} onChange={e => setGrantCurrency({ ...grantCurrency, code: e.target.value })} />
          <input type="number" value={grantCurrency.amount} onChange={e => setGrantCurrency({ ...grantCurrency, amount: parseInt(e.target.value) })} />
          <button onClick={handleGrantCurrency}>Grant</button>
        </div>
      </div>

      <div className="card">
        <h2>Inventory</h2>
        <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>{JSON.stringify(player.inventory, null, 2)}</pre>
      </div>

      <div className="card">
        <h2>Currency</h2>
        <pre style={{ fontSize: '0.75rem' }}>{JSON.stringify(player.currency, null, 2)}</pre>
      </div>

      <div className="card">
        <h2>Statistics</h2>
        <pre style={{ fontSize: '0.75rem' }}>{JSON.stringify(player.statistics, null, 2)}</pre>
      </div>
    </div>
  );
}
