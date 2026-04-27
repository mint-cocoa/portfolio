import React, { useState, useEffect, useCallback } from 'react';
import { GlobalStatusBar } from './components/GlobalStatusBar';
import { ProxmoxWidget } from './components/ProxmoxWidget';
import { KubernetesWidget } from './components/KubernetesWidget';
import { ArchitectureView } from './components/ArchitectureView';
import { fetchHealth, fetchProxmoxNodes, fetchProxmoxResources, fetchPrometheusTargets, fetchPrometheusQuery } from './api';

function App() {
  const [health, setHealth] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [vms, setVms] = useState([]);
  const [targets, setTargets] = useState(null);
  const [argocdMetrics, setArgocdMetrics] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const h = await fetchHealth().catch(()=>({ status: 'error' }));
      setHealth(h);
      
      const n = await fetchProxmoxNodes().catch(()=>({ data: [] }));
      if(n.data) setNodes(n.data);

      const r = await fetchProxmoxResources('vm').catch(()=>({ data: [] }));
      if(r.data) setVms(r.data.filter(res => res.type === 'qemu'));

      const t = await fetchPrometheusTargets().catch(()=>({ data: { activeTargets: [] } }));
      if(t.data) setTargets(t.data);

      // ArgoCD 앱 동기화/헬스 상태 조회
      const a = await fetchPrometheusQuery('argocd_app_info').catch(()=>({ data: { result: [] } }));
      if(a.data?.result) setArgocdMetrics(a.data.result);

      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
      <GlobalStatusBar health={health} onRefresh={loadData} lastUpdated={lastUpdated} />
      
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
        {loading && !lastUpdated ? (
          <div className="flex items-center justify-center p-12 text-gray-400">Loading resources...</div>
        ) : (
          <>
            <div className="text-xl font-bold text-gray-800 border-b border-gray-300 pb-2 flex items-center gap-2">
               Infrastructure Architecture
            </div>
            <ArchitectureView vms={vms} targets={targets} argocdMetrics={argocdMetrics} />

            <div className="text-xl font-bold text-gray-800 border-b border-gray-300 pb-2 pt-4 flex items-center gap-2 mt-4">
               Dashboard Details
            </div>
            <ProxmoxWidget nodes={nodes} vms={vms} />
            <KubernetesWidget targets={targets || {}} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
