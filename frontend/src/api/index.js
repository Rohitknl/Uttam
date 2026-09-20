import axios from 'axios';

const client = axios.create({ baseURL: '/api' });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('ul_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ul_token');
      localStorage.removeItem('ul_user');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export const authApi = {
  login: (data) => client.post('/auth/login', data).then(r => r.data),
  me: () => client.get('/auth/me').then(r => r.data),
  updateMe: (data) => client.put('/auth/me', data).then(r => r.data),
  changePassword: (data) => client.post('/auth/change-password', data).then(r => r.data),
};



export const herbCodesApi = {
  getAll: (search) => client.get('/herb-codes', { params: { search } }).then(r => r.data),
  getAvailable: (search) => client.get('/herb-codes/available', { params: { search } }).then(r => r.data),
  getById: (id) => client.get(`/herb-codes/${id}`).then(r => r.data),
  create: (data) => client.post('/herb-codes', data).then(r => r.data),
  update: (id, data) => client.put(`/herb-codes/${id}`, data).then(r => r.data),
  delete: (id, data) => client.delete(`/herb-codes/${id}`, { data }).then(r => r.data),
};

export const medicineCodesApi = {
  getAll: (search) => client.get('/medicine-codes', { params: { search } }).then(r => r.data),
  getAvailable: () => client.get('/medicine-codes/available').then(r => r.data),
  getById: (id) => client.get(`/medicine-codes/${id}`).then(r => r.data),
  getRecipe: (id) => client.get(`/medicine-codes/${id}/recipe`).then(r => r.data),
  updateRecipe: (id, data) => client.put(`/medicine-codes/${id}/recipe`, data).then(r => r.data),
  create: (data) => client.post('/medicine-codes', data).then(r => r.data),
  update: (id, data) => client.put(`/medicine-codes/${id}`, data).then(r => r.data),
  delete: (id, data) => client.delete(`/medicine-codes/${id}`, { data }).then(r => r.data),
};

export const herbsApi = {
  getAll: (params) => client.get('/herbs', { params }).then(r => r.data),
  getById: (id) => client.get(`/herbs/${id}`).then(r => r.data),
  ensureFromCode: (herbCodeId) => client.post('/herbs/from-code', { herbCodeId }).then(r => r.data),
  create: (data) => client.post('/herbs', data).then(r => r.data),
  update: (id, data) => client.put(`/herbs/${id}`, data).then(r => r.data),
  delete: (id, data) => client.delete(`/herbs/${id}`, { data }).then(r => r.data),
};

export const billsApi = {
  getAll: (search) => client.get('/bills', { params: { search } }).then(r => r.data),
  getById: (id) => client.get(`/bills/${id}`).then(r => r.data),
  create: (data) => client.post('/bills', data).then(r => r.data),
  update: (id, data) => client.put(`/bills/${id}`, data).then(r => r.data),
  updateLine: (billId, lineId, data) => client.put(`/bills/${billId}/lines/${lineId}`, data).then(r => r.data),
  deleteLine: (billId, lineId) => client.delete(`/bills/${billId}/lines/${lineId}`),
  delete: (id) => client.delete(`/bills/${id}`),
};

export const medicinesApi = {
  getAll: (params) => client.get('/medicines', { params }).then(r => r.data),
  getById: (id) => client.get(`/medicines/${id}`).then(r => r.data),
  create: (data) => client.post('/medicines', data).then(r => r.data),
  update: (id, data) => client.put(`/medicines/${id}`, data).then(r => r.data),
  delete: (id, data) => client.delete(`/medicines/${id}`, { data }).then(r => r.data),
};

export const formulasApi = {
  validate: (data) => client.post('/formulas/validate', data).then(r => r.data),
  generate: (data) => client.post('/formulas/generate', data).then(r => r.data),
  save: (data) => client.post('/formulas/save', data).then(r => r.data),
  consume: (data) => client.post('/formulas/consume', data).then(r => r.data),
};

export const ordersApi = {
  create: (data) => client.post('/orders', data).then(r => r.data),
  getAll: () => client.get('/orders').then(r => r.data),
  getMine: () => client.get('/orders/mine').then(r => r.data),
  approve: (id) => client.post(`/orders/${id}/approve`).then(r => r.data),
  reject: (id, reason) => client.post(`/orders/${id}/reject`, { reason }).then(r => r.data),
  dispatch: (id) => client.post(`/orders/${id}/dispatch`).then(r => r.data),
};

export const inventoryApi = {
  query: (params) => client.get('/inventory/query', { params }).then(r => r.data),
};

export const analyticsApi = {
  admin: () => client.get('/analytics/admin').then(r => r.data),
  dealer: () => client.get('/analytics/dealer').then(r => r.data),
};

export const backupApi = {
  destinations: () => client.get('/backup/destinations').then(r => r.data),
  list: (destinationId) => client.get('/backup/list', { params: { destinationId } }).then(r => r.data),
  create: (destinationId, crudPassword) => client.post('/backup/create', { destinationId, crudPassword }).then(r => r.data),
  restore: (destinationId, fileName, crudPassword) => client.post('/backup/restore', { destinationId, fileName, crudPassword }).then(r => r.data),
};

export const settingsApi = {
  security: () => client.get('/settings/security').then(r => r.data),
  setCrudPassword: (data) => client.post('/settings/crud-password', data).then(r => r.data),
};

export default client;
