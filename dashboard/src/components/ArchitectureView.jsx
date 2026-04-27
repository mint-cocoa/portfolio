import {
  ArrowRight,
  Box,
  Cloud,
  Database,
  GitBranch,
  Globe,
  HardDrive,
  Network,
  Route,
  Server,
  Settings,
  Shield,
  ShieldCheck,
} from 'lucide-react';

const ingressRules = [
  { name: 'portfolio', domain: 'portfolio.mintcocoa.cc', service: 'portfolio', note: 'portfolio' },
  { name: 'dropapp', domain: 'dropapp.mintcocoa.cc', service: 'dropapp', note: 'app route' },
  { name: 'webhook', domain: 'webhook.mintcocoa.cc', service: 'webhook', note: 'webhook' },
  { name: 'argocd', domain: 'argocd.homelab.local', service: 'argocd-server', note: 'private UI' },
];

const formatPercent = (value) => (
  Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-'
);

const findIngressTarget = (targetData, rule) => (
  targetData?.activeTargets?.find((target) => {
    const labels = target.discoveredLabels ?? target.labels ?? {};
    return [
      labels.__meta_kubernetes_pod_name,
      labels.__meta_kubernetes_service_name,
      labels.job,
      labels.instance,
    ].some((value) => value?.includes(rule.service) || value?.includes(rule.name));
  })
);

const statusStyles = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  green: 'border-green-200 bg-green-50 text-green-700',
  purple: 'border-purple-200 bg-purple-50 text-purple-700',
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
};

const StatusPill = ({ tone = 'slate', children }) => (
  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusStyles[tone] ?? statusStyles.slate}`}>
    {children}
  </span>
);

const SectionHeader = ({ eyebrow, title, detail, badge }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{eyebrow}</div>
      <h3 className="mt-1 text-lg font-bold text-slate-900">{title}</h3>
      {detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}
    </div>
    {badge}
  </div>
);

const Hop = ({ icon: Icon, label, detail, tone = 'slate' }) => (
  <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex items-center gap-2">
      <div className={`rounded-md border p-1.5 ${statusStyles[tone] ?? statusStyles.slate}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-slate-900">{label}</div>
        <div className="truncate text-[11px] text-slate-500">{detail}</div>
      </div>
    </div>
  </div>
);

const RouteRow = ({ rule, targetData, edgeRoutes }) => {
  const route = edgeRoutes.find((item) => item.hostname === rule.domain);
  const target = findIngressTarget(targetData, rule);
  const isPublicEdge = Boolean(route);
  const isObserved = target?.health === 'up';
  const status = isPublicEdge ? 'Public edge' : isObserved ? 'Observed' : 'Cluster only';
  const tone = isPublicEdge ? 'green' : isObserved ? 'blue' : 'slate';

  return (
    <div className="grid grid-cols-[minmax(0,1.25fr)_auto_minmax(96px,0.8fr)] items-center gap-3 border-b border-slate-100 py-2 text-xs last:border-b-0">
      <div className="min-w-0">
        <div className="truncate font-bold text-slate-900">{rule.domain}</div>
        <div className="text-[11px] text-slate-500">{rule.note}</div>
      </div>
      <StatusPill tone={tone}>{status}</StatusPill>
      <div className="min-w-0 text-right">
        <div className="truncate font-medium text-slate-700">{route?.upstream ?? 'private'}</div>
        <div className="truncate text-[11px] text-slate-400">{route?.destination ?? target?.health ?? 'not published'}</div>
      </div>
    </div>
  );
};

const VmCard = ({ vm, type }) => {
  if (!vm) return null;

  const running = vm.status === 'running';
  const tone = type === 'cp' ? 'blue' : type === 'worker' ? 'green' : 'purple';
  const iconClass = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-purple-600',
  }[tone];

  return (
    <div className={`grid grid-cols-[1fr_auto] gap-3 rounded-lg border bg-white p-3 text-xs shadow-sm ${running ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
      <div className="flex min-w-0 items-center gap-2">
        <Server className={iconClass} size={17} />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-900">
            {vm.name} <span className="text-xs font-normal text-slate-500">({vm.vmid})</span>
          </div>
          <div className="text-slate-500">{vm.status ?? 'unknown'}</div>
        </div>
      </div>
      <div className="text-right text-slate-700">
        <div>CPU {formatPercent(vm.cpu)}</div>
        <div>MEM {vm.maxmem ? `${((vm.mem / vm.maxmem) * 100).toFixed(0)}%` : '-'}</div>
      </div>
    </div>
  );
};

const VmGroup = ({ title, tone, vms, type }) => (
  <div>
    <div className={`mb-2 flex items-center justify-between border-l-2 pl-3 text-xs font-bold ${tone}`}>
      <span>{title}</span>
      <span className="font-semibold text-slate-400">{vms.length}</span>
    </div>
    <div className="space-y-2">
      {vms.length > 0 ? vms.map((vm) => <VmCard key={vm.vmid} vm={vm} type={type} />) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">No VMs found</div>
      )}
    </div>
  </div>
);

const SummaryMetric = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
    <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
    <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
  </div>
);

export const ArchitectureView = ({ vms = [], targets = {}, argocdMetrics = [], edgeRuntime = null, className = '' }) => {
  const cpVms = vms.filter((vm) => vm.name?.includes('cp')).sort((a, b) => a.name.localeCompare(b.name));
  const workerVms = vms.filter((vm) => vm.name?.includes('worker')).sort((a, b) => a.name.localeCompare(b.name));
  const storageVms = vms.filter((vm) => vm.name?.toLowerCase().includes('omv') || vm.name?.toLowerCase().includes('nas'));
  const runningVms = vms.filter((vm) => vm.status === 'running').length;
  const totalApps = argocdMetrics.length;
  const syncedApps = argocdMetrics.filter((metric) => metric.metric?.sync_status === 'Synced').length;
  const isAllSynced = totalApps > 0 && syncedApps === totalApps;
  const edgeRoutes = edgeRuntime?.routes ?? [];
  const proxy = edgeRuntime?.proxy ?? {};
  const kubernetesRoutes = edgeRoutes.filter((route) => route.destination === 'kubernetes').length;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.8fr_1.05fr]">
        <section className="rounded-lg border border-orange-200 bg-white p-4 shadow-sm">
          <SectionHeader
            eyebrow="Edge Plane"
            title="Public traffic and ingress path"
            detail="The C++ proxy terminates TLS and forwards SNI routes to Docker, RuntimeWeb, or Kubernetes."
            badge={<StatusPill tone={proxy.tls?.context_loaded ? 'green' : 'amber'}>{proxy.tls?.context_loaded ? 'TLS loaded' : 'TLS pending'}</StatusPill>}
          />

          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
            <Hop icon={Globe} label="Internet" detail="80/443 forwarded" tone="blue" />
            <ArrowRight className="hidden justify-self-center text-slate-300 md:block" size={18} />
            <Hop icon={HardDrive} label="Home router" detail="port-forward" tone="slate" />
            <ArrowRight className="hidden justify-self-center text-slate-300 md:block" size={18} />
            <Hop icon={Network} label="RuntimeProxy" detail={`${proxy.listen?.host ?? '0.0.0.0'}:${proxy.listen?.port ?? 443}`} tone="amber" />
          </div>

          <div className="mt-4 rounded-lg border border-green-200 bg-green-50/40 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <Hop icon={Route} label="MetalLB VIP" detail="172.30.1.240" tone="green" />
              <ArrowRight className="hidden justify-self-center text-green-400 md:block" size={18} />
              <Hop icon={ShieldCheck} label="ingress-nginx" detail="172.30.1.240:80/443" tone="green" />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-slate-900">Kubernetes ingress exposure</div>
              <StatusPill tone="green">{kubernetesRoutes} edge routes</StatusPill>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3">
              {ingressRules.map((rule) => (
                <RouteRow key={rule.domain} rule={rule} targetData={targets} edgeRoutes={edgeRoutes} />
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-blue-200 bg-white p-4 shadow-sm">
          <SectionHeader
            eyebrow="Kubernetes"
            title="Control and workload entry"
            detail="The edge node also fronts the Kubernetes API HAProxy path."
            badge={<StatusPill tone="blue">API 6443</StatusPill>}
          />

          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
            <Cloud className="mx-auto text-blue-600" size={42} />
            <div className="mt-2 text-lg font-bold text-blue-800">Kubernetes API</div>
            <div className="text-sm font-semibold text-blue-600">172.30.1.27:6443</div>
          </div>

          <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
            {cpVms.map((vm) => (
              <div key={vm.vmid} className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-700">{vm.name}</span>
                <span className="text-blue-600">6443</span>
              </div>
            ))}
            {cpVms.length === 0 && <div className="text-slate-500">Control plane endpoints unavailable.</div>}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <SummaryMetric label="routes" value={edgeRoutes.length || '-'} />
            <SummaryMetric label="workers" value={`${proxy.running_worker_count ?? '-'} / ${proxy.configured_worker_count ?? '-'}`} />
          </div>
        </section>

        <section className="rounded-lg border border-orange-300 bg-white p-4 shadow-sm">
          <SectionHeader
            eyebrow="Proxmox VE"
            title="Virtualized cluster inventory"
            detail="172.30.1.12"
            badge={<StatusPill tone="amber">{runningVms}/{vms.length} running</StatusPill>}
          />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <SummaryMetric label="control" value={cpVms.length} />
            <SummaryMetric label="workers" value={workerVms.length} />
            <SummaryMetric label="storage" value={storageVms.length} />
          </div>
          <div className="mt-4 space-y-4">
            <VmGroup title="Control Plane" tone="border-blue-300 text-blue-700" vms={cpVms} type="cp" />
            <VmGroup title="Worker Nodes" tone="border-green-300 text-green-700" vms={workerVms} type="worker" />
            <VmGroup title="Storage VM" tone="border-purple-300 text-purple-700" vms={storageVms} type="storage" />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-purple-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold text-purple-800">
            <Shield size={14} />
            Management Plane
          </div>
          <div className="text-sm font-semibold text-slate-700">Odroid management node</div>
          <div className="mt-3 space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2"><Settings size={14} /> Terraform to Proxmox API</div>
            <div className="flex items-center gap-2"><Server size={14} /> Ansible to Kubernetes VMs</div>
            <div className="flex items-center gap-2"><Cloud size={14} /> kubectl to API HAProxy</div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 text-xs font-bold text-slate-800">Storage Path</div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
            <Box size={18} className="text-blue-500" /> Pod
            <ArrowRight size={12} />
            <Database size={18} className="text-blue-400" /> PVC
            <ArrowRight size={12} />
            <HardDrive size={18} className="text-green-500" /> NFS
            <ArrowRight size={12} />
            <Server size={18} className="text-purple-600" /> NAS VM
          </div>
        </section>

        <section className="rounded-lg border border-indigo-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-800">
              <GitBranch size={14} />
              GitOps Path
            </div>
            <StatusPill tone={isAllSynced ? 'green' : 'amber'}>{totalApps ? `${syncedApps}/${totalApps} apps` : 'awaiting metrics'}</StatusPill>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
            Dev <ArrowRight size={12} /> GitHub <ArrowRight size={12} /> GHCR <ArrowRight size={12} /> ArgoCD <ArrowRight size={12} /> K8s
          </div>
        </section>
      </div>
    </div>
  );
};
