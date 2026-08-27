// API Base URL configuration:
// - In development: defaults to '' (uses Vite proxy /api -> http://localhost:8000)
// - In production (Vercel): uses VITE_API_URL if provided (e.g. https://your-backend.onrender.com)
export const API_BASE = import.meta.env.VITE_API_URL || '';
