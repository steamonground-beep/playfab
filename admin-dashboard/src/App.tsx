import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { isLoggedIn, clearAdminToken } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import PlayerDetail from './pages/PlayerDetail';
import Economy from './pages/Economy';
import Leaderboards from './pages/Leaderboards';
import Matchmaking from './pages/Matchmaking';
import PhotonConfig from './pages/PhotonConfig';
import Security from './pages/Security';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Rayvo Admin</h1>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/players">Players</NavLink>
          <NavLink to="/economy">Economy</NavLink>
          <NavLink to="/leaderboards">Leaderboards</NavLink>
          <NavLink to="/matchmaking">Matchmaking</NavLink>
          <NavLink to="/photon">Photon Config</NavLink>
          <NavLink to="/security">Security</NavLink>
          <a href="#" onClick={(e) => { e.preventDefault(); clearAdminToken(); window.location.href = '/login'; }}>Logout</a>
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/players" element={<ProtectedRoute><Players /></ProtectedRoute>} />
        <Route path="/players/:publicId" element={<ProtectedRoute><PlayerDetail /></ProtectedRoute>} />
        <Route path="/economy" element={<ProtectedRoute><Economy /></ProtectedRoute>} />
        <Route path="/leaderboards" element={<ProtectedRoute><Leaderboards /></ProtectedRoute>} />
        <Route path="/matchmaking" element={<ProtectedRoute><Matchmaking /></ProtectedRoute>} />
        <Route path="/photon" element={<ProtectedRoute><PhotonConfig /></ProtectedRoute>} />
        <Route path="/security" element={<ProtectedRoute><Security /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
