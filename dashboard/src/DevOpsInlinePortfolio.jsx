import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Boxes,
  CheckCircle2,
  Cloud,
  ExternalLink,
  GitBranch,
  GitCommit,
  Globe,
  Network,
  Package,
  PlayCircle,
  RefreshCw,
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

const timelineIcons = {
  commit: GitCommit,
  actions: PlayCircle,
  image: Package,
  gitops: GitBranch,
  argocd: ShieldCheck,
  rollout: Boxes,
  live: Cloud,
  client: Globe,
  edge: Network,
  route: Route,
  ingress: ShieldCheck,
  service: Server,
  pod: Boxes,
  split: Split,
};

const destinationLabels = {
  'cxx-web': 'C++ RuntimeWeb',
  'docker-or-local': 'Docker / local',
  kubernetes: 'Kubernetes ingress',
  external: 'External upstream',
};

const ciRows = [
  ['Source', '앱 repository commit', '배포 이미지 tag와 commit SHA 연결.'],
  ['CI', 'Docker multi-stage build로 C++ 서버를 빌드 및 GHCR에 이미지를 푸시.'],
  ['Promotion', 'GitOps repository의 Helm values에서 image tag만 갱신.'],
  ['CD', 'Argo CD가 GitOps 변경을 감지해 cluster state를 수렴.'],
  ['Runtime verification', 'Deployment, Service, Ingress, live HTTPS 응답을 확인.'],
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

const DataTable = ({ headers, rows }) => (
  <div className="overflow-x-auto border border-zinc-200 bg-white">
    <table className="w-full min-w-[760px] border-collapse text-sm">
      {headers && (
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-black">{header}</th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {(rows.length ? rows : [['-', '-', '-']]).map((row) => (
          <tr key={row.join('|')} className="border-b border-zinc-100 last:border-b-0">
            {row.map((cell, index) => (
              <td key={`${cell}-${index}`} className={`px-3 py-3 align-top ${index === 0 ? 'font-bold text-zinc-950' : 'text-zinc-700'}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Metric = ({ icon: Icon, label, value, detail, valueStatus }) => (
  <div className="summary-card">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <strong>{label}</strong>
        <div className="mt-2 break-words text-xl font-black leading-tight text-zinc-950">{fallback(value)}</div>
        <p>{detail}</p>
      </div>
      <div className={`shrink-0 border p-2 ${tone[valueStatus ? statusTone(valueStatus) : 'sky']}`}>
        <Icon size={22} />
      </div>
    </div>
  </div>
);

const Timeline = ({ steps }) => (
  <div className="timeline-scroll" aria-label="배포 흐름 단계">
    {steps.length === 0 ? (
      <div className="work-card timeline-empty-card">
        <div className="work-card-body">
          <StatusPill value="API unavailable" />
          <h3>Ops API 연결 필요</h3>
          <p>
            배포 흐름은 <code>/api/deploy-pipeline</code> 응답으로만 표시합니다.
            로컬 preview에서 CORS나 네트워크 제한으로 API를 읽지 못하면 실제 단계 데이터를 표시하지 않습니다.
          </p>
        </div>
      </div>
    ) : (
      <div className="timeline-horizontal" style={{ '--step-count': steps.length }}>
    {steps.map((step, index) => {
      const Icon = timelineIcons[step.id] ?? CheckCircle2;
      return (
        <div key={step.id} className="timeline-step">
          <div className="timeline-icon-wrap">
            <div className={`timeline-icon ${tone[statusTone(step.status)]}`}>
              <Icon size={21} />
            </div>
          </div>
          <div className="work-card timeline-work-card">
            <div className="work-card-body">
              <div className="timeline-card-head">
                <div className="min-w-0">
                  <div className="text-xs font-black text-zinc-500">Step {index + 1}</div>
                  <h3>{step.label}</h3>
                </div>
                <StatusPill value={step.status ?? step.primary} />
              </div>
              <div className="timeline-primary">{fallback(step.primary)}</div>
              <p>{fallback(step.secondary)}</p>
              {step.href && (
                <a className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-sky-700 hover:text-sky-900" href={step.href} target="_blank" rel="noreferrer">
                  evidence 열기
                  <ExternalLink size={15} />
                </a>
              )}
            </div>
          </div>
        </div>
      );
    })}
      </div>
    )}
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
              evidence
              <ExternalLink size={14} />
            </a>
          )}
        </article>
      );
    })}
  </div>
);

const NetworkTopologyMap = ({ data }) => {
  const routes = data.edge?.routes ?? [];
  const topology = data.edge?.topology ?? {};
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
  const visibleRoutes = [
    ...(route ? [route] : []),
    ...routes.filter((item) => item !== route && item.hostname !== 'default'),
    ...routes.filter((item) => item !== route && item.hostname === 'default'),
  ].slice(0, 6);
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
  const apiBranch = [
    ['HAProxy', topology.kubernetesApiEndpoint, 'Kubernetes API virtual endpoint'],
    ['Control planes', topology.controlPlaneEndpoints?.join(' / '), 'control-plane API backends'],
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

          <div className="grid gap-3 md:grid-cols-2">
            {[
              ['Public HTTP/S', route?.destination === 'kubernetes' ? 'kubernetes' : route?.destination ?? 'check', publicBranch],
              ['Kubernetes API HA', topology.kubernetesApiEndpoint ? 'ready' : 'check', apiBranch],
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

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.6fr)]">
          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-black uppercase text-zinc-500">Actual route table</span>
              <span className="font-bold text-zinc-500">{routes.length || '-'} routes</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {(visibleRoutes.length ? visibleRoutes : [{ hostname: data.liveHost, upstream: '-', destination: 'check' }]).map((item) => {
                const selected = item === route;
                return (
                  <div
                    key={`${item.hostname}-${item.upstream}`}
                    className={`grid gap-1 border p-3 text-xs ${selected ? 'border-zinc-950 bg-white shadow-sm' : 'border-zinc-200 bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 break-words font-black text-zinc-900">{fallback(item.hostname)}</span>
                      <StatusPill value={item.destination ?? 'check'} />
                    </div>
                    <div className="grid grid-cols-[58px_1fr] gap-2 text-zinc-600">
                      <span className="font-bold text-zinc-400">to</span>
                      <span className="min-w-0 break-words font-semibold">{fallback(item.upstream)}</span>
                    </div>
                    <div className="grid grid-cols-[58px_1fr] gap-2 text-zinc-600">
                      <span className="font-bold text-zinc-400">type</span>
                      <span className="min-w-0 break-words font-semibold">{destinationLabels[item.destination] ?? fallback(item.destination)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid content-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-black uppercase text-zinc-500">Destination counts</div>
            {Object.entries(data.edge?.destinationCounts ?? {}).map(([destination, count]) => (
              <div key={destination} className="flex items-center justify-between gap-3 border border-zinc-100 bg-white px-3 py-2 text-xs">
                <span className="font-semibold text-zinc-700">{destinationLabels[destination] ?? destination}</span>
                <StatusPill value={count} />
              </div>
            ))}
            {Object.keys(data.edge?.destinationCounts ?? {}).length === 0 && (
              <div className="text-xs font-semibold text-zinc-500">waiting for edge-runtime routes</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Chain = ({ items, tone = 'delivery' }) => (
  <div className={`mini-flow ${tone}`}>
    {items.map((item, index) => (
      <div className="mini-flow-step" key={`${item}-${index}`}>
        <span>{item}</span>
        {index < items.length - 1 && <i aria-hidden="true" />}
      </div>
    ))}
  </div>
);

const LivePanel = ({ data, loading, error, updatedAt, onRefresh }) => (
  <aside className="hero-devops live-panel">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-bold text-zinc-500">운영 관측값</div>
        <h2 className="mt-1 text-xl font-bold text-zinc-950">Live 상태</h2>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex items-center gap-2 border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-700 shadow-sm hover:border-sky-300 hover:bg-sky-50"
      >
        <RefreshCw size={15} />
        새로고침
      </button>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <StatusPill value={data.health?.ok ? 'ok' : loading ? 'loading' : 'check'} />
      <span className="text-sm text-zinc-500">updated {formatTime(updatedAt)}</span>
    </div>
    {error && <div className="mt-3 border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}
    <div className="live-panel-list">
      {[
        ['Commit', data.deploy?.commit?.shortSha],
        ['Image', data.deploy?.image?.shortTag],
        ['Argo CD', `${fallback(data.deploy?.argocd?.syncStatus)} / ${fallback(data.deploy?.argocd?.healthStatus)}`],
        ['Rollout', formatReady(data.deploy?.kubernetes?.readyReplicas, data.deploy?.kubernetes?.replicas)],
        ['Live 경로', data.deploy?.live?.url],
        ['Prometheus', `${fallback(data.prometheus?.targets?.up)}/${fallback(data.prometheus?.targets?.total)} targets up`],
        ['Edge routes', fallback(data.edge?.routes?.length)],
      ].map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-3 border-b border-zinc-100 py-2 last:border-b-0">
          <span className="font-bold text-zinc-500">{label}</span>
          <span className="max-w-[220px] break-words text-right font-black text-zinc-900">{fallback(value)}</span>
        </div>
      ))}
    </div>
  </aside>
);

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
    setError(null);
    const read = (result, fallbackValue) => (result.status === 'fulfilled' ? result.value : fallbackValue);
    try {
      const results = await Promise.allSettled([
        fetchHealth(),
        fetchSummary(),
        fetchDeployPipeline(),
        fetchEdgeRuntime(),
        fetchPrometheusSummary(),
        fetchPrometheusTargets(),
        fetchProxmoxNodes(),
        fetchProxmoxResources('vm'),
      ]);
      const [health, summary, deploy, edge, prometheus, targets, nodes, vms] = results;
      const failures = results.filter((result) => result.status === 'rejected');
      setSnapshot({
        health: read(health, null),
        summary: read(summary, null),
        deploy: read(deploy, null),
        edge: read(edge, null),
        prometheus: read(prometheus, null),
        targets: read(targets, null),
        nodes: read(nodes, []),
        vms: read(vms, []),
      });
      setUpdatedAt(new Date());
      if (failures.length) {
        setError(`일부 API 응답 실패: ${failures[0].reason?.message ?? 'unknown error'}`);
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
    const deploySteps = snapshot.deploy?.steps ?? [];
    const vmRows = k8sVms.map((vm) => [
      vm.name,
      vm.vmid,
      vmRole(vm.name),
      vm.status,
      `${fallback(vm.maxcpu)} CPU / ${formatGiB(vm.maxmem)}`,
    ]);
    const proxmoxNode = nodes[0];
    const layerRows = [
      ['Virtualization', proxmoxNode?.node ?? '-', proxmoxNode?.status ?? '-', `${fallback(proxmoxNode?.maxcpu)} CPU / ${formatGiB(proxmoxNode?.maxmem)}`],
      ['Workload VMs', `${k8sVms.length || '-'} Kubernetes VMs`, vms.length ? `${runningVms}/${vms.length} VMs running` : '-', controlPlanes === null || workers === null ? '-' : `${controlPlanes} control-plane + ${workers} worker`],
      ['Delivery', snapshot.deploy?.actions?.workflowName ?? '-', snapshot.deploy?.actions?.status ?? '-', snapshot.deploy?.image?.repository ?? '-'],
      ['GitOps', snapshot.deploy?.argocd?.name ?? '-', `${fallback(snapshot.deploy?.argocd?.syncStatus)} / ${fallback(snapshot.deploy?.argocd?.healthStatus)}`, snapshot.deploy?.argocd?.shortRevision ?? '-'],
      ['Edge', snapshot.edge?.proxy?.service ?? '-', `${snapshot.edge?.destinationCounts?.kubernetes ?? '-'} Kubernetes routes`, snapshot.edge?.proxy?.default_upstream ?? '-'],
    ];
    const edgeRows = (snapshot.edge?.routes ?? []).map((route) => [
      route.hostname,
      route.upstream,
      route.destination,
    ]);
    const workloadRows = [
      [snapshot.deploy?.kubernetes?.namespace ?? '-', snapshot.deploy?.kubernetes?.name ?? '-', snapshot.deploy?.kubernetes?.shortImageTag ?? '-', formatReady(snapshot.deploy?.kubernetes?.readyReplicas, snapshot.deploy?.kubernetes?.replicas)],
      [snapshot.deploy?.argocd?.namespace ?? '-', snapshot.deploy?.argocd?.name ?? '-', snapshot.deploy?.argocd?.shortRevision ?? '-', `${fallback(snapshot.deploy?.argocd?.syncStatus)} / ${fallback(snapshot.deploy?.argocd?.healthStatus)}`],
      ['monitoring', 'prometheus targets', `${snapshot.prometheus?.targets?.up ?? '-'}/${snapshot.prometheus?.targets?.total ?? '-'} up`, `${snapshot.prometheus?.series?.pods ?? '-'} pod series`],
      ['edge', snapshot.edge?.proxy?.service ?? '-', `${snapshot.edge?.proxy?.running_worker_count ?? '-'}/${snapshot.edge?.proxy?.configured_worker_count ?? '-'} workers`, `${snapshot.edge?.proxy?.total_live_sessions ?? '-'} sessions`],
    ];
    const preparedRows = (snapshot.edge?.routes ?? [])
      .filter((route) => ['dropapp.mintcocoa.cc', 'webhook.mintcocoa.cc'].includes(route.hostname))
      .map((route) => [route.hostname.replace('.mintcocoa.cc', ''), route.upstream, route.destination]);
    const liveHost = snapshot.deploy?.live?.url
      ? snapshot.deploy.live.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      : '-';
    const liveWorkload = snapshot.deploy?.kubernetes?.name ?? '-';
    const liveRevision = snapshot.deploy?.kubernetes?.shortImageTag ?? snapshot.deploy?.image?.shortTag ?? '-';
    const rolloutReady = snapshot.deploy?.kubernetes?.replicas !== null
      && snapshot.deploy?.kubernetes?.replicas !== undefined
      && snapshot.deploy?.kubernetes?.readyReplicas === snapshot.deploy?.kubernetes?.replicas;
    const overviewPipeline = [
      {
        id: 'source',
        label: 'Source Commit',
        value: snapshot.deploy?.commit?.shortSha,
        detail: snapshot.deploy?.commit?.message ?? 'RuntimeWeb 포트폴리오 서버 소스 commit',
        status: snapshot.deploy?.commit ? 'observed' : 'check',
        href: snapshot.deploy?.commit?.url,
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
        icon: Cloud,
      },
    ];
    const observabilityRows = [
      ['Targets', `${snapshot.prometheus?.targets?.up ?? '-'}/${snapshot.prometheus?.targets?.total ?? '-'}`, `${snapshot.prometheus?.targets?.down ?? '-'} down`],
      ['Pod series', fallback(snapshot.prometheus?.series?.pods), 'Prometheus summary'],
      ['Deployment series', fallback(snapshot.prometheus?.series?.deployments), 'Prometheus summary'],
      ['PVC phases', fallback(snapshot.prometheus?.series?.pvcPhases), 'Prometheus summary'],
      ['Scrape targets', fallback(snapshot.targets?.count ?? snapshot.targets?.targets?.length), 'prometheus/targets'],
    ];
    const storageRows = vms
      .filter((vm) => vm.name?.toLowerCase().includes('omv') || vm.maxdisk)
      .slice(0, 5)
      .map((vm) => [vm.name, vm.status, formatGiB(vm.maxdisk), formatGiB(vm.maxmem)]);
    return {
      ...snapshot,
      nodes,
      vms,
      controlPlanes,
      workers,
      platformSummary,
      platformDetail,
      deploySteps,
      vmRows,
      layerRows,
      edgeRows,
      workloadRows,
      preparedRows,
      observabilityRows,
      storageRows,
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
          <h1>홈랩 DevOps 운영 포트폴리오</h1>
          <p className="lead">
            홈랩 네트워크 구성 및 k8s 실행 환경을 구축, github actions와 Argo CD로 ci/cd 자동화, Prometheus로 관측 지표를 수집하는 전체 운영 흐름을 구현했습니다. 
          </p>
          <div className="hero-actions" aria-label="주요 링크">
            <a className="button" href="https://portfolio.mintcocoa.cc/devops/DevOpsPortfolio.html" target="_blank" rel="noreferrer">
              <Activity size={18} />
              운영 mirror
            </a>
          </div>
          <div className="summary-grid devops-summary-grid">
            <Metric icon={GitCommit} label="CI/CD" value={data.deploy?.actions?.displayStatus ?? 'API unavailable'} detail="C++ 서버 이미지 빌드와 GHCR push" valueStatus={data.deploy?.actions?.status} />
            <Metric icon={ShieldCheck} label="GitOps" value={data.deploy?.argocd?.syncStatus ?? 'API unavailable'} detail="Helm values tag 갱신과 automated sync" valueStatus={data.deploy?.argocd?.syncStatus} />
            <Metric icon={Server} label="Platform" value={data.platformSummary} detail={data.platformDetail} valueStatus={data.platformSummary === '-' ? 'check' : 'ready'} />
          </div>
        </div>
        <LivePanel data={data} loading={loading} error={error} updatedAt={updatedAt} onRefresh={load} />
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

          <Section number="2 Delivery Flow" title="배포 흐름">
            <Timeline steps={data.deploySteps} />
            <div className="mt-5">
              <DataTable headers={['단계', '책임', '검증 포인트']} rows={ciRows} />
            </div>
          </Section>

          <Section number="3 Runtime Platform" title="Kubernetes 실행 환경">
            <DataTable headers={['VM', 'VMID', 'Role', 'Status', 'Capacity']} rows={data.vmRows} />
            <div className="mt-4">
              <DataTable headers={['Layer', 'Component', 'Status', 'Live detail']} rows={data.layerRows} />
            </div>
          </Section>

          <Section number="4 Network Path" title="외부 트래픽 경로">
            <NetworkTopologyMap data={data} />
            <div className="mt-4">
              <DataTable headers={['Hostname', 'Upstream', 'Destination']} rows={data.edgeRows} />
            </div>
            <p className="mt-4 text-sm leading-7 text-zinc-700">
              Edge route 목록은 Ops API의 edge-runtime 응답을 기준으로 표시합니다. Kubernetes로 들어가는 route와
              local/docker route를 destination 값으로 구분해, 공개 경로가 어느 계층으로 연결되는지 확인합니다.
            </p>
          </Section>

          <Section number="5 Runtime Workload" title="Runtime workload">
            <DataTable headers={['Namespace', 'Workload', 'Revision / Signal', 'Status']} rows={data.workloadRows} />
            <div className="mt-4">
              <DataTable headers={['Prepared app', 'Upstream', 'Destination']} rows={data.preparedRows} />
            </div>
          </Section>

          <Section number="6 Storage" title="Storage">
            <DataTable headers={['VM', 'Status', 'Disk', 'Memory']} rows={data.storageRows} />
          </Section>

          <Section number="7 Observability" title="Observability">
            <DataTable headers={['Metric', 'Live value', 'Source']} rows={data.observabilityRows} />
            <div className="mt-4">
              <Chain tone="runtime" items={['DevOpsPortfolio.html', API_LABEL, 'FastAPI 127.0.0.1:18081', 'Prometheus', 'Proxmox API']} />
            </div>
            <p className="mt-4 text-sm leading-7 text-zinc-700">
              Live dashboard는 브라우저에서 Ops API를 호출해 Prometheus, Proxmox, GitOps rollout, C++ edge runtime 요약 상태를 읽습니다.
            </p>
          </Section>

          <Section number="8 Ops Dashboard" title="Ops Dashboard">
            <div className="ops-dashboard-frame">
              <iframe
                src="https://portfolio.mintcocoa.cc/devops/OpsDashboard.html"
                title="Ops Dashboard"
                loading="lazy"
                scrolling="no"
              />
            </div>
          </Section>
        </div>
      </div>
    </Shell>
  );
};
