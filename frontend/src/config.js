// API Base URL configuration:
// 1. User manual override stored in browser (localStorage: karya_api_url)
// 2. Build-time environment variable (VITE_API_URL, e.g. https://your-backend.onrender.com)
// 3. Fallback: '' (uses Vite proxy /api -> http://localhost:8000)

const cleanUrl = (raw) => {
  if (!raw || !raw.trim()) return '';
  return raw.trim().replace(/\/+$/, '').replace(/\/api\/?$/i, '');
};

const getInitialApiBase = () => {
  try {
    const saved = localStorage.getItem('karya_api_url');
    if (saved && saved.trim()) {
      return cleanUrl(saved);
    }
  } catch (_) {}
  if (import.meta.env.VITE_API_URL) {
    return cleanUrl(import.meta.env.VITE_API_URL);
  }
  return '';
};

export const API_BASE = getInitialApiBase();

export const setCustomApiBase = (url) => {
  try {
    const cleaned = cleanUrl(url);
    if (!cleaned) {
      localStorage.removeItem('karya_api_url');
    } else {
      localStorage.setItem('karya_api_url', cleaned);
    }
  } catch (_) {}
};
