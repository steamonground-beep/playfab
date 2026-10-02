import { useState } from 'react';
import { api } from '../api';

export default function Leaderboards() {
  const [leaderboardId, setLeaderboardId] = useState('global_wins');
  const [message, setMessage] = useState('');

  async function handleReset() {
    const result = await api<{ deletedEntries: number }>(`/admin/leaderboards/${leaderboardId}/reset`, { method: 'POST', body: '{}' });
    setMessage(`Reset complete. Deleted ${result.deletedEntries} entries.`);
  }

  return (
    <div>
      <h1>Leaderboards</h1>
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2>Reset Leaderboard</h2>
        <input value={leaderboardId} onChange={e => setLeaderboardId(e.target.value)} placeholder="Leaderboard ID" />
        <button className="danger" onClick={handleReset}>Reset</button>
        {message && <p style={{ marginTop: '0.5rem', color: 'var(--success)' }}>{message}</p>}
      </div>
    </div>
  );
}
