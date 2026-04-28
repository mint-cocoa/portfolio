import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Boxes,
  Cloud,
  Cpu,
  Database,
  ExternalLink,
  GitBranch,
  GitCommit,
  Globe,
  Network,
  Package,
  PlayCircle,
  Route,
  Server,
  Split,
  ShieldCheck,
} from 'lucide-react';
import {
  API_LABEL,
  fetchDeployPipeline,
  fetchEdgeRuntime,
  fetchHealth,
  fetchPrometheusSummary,
  fetchPrometheusTargets,
  fetchProxmoxNodes,
  fetchProxmoxResources,
  fetchSummary,
} from './api';

const fallback = (value, empty = '-') => {
  if (value === null || value === undefined || value === '') return empty;
  return String(value);
};

const formatTime = (date) => (date ? date.toLocaleTimeString('ko-KR', { hour12: false }) : '-');

const formatGiB = (bytes) => {
  if (!Number.isFinite(bytes)) return '-';
  return `${Math.round(bytes / 1024 / 1024 / 1024)} GiB`;
};

const formatReady = (ready, total) => {
  if (ready === null || ready === undefined || total === null || total === undefined) return '-';
  return `${ready}/${total} ready`;
};

const clampPercent = (value) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

const ratioPercent = (used, total) => {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return 0;
  return clampPercent((used / total) * 100);
};

const vmRole = (name = '') => {
  if (name.includes('cp')) return 'control-plane';
  if (name.includes('worker')) return 'worker';
  if (name.toLowerCase().includes('omv')) return 'storage';
  return 'platform';
};

const statusTone = (value) => {
  const text = String(value ?? '').toLowerCase();
  if (['ok', 'ready', 'running', 'synced', 'healthy', 'success', 'up', 'live', 'observed'].includes(text)) return 'emerald';
  if (['warning', 'degraded', 'pending', 'progressing', 'queued', 'check'].includes(text)) return 'amber';
  if (['failed', 'error', 'down'].includes(text)) return 'rose';
  return 'zinc';
};

const tone = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  sky: 'border-sky-200 bg-sky-50 text-sky-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  rose: 'border-rose-200 bg-rose-50 text-rose-800',
  violet: 'border-violet-200 bg-violet-50 text-violet-800',
  zinc: 'border-zinc-200 bg-zinc-50 text-zinc-700',
};

const destinationLabels = {
  'cxx-web': 'C++ RuntimeWeb',
  'docker-or-local': 'Docker / local',
  docker: 'Docker apps',
  'local-service': 'Local endpoints',
  kubernetes: 'Kubernetes ingress',
  external: 'External upstream',
  'api-ha': 'Kubernetes API HA',
};

const OPS_DASHBOARD_PATH = './OpsDashboard.html';
const LIVE_OPS_DASHBOARD_URL = 'https://portfolio.mintcocoa.cc/devops/OpsDashboard.html';

const localUpstreamPort = (upstream = '') => {
  const match = upstream.match(/^(?:127\.0\.0\.1|localhost):(\d+)$/);
  return match ? Number(match[1]) : null;
};

const routeTreeDestination = (route) => {
  if (route.runtimeType) return route.runtimeType;
  if (route.destination !== 'docker-or-local') return route.destination ?? 'external';
  const port = localUpstreamPort(route.upstream);
  if (port >= 3000 && port < 4000) return 'docker';
  return 'local-service';
};

const routeTreeSource = (route) => {
  if (route.runtimeTypeSource) return route.runtimeTypeSource;
  if (route.runtimeType) return 'ops-api';
  return route.destination === 'docker-or-local' ? 'upstream fallback' : 'destination fallback';
};

const publicRouteHref = (route) => {
  const hostname = route?.hostname;
  if (!hostname || hostname === 'default' || hostname.includes(':') || !hostname.includes('.')) return null;
  return `https://${hostname}`;
};

const apiReads = [
  { key: 'health', label: 'health', load: fetchHealth, fallback: null },
  { key: 'summary', label: 'summary', load: fetchSummary, fallback: null },
  { key: 'deploy', label: 'deploy-pipeline', load: fetchDeployPipeline, fallback: null },
  { key: 'edge', label: 'edge-runtime', load: fetchEdgeRuntime, fallback: null },
  { key: 'prometheus', label: 'prometheus-summary', load: fetchPrometheusSummary, fallback: null },
  { key: 'targets', label: 'prometheus-targets', load: fetchPrometheusTargets, fallback: null },
  { key: 'nodes', label: 'proxmox-nodes', load: fetchProxmoxNodes, fallback: [] },
  { key: 'vms', label: 'proxmox-vms', load: () => fetchProxmoxResources('vm'), fallback: [] },
];

const StatusPill = ({ value }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${tone[statusTone(value)]}`}>
    {fallback(value)}
  </span>
);

const Shell = ({ children }) => (
  <div className="app-shell devops-app">
    <header className="site-header">
      <a className="brand" href="https://mint-cocoa.github.io/" aria-label="배진후 포트폴리오 홈">
        <span>JH</span>
        배진후
      </a>
      <nav aria-label="상세 포트폴리오">
        <a href="https://mint-cocoa.github.io/portfolio/server/ServerCorePortfolio.html">Server</a>
        <a href="https://mint-cocoa.github.io/portfolio/client/ClientPortfolio.html">Client</a>
        <a href="https://mint-cocoa.github.io/portfolio/devops/DevOpsPortfolio.html">DevOps</a>
        <a href="https://mint-cocoa.github.io/portfolio/devops/OpsDashboard.html">Ops</a>
      </nav>
      <a className="icon-link" href="https://github.com/mint-cocoa" target="_blank" rel="noreferrer" aria-label="GitHub">
        <ExternalLink size={18} />
      </a>
    </header>
    <main>{children}</main>
  </div>
);

const Section = ({ number, title, kicker, children }) => (
  <section className="section">
    <div className="section-title">
      <p>{number}</p>
      <h2>{title}</h2>
    </div>
    {kicker && <p>{kicker}</p>}
    {children}
  </section>
);

const MiniBar = ({ label, value }) => (
  <div className="mini-meter">
    <div className="mini-meter-head">
      <span>{label}</span>
      <strong>{Math.round(clampPercent(value))}%</strong>
    </div>
    <div className="mini-meter-track">
      <span style={{ '--bar-value': `${clampPercent(value)}%` }} />
    </div>
  </div>
);

const VisualStat = ({ icon: Icon, label, value, detail, status }) => (
  <article className="visual-stat">
    <div className="visual-stat-icon">
      <Icon size={19} />
    </div>
    <div>
      <p>{label}</p>
      <strong>{fallback(value)}</strong>
      <span>{fallback(detail)}</span>
    </div>
    {status && <StatusPill value={status} />}
  </article>
);

const RuntimePlatformVisual = ({ data }) => {
  const controlPlanes = data.k8sVms.filter((vm) => vmRole(vm.name) === 'control-plane');
  const workers = data.k8sVms.filter((vm) => vmRole(vm.name) === 'worker');
  const proxmoxNode = data.proxmoxNode;
  const nodeCpu = proxmoxNode?.cpu ? proxmoxNode.cpu * 100 : 0;
  const nodeMem = ratioPercent(proxmoxNode?.mem, proxmoxNode?.maxmem);
  const k8sRunning = data.k8sVms.filter((vm) => vm.status === 'running').length;

  const vmCard = (vm) => {
    const role = vmRole(vm.name);
    return (
      <article className={`vm-chip vm-chip-${role}`} key={vm.vmid ?? vm.name}>
        <div className="vm-chip-head">
          <span>{role}</span>
          <StatusPill value={vm.status} />
        </div>
        <strong>{fallback(vm.name)}</strong>
        <div className="vm-chip-meta">
          <span>{fallback(vm.maxcpu)} CPU</span>
          <span>{formatGiB(vm.maxmem)}</span>
        </div>
        <MiniBar label="memory" value={ratioPercent(vm.mem, vm.maxmem)} />
      </article>
    );
  };

  return (
    <div className="runtime-visual">
      <div className="visual-stat-grid">
        <VisualStat icon={Server} label="Proxmox node" value={proxmoxNode?.node} detail={`${fallback(proxmoxNode?.maxcpu)} CPU / ${formatGiB(proxmoxNode?.maxmem)}`} status={proxmoxNode?.status} />
        <VisualStat icon={Boxes} label="Kubernetes VMs" value={`${k8sRunning}/${data.k8sVms.length || '-'}`} detail={`${fallback(data.controlPlanes)} control-plane + ${fallback(data.workers)} worker`} status={k8sRunning === data.k8sVms.length && data.k8sVms.length ? 'ready' : 'check'} />
        <VisualStat icon={ShieldCheck} label="GitOps state" value={`${fallback(data.deploy?.argocd?.syncStatus)} / ${fallback(data.deploy?.argocd?.healthStatus)}`} detail={data.deploy?.argocd?.shortRevision} status={data.deploy?.argocd?.healthStatus ?? data.deploy?.argocd?.syncStatus} />
        <VisualStat icon={Network} label="Edge ingress" value={data.edge?.proxy?.service} detail={`${fallback(data.edge?.destinationCounts?.kubernetes)} Kubernetes routes`} status={data.edge?.proxy?.running_worker_count ? 'running' : 'check'} />
      </div>

      <div className="platform-map">
        <section className="platform-host">
          <div className="platform-card-head">
            <div>
              <p>Virtualization</p>
              <h3>{fallback(proxmoxNode?.node, 'PVE node')}</h3>
            </div>
            <Cpu size={24} />
          </div>
          <StatusPill value={proxmoxNode?.status ?? 'check'} />
          <MiniBar label="CPU load" value={nodeCpu} />
          <MiniBar label="memory" value={nodeMem} />
        </section>

        <section className="platform-cluster">
          <div className="platform-band control">
            <div className="platform-band-title">
              <span>Control plane</span>
              <strong>{controlPlanes.length || '-'}</strong>
            </div>
            <div className="vm-chip-grid">{(controlPlanes.length ? controlPlanes : [{ name: 'waiting for API', status: 'check' }]).map(vmCard)}</div>
          </div>
          <div className="platform-band worker">
            <div className="platform-band-title">
              <span>Workers</span>
              <strong>{workers.length || '-'}</strong>
            </div>
            <div className="vm-chip-grid">{(workers.length ? workers : [{ name: 'waiting for API', status: 'check' }]).map(vmCard)}</div>
          </div>
        </section>

      </div>
    </div>
  );
};

const WorkloadVisual = ({ data }) => (
  <div className="workload-visual">
    <div className="workload-card-grid">
      {data.workloadCards.map(({ id, icon: Icon, label, value, detail, status }) => (
        <article className="workload-card" key={id}>
          <div className="workload-card-head">
            <div className="workload-icon">
              <Icon size={20} />
            </div>
            <StatusPill value={status} />
          </div>
          <p>{label}</p>
          <strong>{fallback(value)}</strong>
          <span>{fallback(detail)}</span>
        </article>
      ))}
    </div>

    <div className="prepared-app-grid">
      {(data.preparedApps.length ? data.preparedApps : [{ name: 'waiting', upstream: '-', destination: 'check' }]).map((app) => (
        <article className="prepared-app-card" key={`${app.name}-${app.upstream}`}>
          <div>
            <p>Prepared app</p>
            <strong>{fallback(app.name)}</strong>
          </div>
          <Route size={18} />
          <div>
            <p>Upstream</p>
            <strong>{fallback(app.upstream)}</strong>
          </div>
          <StatusPill value={app.destination} />
        </article>
      ))}
    </div>
  </div>
);

const PipelineOverview = ({ steps }) => (
  <div className="pipeline-overview" aria-label="RuntimeWeb 배포 파이프라인 요약">
    {steps.map((step, index) => {
      const Icon = step.icon;
      return (
        <article className="pipeline-overview-step" key={step.id}>
          <div className="pipeline-step-head">
            <div className={`pipeline-step-icon ${tone[statusTone(step.status)]}`}>
              <Icon size={18} />
            </div>
            <StatusPill value={step.status} />
          </div>
          <div className="pipeline-step-number">0{index + 1}</div>
          <h3>{step.label}</h3>
          <div className="pipeline-step-value">{fallback(step.value, 'Ops API 연결 시 표시')}</div>
          <p>{fallback(step.detail)}</p>
          {step.href && (
            <a href={step.href} target="_blank" rel="noreferrer">
              {step.linkLabel ?? 'Open detail'}
              <ExternalLink size={14} />
            </a>
          )}
        </article>
      );
    })}
  </div>
);

const HeroDashboardPreview = ({ data }) => (
  <aside className="hero-dashboard-preview" aria-label="Ops Dashboard live preview">
    <div className="hero-dashboard-frame">
      <iframe
        title="Ops Dashboard live preview"
        src={OPS_DASHBOARD_PATH}
        loading="eager"
      />
    </div>
    <a className="hero-dashboard-path" href={LIVE_OPS_DASHBOARD_URL} target="_blank" rel="noreferrer">
      <span className="hero-dashboard-dot" aria-hidden="true" />
      <strong>{fallback(data.deploy?.live?.url, LIVE_OPS_DASHBOARD_URL).replace(/^https?:\/\//, '')}</strong>
      <ExternalLink size={16} />
    </a>
  </aside>
);

const NetworkTopologyMap = ({ data }) => {
  const routes = data.edge?.routes ?? [];
  const proxyListen = data.edge?.proxy?.listen;
  const proxyListenLabel = proxyListen
    ? `${proxyListen.host ?? '0.0.0.0'}:${proxyListen.port ?? 443}`
    : data.edge?.proxy?.default_upstream;
  const topology = {
    publicEntry: data.liveHost,
    edgeNode: data.edge?.proxy?.service ?? 'tcp_reverse_proxy',
    publicListen: proxyListenLabel,
    kubernetesLabel: destinationLabels.kubernetes,
    controlPlaneEndpoints: [],
    ...(data.edge?.topology ?? {}),
  };
  if (!data.edge) {
    return (
      <div className="work-card">
        <div className="work-card-body">
          <StatusPill value="API unavailable" />
          <h3 className="mt-2 text-xl font-black text-zinc-950">Ops API 연결 필요</h3>
          <p className="mt-2 text-sm leading-7 text-zinc-600">
            외부 트래픽 경로는 <code>/api/edge-runtime</code> 응답을 받은 뒤 표시합니다.
          </p>
        </div>
      </div>
    );
  }
  const route = routes.find((item) => item.hostname === data.liveHost)
    ?? routes.find((item) => item.destination === 'kubernetes');
  const routeGroupMap = routes.reduce((groups, item) => {
      const key = routeTreeDestination(item);
      groups[key] = [...(groups[key] ?? []), item];
      return groups;
    }, {});
  const controlPlaneEndpoints = topology.controlPlaneEndpoints?.length
    ? topology.controlPlaneEndpoints
    : data.k8sVms
      ?.filter((vm) => vmRole(vm.name) === 'control-plane')
      .map((vm) => vm.name) ?? [];
  const apiHaNodes = [
    {
      hostname: topology.kubernetesApiEndpoint ?? 'kubernetes-api',
      upstream: 'HAProxy virtual endpoint',
      destination: 'api-ha',
      runtimeType: 'api-ha',
      runtimeTypeSource: topology.kubernetesApiEndpoint ? 'ops-api topology' : 'topology fallback',
      kind: 'haproxy',
    },
    ...controlPlaneEndpoints.map((endpoint, index) => ({
      hostname: `control-plane-${index + 1}`,
      upstream: endpoint,
      destination: 'api-ha',
      runtimeType: 'api-ha',
      runtimeTypeSource: topology.controlPlaneEndpoints?.length ? 'ops-api topology' : 'proxmox fallback',
      kind: 'control-plane',
    })),
  ];
  if (apiHaNodes.length) {
    routeGroupMap['api-ha'] = [...(routeGroupMap['api-ha'] ?? []), ...apiHaNodes];
  }
  const routeTreeGroups = Object.entries(routeGroupMap).sort(([left], [right]) => {
    const order = ['kubernetes', 'docker', 'local-service', 'api-ha', 'external', 'cxx-web'];
    const leftIndex = order.includes(left) ? order.indexOf(left) : order.length;
    const rightIndex = order.includes(right) ? order.indexOf(right) : order.length;
    return leftIndex - rightIndex;
  });
  const rolloutStatus = formatReady(data.deploy?.kubernetes?.readyReplicas, data.deploy?.kubernetes?.replicas);
  const entryPath = [
    ['Client', data.liveHost, 'public HTTPS request', data.deploy?.live?.ok ? 'live' : 'check', Globe],
    ['Home Router', topology.publicEntry, 'port-forward to edge mini PC', data.deploy?.live?.ok ? 'live' : 'check', Route],
    ['Edge Mini PC', topology.edgeNode, 'branches by protocol and port', data.edge?.proxy?.running_worker_count ? 'running' : 'check', Network],
  ];
  const publicBranch = [
    ['RuntimeProxy', data.edge?.proxy?.service ?? 'tcp_reverse_proxy', topology.publicListen],
    ['SNI route', route?.hostname ?? data.liveHost, route?.upstream ?? data.edge?.proxy?.default_upstream],
    ['Ingress / upstream', route?.destination === 'kubernetes' ? topology.kubernetesLabel : destinationLabels[route?.destination] ?? 'selected upstream', route?.destination === 'kubernetes' ? 'ingress-nginx -> service -> pod' : route?.upstream],
    ['Workload', data.deploy?.kubernetes?.name, rolloutStatus],
  ];
  return (
    <div className="work-card">
      <div className="work-card-body">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-zinc-500">
              <Split size={16} />
              Network topology
            </div>
            <h3 className="mt-2 text-xl font-black text-zinc-950">{fallback(topology.edgeNode, 'Edge node')}에서 갈라지는 실제 경로</h3>
          </div>
          <StatusPill value={route?.destination ?? 'check'} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
          <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            {entryPath.map(([label, primary, secondary, status, Icon], index) => (
              <div key={label}>
                <div className={`grid grid-cols-[40px_1fr] gap-3 border bg-white p-3 ${tone[statusTone(status)]}`}>
                  <div className="flex h-10 w-10 items-center justify-center border border-current/20 bg-white/75">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase text-current/70">{label}</span>
                      <span className="text-xs font-black">{fallback(status)}</span>
                    </div>
                    <div className="mt-1 break-words text-base font-black">{fallback(primary)}</div>
                    <div className="mt-1 break-words text-xs leading-5 opacity-80">{fallback(secondary)}</div>
                  </div>
                </div>
                {index < entryPath.length - 1 && <div className="ml-5 h-4 w-px bg-zinc-300" aria-hidden="true" />}
              </div>
            ))}
          </div>

          <div className="grid gap-3">
            {[
              ['Public HTTP/S', route?.destination === 'kubernetes' ? 'kubernetes' : route?.destination ?? 'check', publicBranch],
            ].map(([title, status, rows]) => (
              <div key={title} className="border border-zinc-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-base font-black text-zinc-950">{title}</h4>
                  <StatusPill value={status} />
                </div>
                <div className="grid gap-3">
                  {rows.map(([label, primary, secondary]) => (
                    <div key={label} className="grid gap-1 border-l-2 border-zinc-200 pl-3 text-sm">
                      <div className="font-black uppercase text-zinc-400">{label}</div>
                      <div className="min-w-0 break-words font-black text-zinc-900">{fallback(primary)}</div>
                      <div className="min-w-0 break-words font-semibold leading-5 text-zinc-500">{fallback(secondary)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="route-tree">
          <div className="route-tree-root">
            <div className="route-tree-root-icon">
              <Network size={20} />
            </div>
            <div>
              <p>Actual route tree</p>
              <h4>{fallback(data.edge?.proxy?.service, 'edge proxy')}</h4>
              <span>{routes.length || '-'} live routes from edge-runtime</span>
            </div>
          </div>

          <div className="route-tree-branches">
            {(routeTreeGroups.length ? routeTreeGroups : [['check', [{ hostname: data.liveHost, upstream: '-', destination: 'check' }]]]).map(([destination, items]) => {
              const sourceSummary = [...new Set(items.map((item) => routeTreeSource(item)))].join(' + ');
              const branchClassName = [
                'route-branch',
                `route-branch-${destination}`,
                destination === 'docker' ? 'route-branch-compact' : '',
              ].filter(Boolean).join(' ');
              const apiHaRoot = destination === 'api-ha'
                ? items.find((item) => item.kind === 'haproxy') ?? items[0]
                : null;
              const apiHaChildren = destination === 'api-ha'
                ? items.filter((item) => item !== apiHaRoot)
                : [];
              return (
                <section className={branchClassName} key={destination}>
                  <div className="route-branch-head">
                    <div>
                      <p>{destination === 'api-ha' ? 'Cluster API HA' : destinationLabels[destination] ?? destination}</p>
                      <strong>{items.length} {destination === 'api-ha' ? `node${items.length === 1 ? '' : 's'}` : `route${items.length === 1 ? '' : 's'}`}</strong>
                      <span>source: {sourceSummary}</span>
                    </div>
                    <StatusPill value={destination} />
                  </div>

                  {destination === 'api-ha' ? (
                    <div className="route-ha-map">
                      <article className="route-leaf route-ha-root" key={`${apiHaRoot.hostname}-${apiHaRoot.upstream}`}>
                        <div className={`route-leaf-node route-leaf-node-${apiHaRoot.kind ?? routeTreeDestination(apiHaRoot)}`} aria-hidden="true" />
                        <div className="route-leaf-body">
                          <strong>{fallback(apiHaRoot.hostname)}</strong>
                          <span>{fallback(apiHaRoot.upstream)}</span>
                        </div>
                      </article>
                      <div className="route-ha-children">
                        {apiHaChildren.map((item) => (
                          <article className="route-leaf" key={`${item.hostname}-${item.upstream}`}>
                            <div className={`route-leaf-node route-leaf-node-${item.kind ?? routeTreeDestination(item)}`} aria-hidden="true" />
                            <div className="route-leaf-body">
                              <strong>{fallback(item.hostname)}</strong>
                              <span>{fallback(item.upstream)}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="route-leaf-list">
                      {items.map((item) => {
                        const selected = item === route;
                        const href = publicRouteHref(item);
                        const LeafTag = href ? 'a' : 'article';
                        const leafProps = href
                          ? {
                              href,
                              target: '_blank',
                              rel: 'noreferrer',
                              'aria-label': `${item.hostname} 열기`,
                            }
                          : {};
                        return (
                          <LeafTag className={`route-leaf ${href ? 'route-leaf-link' : ''} ${selected ? 'route-leaf-selected' : ''}`} key={`${item.hostname}-${item.upstream}`} {...leafProps}>
                            <div className={`route-leaf-node route-leaf-node-${item.kind ?? routeTreeDestination(item)}`} aria-hidden="true" />
                            <div className="route-leaf-body">
                              <strong>{fallback(item.hostname)}</strong>
                              <span>{fallback(item.upstream)}</span>
                            </div>
                            {href && <ExternalLink className="route-leaf-link-icon" size={14} aria-hidden="true" />}
                          </LeafTag>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export const DevOpsInlinePortfolio = () => {
  const [snapshot, setSnapshot] = useState({
    health: null,
    summary: null,
    deploy: null,
    edge: null,
    prometheus: null,
    targets: null,
    nodes: [],
    vms: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const read = (result, fallbackValue) => (result.status === 'fulfilled' ? result.value : fallbackValue);
    try {
      const results = await Promise.allSettled(apiReads.map((item) => item.load()));
      const nextSnapshot = apiReads.reduce((acc, item, index) => {
        acc[item.key] = read(results[index], item.fallback);
        return acc;
      }, {});
      const failures = results
        .map((result, index) => ({ result, label: apiReads[index].label }))
        .filter(({ result }) => result.status === 'rejected');

      setSnapshot(nextSnapshot);
      setUpdatedAt(new Date());
      if (failures.length) {
        setError(`일부 API 응답 실패: ${failures.map(({ label }) => label).join(', ')}`);
      }
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(load, 0);
    const timer = setInterval(load, 15000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(timer);
    };
  }, [load]);

  const data = useMemo(() => {
    const nodes = snapshot.nodes ?? [];
    const vms = snapshot.vms ?? [];
    const k8sVms = vms.filter((vm) => vm.name?.startsWith('k8s-'));
    const runningVms = vms.filter((vm) => vm.status === 'running').length;
    const controlPlaneCount = k8sVms.filter((vm) => vm.name?.includes('cp')).length;
    const workerCount = k8sVms.filter((vm) => vm.name?.includes('worker')).length;
    const controlPlanes = k8sVms.length ? controlPlaneCount : null;
    const workers = k8sVms.length ? workerCount : null;
    const platformSummary = controlPlanes === null || workers === null ? '-' : `${controlPlanes} + ${workers}`;
    const platformDetail = controlPlanes === null || workers === null
      ? 'Ops API 연결 필요'
      : 'control-plane + worker native Kubernetes';
    const proxmoxNode = nodes[0];
    const liveHost = snapshot.deploy?.live?.url
      ? snapshot.deploy.live.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      : '-';
    const liveWorkload = snapshot.deploy?.kubernetes?.name ?? '-';
    const liveRevision = snapshot.deploy?.kubernetes?.shortImageTag ?? snapshot.deploy?.image?.shortTag ?? '-';
    const rolloutReady = snapshot.deploy?.kubernetes?.replicas !== null
      && snapshot.deploy?.kubernetes?.replicas !== undefined
      && snapshot.deploy?.kubernetes?.readyReplicas === snapshot.deploy?.kubernetes?.replicas;
    const workloadCards = [
      {
        id: 'portfolio',
        icon: Cloud,
        label: snapshot.deploy?.kubernetes?.namespace ?? 'portfolio',
        value: snapshot.deploy?.kubernetes?.name,
        detail: snapshot.deploy?.kubernetes?.shortImageTag,
        status: rolloutReady ? 'ready' : 'check',
      },
      {
        id: 'argocd',
        icon: ShieldCheck,
        label: snapshot.deploy?.argocd?.namespace ?? 'argocd',
        value: snapshot.deploy?.argocd?.name,
        detail: snapshot.deploy?.argocd?.shortRevision,
        status: snapshot.deploy?.argocd?.healthStatus ?? snapshot.deploy?.argocd?.syncStatus ?? 'check',
      },
      {
        id: 'monitoring',
        icon: Database,
        label: 'monitoring',
        value: `${snapshot.prometheus?.targets?.up ?? '-'}/${snapshot.prometheus?.targets?.total ?? '-'} targets`,
        detail: `${snapshot.prometheus?.series?.pods ?? '-'} pod series`,
        status: snapshot.prometheus?.targets?.down === 0 ? 'up' : 'check',
      },
      {
        id: 'edge',
        icon: Network,
        label: 'edge runtime',
        value: snapshot.edge?.proxy?.service,
        detail: `${snapshot.edge?.proxy?.running_worker_count ?? '-'}/${snapshot.edge?.proxy?.configured_worker_count ?? '-'} workers`,
        status: snapshot.edge?.proxy?.running_worker_count ? 'running' : 'check',
      },
    ];
    const preparedApps = (snapshot.edge?.routes ?? [])
      .filter((route) => ['dropapp.mintcocoa.cc', 'webhook.mintcocoa.cc'].includes(route.hostname))
      .map((route) => ({
        name: route.hostname.replace('.mintcocoa.cc', ''),
        upstream: route.upstream,
        destination: route.destination,
      }));
    const overviewPipeline = [
      {
        id: 'source',
        label: 'Source Commit',
        value: snapshot.deploy?.commit?.shortSha,
        detail: snapshot.deploy?.commit?.message ?? 'RuntimeWeb 포트폴리오 서버 소스 commit',
        status: snapshot.deploy?.commit ? 'observed' : 'check',
        href: snapshot.deploy?.commit?.url,
        linkLabel: 'View commit',
        icon: GitCommit,
      },
      {
        id: 'build',
        label: 'GitHub Actions',
        value: snapshot.deploy?.actions?.displayStatus ?? snapshot.deploy?.actions?.workflowName,
        detail: snapshot.deploy?.actions?.workflowName
          ? `run #${fallback(snapshot.deploy.actions.runNumber)} image build`
          : 'C++ 서버 이미지 빌드와 GHCR push',
        status: snapshot.deploy?.actions?.status ?? 'check',
        href: snapshot.deploy?.actions?.url,
        linkLabel: 'Open run',
        icon: PlayCircle,
      },
      {
        id: 'image',
        label: 'GHCR Image',
        value: snapshot.deploy?.image?.shortTag,
        detail: snapshot.deploy?.image?.repository ?? 'ghcr.io/mint-cocoa/portfolio',
        status: snapshot.deploy?.image ? 'observed' : 'check',
        icon: Package,
      },
      {
        id: 'gitops',
        label: 'GitOps Values',
        value: snapshot.deploy?.gitops?.shortSha,
        detail: snapshot.deploy?.gitops?.message ?? 'Helm values image tag 승격',
        status: snapshot.deploy?.gitops ? 'observed' : 'check',
        href: snapshot.deploy?.gitops?.url,
        linkLabel: 'View change',
        icon: GitBranch,
      },
      {
        id: 'argocd',
        label: 'Argo CD Sync',
        value: `${fallback(snapshot.deploy?.argocd?.syncStatus)} / ${fallback(snapshot.deploy?.argocd?.healthStatus)}`,
        detail: snapshot.deploy?.argocd?.message ?? 'desired state 동기화',
        status: snapshot.deploy?.argocd?.healthStatus ?? snapshot.deploy?.argocd?.syncStatus ?? 'check',
        icon: ShieldCheck,
      },
      {
        id: 'rollout',
        label: 'K8s Rollout',
        value: formatReady(snapshot.deploy?.kubernetes?.readyReplicas, snapshot.deploy?.kubernetes?.replicas),
        detail: snapshot.deploy?.kubernetes?.shortImageTag
          ? `${fallback(snapshot.deploy.kubernetes.name)} @ ${snapshot.deploy.kubernetes.shortImageTag}`
          : 'Deployment ready replica 확인',
        status: rolloutReady ? 'ready' : 'check',
        icon: Boxes,
      },
      {
        id: 'live',
        label: 'Live HTTPS',
        value: snapshot.deploy?.live?.statusCode ? `HTTP ${snapshot.deploy.live.statusCode}` : liveHost,
        detail: snapshot.deploy?.live?.url ?? 'portfolio.mintcocoa.cc 공개 경로',
        status: snapshot.deploy?.live?.ok ? 'live' : 'check',
        href: snapshot.deploy?.live?.url,
        linkLabel: 'Open live',
        icon: Cloud,
      },
    ];
    return {
      ...snapshot,
      nodes,
      vms,
      k8sVms,
      proxmoxNode,
      runningVms,
      controlPlanes,
      workers,
      platformSummary,
      platformDetail,
      workloadCards,
      preparedApps,
      overviewPipeline,
      liveWorkload,
      liveRevision,
      liveHost,
    };
  }, [snapshot]);

  return (
    <Shell>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">C++ Server · GitOps · Kubernetes</p>
          <h1>
            <span>홈랩 DevOps</span>
            <span>운영 포트폴리오</span>
          </h1>
          <p className="lead">
            홈랩 네트워크와 Kubernetes 실행 환경을 구축하고 GitHub Actions, GHCR, Argo CD로 배포를 자동화했습니다.
            Prometheus와 Ops API로 실제 운영 상태를 이 페이지에 연결했습니다.
          </p>
          <div className="hero-document-card">
            <div className="hero-document-head">
              <Activity size={18} />
              <span>DevOps document</span>
            </div>
            <h2>GitOps 기반 홈 Kubernetes 운영</h2>
            <p>홈랩 계층, 배포 흐름, workload, ingress, observability를 실제 운영 API와 연결해 문서화했습니다.</p>
            <div className="hero-actions" aria-label="주요 링크">
              <a className="button" href="https://portfolio.mintcocoa.cc/devops/DevOpsPortfolio.html" target="_blank" rel="noreferrer">
                GitHub Pages
                <ExternalLink size={16} />
              </a>
              <a className="button" href={LIVE_OPS_DASHBOARD_URL} target="_blank" rel="noreferrer">
                Ops Dashboard
                <Cloud size={16} />
              </a>
            </div>
            <div className="hero-tag-list" aria-label="기술 스택">
              {['Kubernetes', 'GHCR', 'Argo CD', 'Prometheus'].map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <HeroDashboardPreview data={data} />
      </section>

      <div className="devops-content-grid devops-content-grid-wide">
        <div>
          <Section number="1 Overview" title="프로젝트 개요">
            <div className="work-card overview-pipeline-card">
              <div className="work-card-body">
                <div className="pipeline-overview-title">
                  <div>
                    <p className="card-eyebrow">RuntimeWeb Delivery</p>
                    <h3>Source에서 Live HTTPS까지 이어지는 배포 흐름</h3>
                  </div>
                  <div className="pipeline-api-state">
                    <StatusPill value={data.health?.ok ? 'live API' : error ? 'partial API' : loading ? 'loading' : 'static overview'} />
                    <span>{API_LABEL} · updated {formatTime(updatedAt)}</span>
                  </div>
                </div>
                <p className="pipeline-overview-copy">
                  GitHub Actions가 C++ RuntimeWeb 이미지를 만들고, GitOps repository의 Helm values에
                  이미지 태그를 승격하면 Argo CD가 Kubernetes rollout을 수렴시킵니다. Ops API가 연결된
                  단계는 실제 commit, image tag, sync/health, HTTPS 응답값으로 채워집니다.
                  이 페이지는 정적 포트폴리오 문서가 아니라 운영 API를 읽는 live 검증 표면으로 설계했습니다.
                </p>
                <dl className="overview-inline-facts">
                  <div>
                    <dt>Runtime source</dt>
                    <dd>{data.liveWorkload === '-' && data.liveRevision === '-' ? 'Ops API 연결 시 표시' : `${data.liveWorkload} @ ${data.liveRevision}`}</dd>
                  </div>
                  <div>
                    <dt>Verification path</dt>
                    <dd>{'commit -> image -> GitOps -> Argo CD -> rollout -> HTTPS'}</dd>
                  </div>
                </dl>
                <PipelineOverview steps={data.overviewPipeline} />
              </div>
            </div>
          </Section>

          <Section number="2 Runtime Platform" title="Kubernetes 실행 환경">
            <RuntimePlatformVisual data={data} />
          </Section>

          <Section number="3 Network Path" title="외부 트래픽 경로">
            <NetworkTopologyMap data={data} />
          </Section>

          <Section number="4 Runtime Workload" title="Runtime workload">
            <WorkloadVisual data={data} />
          </Section>
        </div>
      </div>
    </Shell>
  );
};
