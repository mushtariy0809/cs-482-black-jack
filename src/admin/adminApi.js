
const ADMIN_URL = 'http://localhost:5000/api/admin';

export async function adminRequest(token, path, options = {}) {
  const response = await fetch(`${ADMIN_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Admin request failed.');
  }

  return data;
}
