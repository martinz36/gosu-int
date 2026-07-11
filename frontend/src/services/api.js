// ============================================================
// api.js — Cliente centralizado para la API de Gosu Int
// ============================================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Obtener el token guardado
const getToken = () => localStorage.getItem('gosu_token');

// Helper para hacer requests con auth
async function request(method, endpoint, body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  // Si 401, limpiar token y redirigir al login
  if (response.status === 401) {
    localStorage.removeItem('gosu_token');
    localStorage.removeItem('gosu_user');
    window.location.reload();
    return;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Error desconocido en el servidor.');
  }

  return data;
}

// ============================================================
// Auth
// ============================================================
export const auth = {
  login: (email, password) =>
    request('POST', '/api/auth/login', { email, password }),

  bypassLogin: (email) =>
    request('POST', '/api/auth/bypass-login', { email }),

  register: (userData) =>
    request('POST', '/api/auth/register', userData),

  logout: () => {
    localStorage.removeItem('gosu_token');
    localStorage.removeItem('gosu_user');
  },

  getUser: () => {
    const raw = localStorage.getItem('gosu_user');
    return raw ? JSON.parse(raw) : null;
  },

  isAuthenticated: () => !!getToken(),
};

// ============================================================
// Products
// ============================================================
export const products = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/api/products${qs ? `?${qs}` : ''}`);
  },

  create: (productData) =>
    request('POST', '/api/products', productData),

  update: (id, productData) =>
    request('PUT', `/api/products/${id}`, productData),

  delete: (id) =>
    request('DELETE', `/api/products/${id}`),
};

// ============================================================
// Orders (Pedidos B2B)
// ============================================================
export const orders = {
  getAll: () =>
    request('GET', '/api/orders'),

  create: (items, notes = null) =>
    request('POST', '/api/orders', { items, notes }),

  updateStatus: (id, status) =>
    request('PUT', `/api/orders/${id}/status`, { status }),
};

// ============================================================
// Production (Órdenes de Fábrica)
// ============================================================
export const production = {
  getAll: () =>
    request('GET', '/api/production'),

  create: (data) =>
    request('POST', '/api/production', data),

  updateStatus: (id, status) =>
    request('PUT', `/api/production/${id}/status`, { status }),
};

// ============================================================
// Tenants (Gestión de SaaS)
// ============================================================
export const tenants = {
  getAll: () =>
    request('GET', '/api/tenants'),

  create: (tenantData) =>
    request('POST', '/api/tenants', tenantData),
};
