import { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, Boxes, Cpu, Database, Server } from 'lucide-react';
import { GlobalStatusBar } from './components/GlobalStatusBar';
import { ProxmoxWidget } from './components/ProxmoxWidget';
import { KubernetesWidget } from './components/KubernetesWidget';
import { ArchitectureView } from './components/ArchitectureView';
import { EdgeRuntimePanel } from './components/EdgeRuntimePanel';
import {
  createOpsStream,
  fetchEdgeRuntime,
  fetchHealth,
  fetchProxmoxNodes,
  fetchProxmoxResources,
  fetchPrometheusQuery,
  fetchPrometheusSummary,
  fetchPrometheusTargets,
} from './api';

const StatCard = ({ label, value, detail, icon: Icon, tone = 'blue' }) => {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    purple: 'border-purple-200 bg-purple-50 text-purple-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`rounded-lg border p-2 ${tones[tone] ?? tones.blue}`}>
          <Icon size={22} />
        </div>
      </div>
      <p className="mt-3 text-sm text-gray-500">{detail}</p>
    </div>
  );
};

function App() {
  const [health, setHealth] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [vms, setVms] = useState([]);
  const [targets, setTargets] = useState(null);
  const [prometheusSummary, setPrometheusSummary] = useState(null);
  const [argocdMetrics, setArgocdMetrics] = useState([]);
  const [edgeRuntime, setEdgeRuntime] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streamStatus, setStreamStatus] = useState('connecting');
  const streamStatusRef = useRef('connecting');

  const updateStreamStatus = useCallback((status) => {
    streamStatusRef.current = status;
    setStreamStatus(status);
  }, []);

  const applySnapshot = useCallback((snapshot) => {
    if (snapshot.health?.ok) {
      const payload = snapshot.health.data;
      setHealth({
        ...payload,
        status: payload.ok ? 'ok' : 'error',
        details: {
          prometheus: { status: payload.prometheus === 'ok' ? 'ok' : 'error', value: payload.prometheus },
          proxmox: { status: payload.proxmox === 'ok' ? 'ok' : 'error', value: payload.proxmox },
        },
      });
    }
    if (snapshot.proxmoxNodes?.ok) {
      setNodes(snapshot.proxmoxNodes.data.nodes ?? []);
    }
    if (snapshot.proxmoxVMs?.ok) {
      setVms((snapshot.proxmoxVMs.data.resources ?? []).filter((res) => res.type === 'qemu'));
    }
    if (snapshot.prometheusTargets?.ok) {
      const payload = snapshot.prometheusTargets.data;
      const activeTargets = payload.targets ?? payload.data?.activeTargets ?? [];
      setTargets({
        ...payload,
        activeTargets,
        data: { ...(payload.data ?? {}), activeTargets },
      });
    }
    if (snapshot.prometheusSummary?.ok) {
      setPrometheusSummary(snapshot.prometheusSummary.data);
    }
    if (snapshot.argocdAppInfo?.ok) {
      setArgocdMetrics(snapshot.argocdAppInfo.data.data?.result ?? []);
    }
    if (snapshot.edgeRuntime?.ok) {
      setEdgeRuntime(snapshot.edgeRuntime.data);
    }

    const failed = [
      snapshot.health,
      snapshot.proxmoxNodes,
      snapshot.proxmoxVMs,
      snapshot.prometheusTargets,
      snapshot.prometheusSummary,
      snapshot.argocdAppInfo,
      snapshot.edgeRuntime,
    ].filter((result) => result && !result.ok);

    setError(failed.length ? failed.map((result) => result.error).join(' · ') : null);
    setLastUpdated(new Date((snapshot.generatedAt ?? Date.now() / 1000) * 1000));
    setLoading(false);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, n, r, t, p, a, e] = await Promise.all([
        fetchHealth(),
        fetchProxmoxNodes(),
        fetchProxmoxResources('vm'),
        fetchPrometheusTargets(),
        fetchPrometheusSummary(),
        fetchPrometheusQuery('argocd_app_info').catch(() => ({ data: { result: [] } })),
        fetchEdgeRuntime(),
      ]);

      setHealth(h);
      setNodes(n);
      setVms(r.filter((res) => res.type === 'qemu'));
      setTargets(t);
      setPrometheusSummary(p);
      setArgocdMetrics(a.data?.result ?? []);
      setEdgeRuntime(e);

      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let stopped = false;
    let reconnect = null;
    let socket = null;

    const connect = () => {
      if (stopped) return;
      updateStreamStatus('connecting');
      socket = createOpsStream();

      socket.onopen = () => {
        updateStreamStatus('connected');
      };
      socket.onmessage = (event) => {
        try {
          applySnapshot(JSON.parse(event.data));
        } catch (err) {
          console.error(err);
          setError(`Ops stream payload parse failed: ${err.message}`);
        }
      };
      socket.onerror = () => {
        updateStreamStatus('degraded');
      };
      socket.onclose = () => {
        if (stopped) return;
        updateStreamStatus('reconnecting');
        reconnect = setTimeout(connect, 5000);
      };
    };

    const initialLoad = setTimeout(loadData, 0);
    connect();
    const interval = setInterval(() => {
      if (streamStatusRef.current !== 'connected') {
        loadData();
      }
    }, 30000);

    return () => {
      stopped = true;
      clearTimeout(initialLoad);
      clearTimeout(reconnect);
      clearInterval(interval);
      if (socket) {
        socket.close();
      }
    };
  }, [applySnapshot, loadData, updateStreamStatus]);

  const activeTargets = targets?.activeTargets ?? [];
  const healthyTargets = activeTargets.filter((target) => target.health === 'up').length;
  const runningVms = vms.filter((vm) => vm.status === 'running').length;
  const node = nodes[0];
  const podCount = prometheusSummary?.series?.pods ?? '-';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      <GlobalStatusBar health={health} onRefresh={loadData} lastUpdated={lastUpdated} />
      
      <main className="flex-1 p-4 sm:p-6 max-w-[1500px] mx-auto w-full flex flex-col gap-6">
        {loading && !lastUpdated ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-slate-400">
            Loading resources...
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Ops API fetch failed: {error}
              </div>
            )}

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Prometheus Targets"
                value={`${healthyTargets}/${activeTargets.length}`}
                detail="healthy / total scrape targets"
                icon={Activity}
                tone="green"
              />
              <StatCard
                label="Kubernetes Pods"
                value={podCount}
                detail={`${prometheusSummary?.series?.deployments ?? '-'} deployments observed`}
                icon={Boxes}
              />
              <StatCard
                label="Proxmox VMs"
                value={`${runningVms}/${vms.length}`}
                detail="running / total qemu resources"
                icon={Server}
                tone="purple"
              />
              <StatCard
                label="PVE Node"
                value={node?.node ?? '-'}
                detail={node ? `${node.status} · ${((node.cpu ?? 0) * 100).toFixed(1)}% CPU` : 'waiting for node data'}
                icon={Cpu}
                tone="amber"
              />
            </section>

            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-300 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live topology</p>
                <h2 className="text-2xl font-bold text-slate-900">Infrastructure Architecture</h2>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                <Database size={14} />
                ops-api.mintcocoa.cc · {streamStatus}
              </div>
            </div>
            <ArchitectureView vms={vms} targets={targets} argocdMetrics={argocdMetrics} edgeRuntime={edgeRuntime} />
            <EdgeRuntimePanel edgeRuntime={edgeRuntime} />

            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-300 pb-3 pt-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inventory</p>
                <h2 className="text-2xl font-bold text-slate-900">Dashboard Details</h2>
              </div>
            </div>
            <ProxmoxWidget nodes={nodes} vms={vms} />
            <KubernetesWidget summary={prometheusSummary} targets={targets || {}} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
