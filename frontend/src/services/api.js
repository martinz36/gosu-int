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

  impersonate: (userId) =>
    request('POST', `/api/auth/impersonate/${userId}`),

  register: (userData) =>
    request('POST', '/api/auth/register', userData),

  logout: () => {
    localStorage.removeItem('gosu_token');
    localStorage.removeItem('gosu_user');
    localStorage.removeItem('gosu_superadmin_token');
    localStorage.removeItem('gosu_superadmin_user');
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

  create: (items, notes = null, incoterm = 'FOB China') =>
    request('POST', '/api/orders', { items, notes, incoterm }),

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

  getAuditLogs: (id) =>
    request('GET', `/api/production/${id}/audit`),
};

export const tenants = {
  getAll: () =>
    request('GET', '/api/tenants'),

  create: (tenantData) =>
    request('POST', '/api/tenants', tenantData),

  update: (id, tenantData) =>
    request('PUT', `/api/tenants/${id}`, tenantData),

  delete: (id) =>
    request('DELETE', `/api/tenants/${id}`),
};

// ============================================================
// Users (SaaS Global Users)
// ============================================================
export const users = {
  getGlobal: () =>
    request('GET', '/api/users/global'),

  createSuperAdmin: (userData) =>
    request('POST', '/api/users/superadmin', userData),

  getClients: () =>
    request('GET', '/api/users/clients'),

  createClient: (clientData) =>
    request('POST', '/api/users/clients', clientData),

  updateClient: (id, clientData) =>
    request('PUT', `/api/users/clients/${id}`, clientData),

  deleteClient: (id) =>
    request('DELETE', `/api/users/clients/${id}`),
};

// ============================================================
// Plans (SaaS Plans)
// ============================================================
export const plans = {
  getAll: () =>
    request('GET', '/api/plans'),
};

// ============================================================
// Audit Logs & Metrics (SaaS Monitoring)
// ============================================================
export const audit = {
  getLogs: () =>
    request('GET', '/api/audit'),

  getMetrics: () =>
    request('GET', '/api/audit/metrics'),
};

// ============================================================
// Config (Dynamic Brands & Categories)
// ============================================================
export const config = {
  categories: {
    getAll: () => request('GET', '/api/config/categories'),
    create: (data) => request('POST', '/api/config/categories', data),
    update: (id, data) => request('PUT', `/api/config/categories/${id}`, data),
    delete: (id) => request('DELETE', `/api/config/categories/${id}`),
  },
  brands: {
    getAll: () => request('GET', '/api/config/brands'),
    create: (data) => request('POST', '/api/config/brands', data),
    update: (id, data) => request('PUT', `/api/config/brands/${id}`, data),
    delete: (id) => request('DELETE', `/api/config/brands/${id}`),
  }
};

// ============================================================
// Pricing Tiers (Niveles de Cliente Comercial)
// ============================================================
export const pricingTiers = {
  getAll: () => request('GET', '/api/pricing-tiers'),
  create: (data) => request('POST', '/api/pricing-tiers', data),
  update: (id, data) => request('PUT', `/api/pricing-tiers/${id}`, data),
  delete: (id) => request('DELETE', `/api/pricing-tiers/${id}`),
};
