const API_BASE = import.meta.env.VITE_API_URL ?? '';

function getToken(): string | null {
  return localStorage.getItem('adminToken');
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/v1${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message ?? 'Request failed');
  }

  return data.data ?? data;
}

export async function adminLogin(username: string, password: string, totpCode?: string) {
  return api<{ token: string; requires2FA?: boolean }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, totpCode }),
  });
}

export function setAdminToken(token: string) {
  localStorage.setItem('adminToken', token);
}

export function clearAdminToken() {
  localStorage.removeItem('adminToken');
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
