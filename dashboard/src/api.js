const API_BASE = 'https://ops-api.mintcocoa.cc/api';

export const fetchHealth = () => fetch(`${API_BASE}/health`).then(r => r.json());
export const fetchSummary = () => fetch(`${API_BASE}/ops/summary`).then(r => r.json());
export const fetchPrometheusSummary = () => fetch(`${API_BASE}/prometheus/summary`).then(r => r.json());
export const fetchPrometheusTargets = () => fetch(`${API_BASE}/prometheus/targets`).then(r => r.json());
export const fetchPrometheusQuery = (query) => fetch(`${API_BASE}/prometheus/query?query=${encodeURIComponent(query)}`).then(r => r.json());
export const fetchProxmoxNodes = () => fetch(`${API_BASE}/proxmox/nodes`).then(r => r.json());
export const fetchProxmoxVersion = () => fetch(`${API_BASE}/proxmox/version`).then(r => r.json());
export const fetchProxmoxResources = (type) => fetch(`${API_BASE}/proxmox/resources${type ? `?type=${type}` : ''}`).then(r => r.json());
