// Where the backend (REST API + Socket.IO) lives.
// - `npm run dev`: the separate Express server on port 5000.
// - Production build: Express serves this frontend too, so the backend is the page's own origin.
// Set VITE_API_URL at build time to point a build at some other backend.
export const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);
