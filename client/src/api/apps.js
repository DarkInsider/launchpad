import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export const fetchApps = () => api.get('/apps').then((r) => r.data);
export const fetchApp = (id) => api.get(`/apps/${id}`).then((r) => r.data);
export const createApp = (data) => api.post('/apps', data).then((r) => r.data);
export const updateApp = (id, data) => api.put(`/apps/${id}`, data).then((r) => r.data);
export const deleteApp = (id) => api.delete(`/apps/${id}`).then((r) => r.data);
export const startApp = (id) => api.post(`/apps/${id}/start`, null, { timeout: 300000 }).then((r) => r.data);
export const stopApp = (id) => api.post(`/apps/${id}/stop`).then((r) => r.data);
export const restartApp = (id) => api.post(`/apps/${id}/restart`).then((r) => r.data);
export const redeployApp = (id) => api.post(`/apps/${id}/redeploy`, null, { timeout: 300000 }).then((r) => r.data);
export const fetchStatus = (id) => api.get(`/apps/${id}/status`).then((r) => r.data);
export const fetchLogs = (id, lines = 100) =>
  api.get(`/apps/${id}/logs`, { params: { lines } }).then((r) => r.data);

