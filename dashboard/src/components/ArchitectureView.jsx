import React from 'react';
import { Server, Database, Globe, Network, HardDrive, Cpu, Box, Cloud, ArrowRight, ArrowDown, Shield, Settings, GitBranch } from 'lucide-react';

const VmCard = ({ vm, type }) => {
  if (!vm) return null;
  
  const isRunning = vm.status === 'running';
  
  // 타입에 따른 색상 테마 (다이어그램 반영)
  let theme = 'border-gray-300 bg-gray-50';
  let iconColor = 'text-gray-500';
  if (type === 'cp') {
    theme = isRunning ? 'border-blue-400 bg-blue-50' : 'border-blue-200 bg-gray-50 text-gray-400';
    iconColor = isRunning ? 'text-blue-500' : 'text-gray-400';
  } else if (type === 'worker') {
    theme = isRunning ? 'border-green-400 bg-green-50' : 'border-green-200 bg-gray-50 text-gray-400';
    iconColor = isRunning ? 'text-green-500' : 'text-gray-400';
  } else if (type === 'storage') {
    theme = isRunning ? 'border-purple-400 bg-purple-50' : 'border-purple-200 bg-gray-50 text-gray-400';
    iconColor = isRunning ? 'text-purple-500' : 'text-gray-400';
  }

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border-2 shadow-sm ${theme} mb-2`}>
      <div className="flex items-center gap-3">
        <Server className={iconColor} size={20} />
        <div>
          <div className="font-bold text-sm">{vm.name} <span className="text-xs font-normal opacity-70">({vm.vmid})</span></div>
          <div className="text-xs opacity-75">{isRunning ? 'running' : 'stopped'}</div>
        </div>
      </div>
      {isRunning && (
        <div className="text-right text-xs">
          <div>CPU: {(vm.cpu * 100).toFixed(1)}%</div>
          <div>MEM: {(vm.mem / vm.maxmem * 100).toFixed(0)}%</div>
        </div>
      )}
    </div>
  );
};

const IngressRule = ({ name, domain, targetData }) => {
  // 실제 프로메테우스 타겟 중에서 해당 서비스와 연관된 것이 있는지 판별 (단순화)
  const isHealthy = targetData?.activeTargets?.some(t => t.health === 'up' && t.discoveredLabels?.['__meta_kubernetes_pod_name']?.includes(name)) ?? true;

  return (
    <div className="border border-green-300 bg-white rounded-md p-2 text-center text-xs shadow-sm">
      <Globe className="mx-auto text-green-600 mb-1" size={16} />
      <div className="font-semibold text-gray-800 break-words">{domain}</div>
      <div className="text-green-600 mt-1 flex items-center justify-center gap-1">
        <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`}></div>
        {isHealthy ? 'Healthy' : 'Down'}
      </div>
    </div>
  );
};

export const ArchitectureView = ({ vms = [], targets = {}, argocdMetrics = [], className = '' }) => {
  // VM들을 역할에 따라 분류
  const cpVms = vms.filter(vm => vm.name?.includes('cp')).sort((a,b)=> a.name.localeCompare(b.name));
  const workerVms = vms.filter(vm => vm.name?.includes('worker')).sort((a,b)=> a.name.localeCompare(b.name));
  const storageVms = vms.filter(vm => vm.name?.toLowerCase().includes('omv') || vm.name?.toLowerCase().includes('nas'));

  // 다이나믹 ArgoCD 메트릭 분석
  const totalApps = argocdMetrics.length;
  const syncedApps = argocdMetrics.filter(m => m.metric?.sync_status === 'Synced').length;
  const isAllSynced = totalApps > 0 && syncedApps === totalApps;

  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      {/* Top Main Diagram row */}
      <div className="flex flex-col xl:flex-row gap-6">
        
        {/* Left Column: Edge Plane & Flow */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Edge Plane Block */}
          <div className="border-2 border-orange-300 rounded-xl p-4 bg-orange-50/20 relative">
            <div className="absolute -top-3 left-4 bg-gray-100 px-2 text-sm font-bold text-orange-600 flex items-center gap-1">
              <Network size={16} /> Edge Plane
            </div>
            
            <div className="text-xs text-center text-blue-600 font-semibold mb-1 mt-2">80/443 port-forward</div>
            <div className="flex items-center justify-center gap-3 mb-4">
              <Globe size={32} className="text-blue-500" />
              <ArrowRight size={16} className="text-gray-400" />
              <div className="bg-white border-2 border-gray-800 rounded-lg px-4 py-2 font-bold flex items-center gap-2 text-sm shadow-sm">
                 <HardDrive size={16} className="text-gray-700"/> Home Router
              </div>
              <ArrowRight size={16} className="text-gray-400" />
              <div className="bg-gray-800 text-white rounded-lg px-4 py-2 text-center shadow-sm">
                 <div className="font-bold text-sm">Edge Proxy</div>
                 <div className="text-xs text-gray-400">172.30.1.27</div>
              </div>
            </div>
            
            <div className="flex justify-between px-8 text-xs text-gray-600 mt-2">
               <div>• HTTPS reverse proxy</div>
               <div>• Kubernetes API HAProxy :6443</div>
            </div>
          </div>
          
          {/* Workload Entry / Ingress Block */}
          <div className="border border-green-300 rounded-xl p-0 bg-green-50/30 w-3/4 mx-auto flex flex-col items-center">
             <div className="w-px h-6 bg-green-500 mb-2"></div>
             
             <div className="bg-white border-2 border-green-400 rounded-lg p-3 text-center mb-3 shadow-sm w-48 text-sm">
                <div className="font-bold text-green-800">Workload Entry</div>
                <div className="text-gray-500 text-xs">MetalLB VIP</div>
                <div className="text-green-600 font-medium">172.30.1.240</div>
             </div>
             
             <div className="w-px h-6 bg-green-500 mb-2"></div>
             
             <div className="bg-white border-2 border-green-500 rounded-lg p-3 text-center shadow-sm w-48 text-sm">
                <div className="font-bold text-green-800 flex justify-center items-center gap-1">
                   <span className="bg-green-600 text-white px-1.5 py-0.5 rounded mr-1 text-[10px]">N</span> ingress-nginx
                </div>
                <div className="text-gray-500 text-xs mt-1">LoadBalancer</div>
                <div className="text-green-600 font-medium text-[11px]">172.30.1.240:80/443</div>
             </div>
          </div>

          <div className="border-2 border-green-300 bg-white rounded-xl p-4 mt-2">
             <div className="text-sm font-bold text-green-700 mb-3 text-center">Kubernetes Ingress Rules</div>
             <div className="grid grid-cols-2 shadow-sm gap-2">
               <IngressRule name="portfolio" domain="portfolio.mintcocoa.cc" targetData={targets} />
               <IngressRule name="demo" domain="demo.mintcocoa.cc" targetData={targets} />
               <IngressRule name="grafana" domain="grafana.homelab.local" targetData={targets} />
               <IngressRule name="argocd" domain="argocd.homelab.local" targetData={targets} />
             </div>
          </div>
        </div>

        {/* Middle Column: Kubernetes API Arrow flow */}
        <div className="hidden xl:flex flex-col items-center pt-16 z-10 w-1/4">
             <ArrowRight size={24} className="text-blue-400 mb-4" />
             <div className="border-2 border-blue-400 rounded-xl bg-white p-4 text-center shadow-sm w-full">
                <h3 className="font-bold text-blue-700 text-sm mb-1">Kubernetes API</h3>
                <div className="text-blue-500 text-xs font-bold mb-3">172.30.1.27:6443</div>
                <Cloud size={48} className="text-blue-500 mx-auto mb-3" />
                <div className="text-left text-[11px] text-blue-800 space-y-1 bg-blue-50 p-2 rounded">
                  <div>→ k8s-cp-1: 6443</div>
                  <div>→ k8s-cp-2: 6443</div>
                  <div>→ k8s-cp-3: 6443</div>
                </div>
             </div>
             <ArrowRight size={24} className="text-blue-400 mt-4" />
        </div>

        {/* Right Column: Physical / VM Architecture */}
        <div className="flex-1 border-2 border-orange-400 rounded-xl p-5 bg-white relative">
          <div className="absolute top-4 right-4 text-orange-500 font-bold italic text-sm flex flex-col items-end opacity-90">
            <span className="text-xl tracking-wider">PROXMOX</span>
          </div>
          <div className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
            Proxmox VE
          </div>
          <div className="text-sm font-semibold text-gray-500 mb-6">172.30.1.12</div>

          <div className="space-y-4">
            {/* Control Plane Group */}
            <div className="relative border-l-2 border-blue-200 pl-4 py-1">
               <h3 className="text-xs font-bold text-blue-700 mb-2 absolute -left-1 -top-3 bg-white pr-2">Control Plane</h3>
               {cpVms.length > 0 ? cpVms.map(vm => <VmCard key={vm.vmid} vm={vm} type="cp" />) : <div className="text-xs text-gray-500">No VMs found</div>}
            </div>

            {/* Worker Group */}
            <div className="relative border-l-2 border-green-200 pl-4 pt-3 pb-1">
               <h3 className="text-xs font-bold text-green-700 mb-2 absolute -left-1 -top-1 bg-white pr-2">Worker Nodes</h3>
               {workerVms.length > 0 ? workerVms.map(vm => <VmCard key={vm.vmid} vm={vm} type="worker" />) : <div className="text-xs text-gray-500">No VMs found</div>}
            </div>

            {/* Storage Group */}
            <div className="relative border-l-2 border-purple-200 pl-4 pt-3 pb-1">
               <h3 className="text-xs font-bold text-purple-700 mb-2 absolute -left-1 -top-1 bg-white pr-2">Storage VM</h3>
               {storageVms.length > 0 ? storageVms.map(vm => <VmCard key={vm.vmid} vm={vm} type="storage" />) : <div className="text-xs text-gray-500">No VMs found</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Panels (Management, Storage, GitOps) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        {/* Management Plane */}
        <div className="border border-purple-300 rounded-xl p-4 bg-purple-50/30">
           <div className="text-xs font-bold text-purple-800 mb-2 flex items-center gap-1"><Shield size={14}/> Management Plane (Out-of-Cluster)</div>
           <div className="text-xs font-semibold text-gray-700 mb-3">Odroid Management Node (172.30.1.83)</div>
           <div className="bg-white rounded p-2 text-[11px] space-y-2 border border-purple-100">
             <div className="flex items-center gap-2"><span className="bg-gray-800 text-white px-1 rounded text-[9px] w-14 text-center">Terraform</span> → Proxmox API</div>
             <div className="flex items-center gap-2"><span className="bg-gray-800 text-white px-1 rounded text-[9px] w-14 text-center">Ansible</span> → Kubernetes VMs</div>
             <div className="flex items-center gap-2"><span className="bg-blue-600 text-white px-1 rounded text-[9px] w-14 text-center">kubectl</span> → Kubernetes API</div>
           </div>
        </div>

        {/* Storage Path */}
        <div className="border border-purple-300 rounded-xl p-4 bg-white flex flex-col items-center justify-center">
           <div className="text-xs font-bold text-purple-800 mb-4">Storage Path</div>
           <div className="flex items-center gap-2 text-xs text-gray-600 font-medium">
             <div className="flex flex-col items-center"><Box size={24} className="text-blue-500 mb-1"/> Pod</div>
             <ArrowRight size={12} />
             <div className="flex flex-col items-center"><Database size={24} className="text-blue-400 mb-1"/> PVC</div>
             <ArrowRight size={12} />
             <div className="flex flex-col items-center"><HardDrive size={24} className="text-green-500 mb-1"/> NFS</div>
             <ArrowRight size={12} />
             <div className="flex flex-col items-center"><Server size={24} className="text-purple-600 mb-1"/> NAS VM (1.52)</div>
           </div>
        </div>

        {/* GitOps Deployment */}
        <div className="border border-indigo-300 rounded-xl p-4 bg-white flex flex-col justify-between">
           <div className="text-xs font-bold text-indigo-800 mb-2 flex items-center gap-1">
             <GitBranch size={14}/> GitOps Deployment Path
           </div>
           
           {/* CI/CD 파이프라인 시각화 */}
           <div className="flex items-center justify-center gap-1 sm:gap-2 text-[10px] text-gray-600 font-medium whitespace-nowrap overflow-hidden my-auto">
             <div className="flex flex-col items-center"><Settings size={18} className="mb-1 text-gray-500"/> Dev</div>
             <ArrowRight size={10} className="hidden sm:block" />
             <div className="flex flex-col items-center"><Globe size={18} className="mb-1 text-gray-700"/> GitHub</div>
             <ArrowRight size={10} className="hidden sm:block" />
             <div className="flex flex-col items-center"><Box size={18} className="mb-1 text-blue-400"/> GHCR</div>
             <ArrowRight size={10} className="text-indigo-400" />
             
             {/* ArgoCD Status Block */}
             <div className={`flex flex-col items-center p-1.5 rounded border ${totalApps > 0 && isAllSynced ? 'border-green-400 bg-green-50' : 'border-orange-300 bg-orange-50'}`}>
               <Shield size={18} className={`mb-1 ${totalApps > 0 && isAllSynced ? 'text-green-500' : 'text-orange-500'}`}/> 
               <span className="text-indigo-900 font-bold">ArgoCD</span>
               {totalApps > 0 && (
                 <div className="flex items-center gap-1 mt-0.5">
                   <div className={`w-1.5 h-1.5 rounded-full ${isAllSynced ? 'bg-green-500' : 'bg-orange-500'} animate-pulse`}></div>
                   <span className="text-[8px]">{syncedApps}/{totalApps} Apps</span>
                 </div>
               )}
             </div>
             
             <ArrowRight size={10} className="text-indigo-400" />
             <div className="flex flex-col items-center"><Cloud size={18} className="mb-1 text-blue-500"/> K8s</div>
           </div>
           
           {totalApps === 0 && (
             <div className="text-[9px] text-gray-400 text-center mt-2 italic">Awaiting argocd_app_info metrics...</div>
           )}
        </div>
      </div>
    </div>
  );
};
