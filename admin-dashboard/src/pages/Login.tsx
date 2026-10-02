import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin, setAdminToken } from '../api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const result = await adminLogin(username, password, totpCode || undefined);
      if (result.requires2FA) {
        setRequires2FA(true);
        return;
      }
      setAdminToken(result.token);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <div className="login-page">
      <div className="login-box card">
        <h2>Rayvo Admin Login</h2>
        <form onSubmit={handleSubmit}>
          <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          {requires2FA && (
            <input placeholder="2FA Code" value={totpCode} onChange={e => setTotpCode(e.target.value)} required />
          )}
          <button type="submit">Login</button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
