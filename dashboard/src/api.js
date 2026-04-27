const API_BASE = 'https://ops-api.mintcocoa.cc/api';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

const getJson = async (path) => {
  const response = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = payload.detail ?? `${response.status} ${response.statusText}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  return payload;
};

export const fetchHealth = async () => {
  const payload = await getJson('/health');
  return {
    ...payload,
    status: payload.ok ? 'ok' : 'error',
    details: {
      prometheus: { status: payload.prometheus === 'ok' ? 'ok' : 'error', value: payload.prometheus },
      proxmox: { status: payload.proxmox === 'ok' ? 'ok' : 'error', value: payload.proxmox },
    },
  };
};

export const fetchSummary = () => getJson('/ops/summary');
export const fetchPrometheusSummary = () => getJson('/prometheus/summary');

export const fetchPrometheusTargets = async () => {
  const payload = await getJson('/prometheus/targets');
  const activeTargets = payload.targets ?? payload.data?.activeTargets ?? [];
  return {
    ...payload,
    activeTargets,
    data: { ...(payload.data ?? {}), activeTargets },
  };
};

export const fetchPrometheusQuery = (query) => getJson(`/prometheus/query?query=${encodeURIComponent(query)}`);

export const fetchProxmoxNodes = async () => {
  const payload = await getJson('/proxmox/nodes');
  return payload.nodes ?? payload.data ?? [];
};

export const fetchProxmoxVersion = () => getJson('/proxmox/version');

export const fetchProxmoxResources = async (type) => {
  const payload = await getJson(`/proxmox/resources${type ? `?type=${type}` : ''}`);
  return payload.resources ?? payload.data ?? [];
};

export const createOpsStream = () => new WebSocket(`${WS_BASE}/ops/stream`);
