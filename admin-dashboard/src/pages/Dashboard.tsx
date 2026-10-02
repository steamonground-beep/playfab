import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Dashboard() {
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    api<Record<string, number>>('/admin/analytics/summary').then(setStats).catch(console.error);
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="grid" style={{ marginTop: '1.5rem' }}>
        {Object.entries(stats).map(([type, count]) => (
          <div key={type} className="stat-card">
            <div className="value">{count}</div>
            <div className="label">{type.replace(/_/g, ' ')}</div>
          </div>
        ))}
        {Object.keys(stats).length === 0 && (
          <div className="stat-card">
            <div className="value">—</div>
            <div className="label">No events yet</div>
          </div>
        )}
      </div>
    </div>
  );
}
