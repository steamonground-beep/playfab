import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

interface Player {
  public_id: string;
  display_name: string;
  is_guest: boolean;
  is_banned: boolean;
  created_at: string;
}

export default function Players() {
  const [search, setSearch] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const results = await api<Player[]>(`/admin/players/search?q=${encodeURIComponent(search)}`);
    setPlayers(results);
  }

  return (
    <div>
      <h1>Players</h1>
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <form onSubmit={handleSearch} className="form-row">
          <input placeholder="Search by name, ID, email..." value={search} onChange={e => setSearch(e.target.value)} />
          <button type="submit">Search</button>
        </form>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>Public ID</th><th>Display Name</th><th>Type</th><th>Status</th><th>Created</th></tr>
          </thead>
          <tbody>
            {players.map(p => (
              <tr key={p.public_id}>
                <td><Link to={`/players/${p.public_id}`}>{p.public_id}</Link></td>
                <td>{p.display_name}</td>
                <td>{p.is_guest ? 'Guest' : 'Registered'}</td>
                <td>{p.is_banned ? <span className="badge danger">Banned</span> : <span className="badge success">Active</span>}</td>
                <td>{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
