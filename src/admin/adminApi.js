import { API_URL } from '../apiUrl.js';

const ADMIN_URL = `${API_URL}/api/admin`;

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

// Uploads an ad video (MP4) or banner image as-is (A4). Resolves to { url, kind, durationMs }.
export function adminUpload(token, file) {
  return adminRequest(token, '/ads/media', {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': file.type }
  });
}
