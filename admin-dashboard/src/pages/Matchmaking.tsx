import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Matchmaking() {
  const [queues, setQueues] = useState<Array<Record<string, unknown>>>([]);
  const [matches, setMatches] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    Promise.all([
      api<Array<Record<string, unknown>>>('/admin/matchmaking/queues'),
      api<Array<Record<string, unknown>>>('/admin/matchmaking/matches'),
    ]).then(([q, m]) => { setQueues(q); setMatches(m); }).catch(console.error);
  }, []);

  return (
    <div>
      <h1>Matchmaking</h1>
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2>Active Queues</h2>
        <table>
          <thead><tr><th>Queue</th><th>Mode</th><th>Players</th><th>Region</th></tr></thead>
          <tbody>
            {queues.map(q => (
              <tr key={q.queue_name as string}>
                <td>{q.queue_name as string}</td>
                <td>{q.game_mode as string}</td>
                <td>{q.min_players as number}-{q.max_players as number}</td>
                <td>{q.region as string}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>Active Matches</h2>
        <table>
          <thead><tr><th>Match ID</th><th>Queue</th><th>Status</th><th>Room</th></tr></thead>
          <tbody>
            {matches.map(m => (
              <tr key={m.match_id as string}>
                <td>{m.match_id as string}</td>
                <td>{m.queue_name as string}</td>
                <td>{m.status as string}</td>
                <td>{m.photon_room_name as string}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
