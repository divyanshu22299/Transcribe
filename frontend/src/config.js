// API Base URL configuration:
// 1. User manual override stored in browser (localStorage: karya_api_url)
// 2. Build-time environment variable (VITE_API_URL, e.g. https://your-backend.onrender.com)
// 3. Fallback: '' (uses Vite proxy /api -> http://localhost:8000)

const getInitialApiBase = () => {
  try {
    const saved = localStorage.getItem('karya_api_url');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch (_) {}
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }
  return '';
};

export const API_BASE = getInitialApiBase();

export const setCustomApiBase = (url) => {
  try {
    if (!url || !url.trim()) {
      localStorage.removeItem('karya_api_url');
    } else {
      localStorage.setItem('karya_api_url', url.trim().replace(/\/+$/, ''));
    }
  } catch (_) {}
};
