import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  Boxes,
  CheckCircle2,
  Cloud,
  ExternalLink,
  GitBranch,
  GitCommit,
  HardDrive,
  Network,
  Package,
  PlayCircle,
  RefreshCw,
  Rocket,
  Server,
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
};

const fallbackSteps = [
  {
    id: 'commit',
    label: 'Commit',
    status: 'observed',
    primary: '<GITHUB_SHA>',
    secondary: 'Developer commit enters the app repository',
  },
  {
    id: 'actions',
    label: 'Actions',
    status: 'success',
    primary: 'GitHub Actions',
    secondary: 'Docker multi-stage build and C++ server compile',
  },
  {
    id: 'image',
    label: 'Image',
    status: 'ok',
    primary: 'ghcr.io/mint-cocoa/portfolio:<GITHUB_SHA>',
    secondary: 'Runtime image contains the server binary and static docs only',
  },
  {
    id: 'gitops',
    label: 'GitOps',
    status: 'ok',
    primary: 'apps/portfolio/values.yaml',
    secondary: 'Helm image tag is promoted by commit',
  },
  {
    id: 'argocd',
    label: 'Argo CD',
    status: 'Synced',
    primary: 'Automated sync',
    secondary: 'prune, self-heal, CreateNamespace',
  },
  {
    id: 'rollout',
    label: 'Rollout',
    status: 'running',
    primary: 'Kubernetes Deployment',
    secondary: 'Ready replicas, Service, Ingress',
  },
  {
    id: 'live',
    label: 'Live',
    status: 'live',
    primary: 'portfolio.mintcocoa.cc',
    secondary: 'HTTPS route and Ops API dashboard verification',
  },
];

const ciRows = [
  ['Source', '앱 repository commit', '배포 이미지 tag와 commit SHA 연결'],
  ['CI', 'Docker build, C++ server build, image push', 'GitHub Actions 성공, GHCR image 존재'],
  ['Promotion', 'GitOps repo values 변경', 'apps/portfolio/values.yaml tag 갱신'],
  ['CD', 'Argo CD sync/self-heal', 'Application Synced / Healthy'],
  ['Runtime verification', 'Kubernetes rollout, Service, Ingress', 'ready replicas, live HTTPS 응답'],
];

const nextSteps = [
  'Edge proxy routing을 정리해 demo.mintcocoa.cc, grafana.homelab.local, argocd.homelab.local도 172.30.1.240 ingress backend로 라우팅',
  'dropapp과 webhook-inbox Argo CD Application 활성화 후 live cluster 검증',
  'repository와 Terraform path에 남은 k3s 명칭을 Kubespray 기반 native Kubernetes HA cluster 기준으로 정리',
  'Edge proxy virtual host 정리 후 public DNS와 home router forwarding을 외부 네트워크에서 재검증',
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

const FactGrid = ({ rows }) => (
  <div className="serving-root-grid">
    {rows.map(([label, value]) => (
      <article key={label}>
        <p className="card-eyebrow">{label}</p>
        <strong>{value}</strong>
      </article>
    ))}
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
  <div className="relative grid gap-0">
    {steps.map((step, index) => {
      const Icon = timelineIcons[step.id] ?? CheckCircle2;
      const isLast = index === steps.length - 1;
      return (
        <div key={step.id} className="relative grid grid-cols-[56px_1fr] gap-4 pb-5 last:pb-0">
          {!isLast && <div className="absolute left-[27px] top-14 h-[calc(100%-44px)] w-px bg-zinc-300" aria-hidden="true" />}
          <div className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-full border-2 bg-white ${tone[statusTone(step.status)]}`}>
            <Icon size={23} />
          </div>
          <div className="work-card timeline-work-card">
            <div className="work-card-body">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black text-zinc-500">Step {index + 1}</div>
                <h3 className="mt-1 text-xl font-black leading-tight text-zinc-950">{step.label}</h3>
              </div>
              <StatusPill value={step.status ?? step.primary} />
            </div>
            <div className="mt-3 break-words text-base font-black text-zinc-900">{fallback(step.primary)}</div>
            <p className="mt-1 break-words text-sm leading-6 text-zinc-600">{fallback(step.secondary)}</p>
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
);

const Chain = ({ items }) => (
  <div className="tag-row">
    {items.map((item, index) => (
      <span key={`${item}-${index}`}>{item}</span>
    ))}
  </div>
);

const LivePanel = ({ data, loading, error, updatedAt, onRefresh }) => (
  <aside className="hero-devops live-panel">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-black text-zinc-500">Live Companion</div>
        <h2 className="mt-1 text-xl font-black text-zinc-950">현재 관측값</h2>
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
        ['Rollout', `${fallback(data.deploy?.kubernetes?.readyReplicas)}/${fallback(data.deploy?.kubernetes?.replicas)} ready`],
        ['Live', data.deploy?.live?.url ?? 'https://portfolio.mintcocoa.cc'],
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
    try {
      const [health, summary, deploy, edge, prometheus, targets, nodes, vms] = await Promise.all([
        fetchHealth(),
        fetchSummary(),
        fetchDeployPipeline(),
        fetchEdgeRuntime(),
        fetchPrometheusSummary(),
        fetchPrometheusTargets(),
        fetchProxmoxNodes(),
        fetchProxmoxResources('vm'),
      ]);
      setSnapshot({ health, summary, deploy, edge, prometheus, targets, nodes, vms });
      setUpdatedAt(new Date());
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
    const controlPlanes = k8sVms.filter((vm) => vm.name?.includes('cp')).length || 3;
    const workers = k8sVms.filter((vm) => vm.name?.includes('worker')).length || 2;
    const deploySteps = snapshot.deploy?.steps?.length ? snapshot.deploy.steps : fallbackSteps;
    const vmRows = k8sVms.map((vm) => [
      vm.name,
      vm.vmid,
      vmRole(vm.name),
      vm.status,
      `${fallback(vm.maxcpu)} CPU / ${formatGiB(vm.maxmem)}`,
    ]);
    const proxmoxNode = nodes[0];
    const layerRows = [
      ['Virtualization', proxmoxNode?.node ?? 'Proxmox', proxmoxNode?.status ?? '-', `${fallback(proxmoxNode?.maxcpu)} CPU / ${formatGiB(proxmoxNode?.maxmem)}`],
      ['Workload VMs', `${k8sVms.length || '-'} Kubernetes VMs`, `${runningVms}/${vms.length || '-'} VMs running`, `${controlPlanes} control-plane + ${workers} worker`],
      ['Delivery', snapshot.deploy?.actions?.workflowName ?? 'GitHub Actions', snapshot.deploy?.actions?.status ?? '-', snapshot.deploy?.image?.repository ?? '-'],
      ['GitOps', snapshot.deploy?.argocd?.name ?? 'portfolio', `${fallback(snapshot.deploy?.argocd?.syncStatus)} / ${fallback(snapshot.deploy?.argocd?.healthStatus)}`, snapshot.deploy?.argocd?.shortRevision ?? '-'],
      ['Edge', snapshot.edge?.proxy?.service ?? 'edge proxy', `${snapshot.edge?.destinationCounts?.kubernetes ?? '-'} Kubernetes routes`, snapshot.edge?.proxy?.default_upstream ?? '-'],
    ];
    const edgeRows = (snapshot.edge?.routes ?? []).map((route) => [
      route.hostname,
      route.upstream,
      route.destination,
    ]);
    const workloadRows = [
      [snapshot.deploy?.kubernetes?.namespace ?? 'portfolio', snapshot.deploy?.kubernetes?.name ?? 'portfolio', snapshot.deploy?.kubernetes?.shortImageTag ?? '-', `${fallback(snapshot.deploy?.kubernetes?.readyReplicas)}/${fallback(snapshot.deploy?.kubernetes?.replicas)} ready`],
      [snapshot.deploy?.argocd?.namespace ?? 'argocd', snapshot.deploy?.argocd?.name ?? 'portfolio', snapshot.deploy?.argocd?.shortRevision ?? '-', `${fallback(snapshot.deploy?.argocd?.syncStatus)} / ${fallback(snapshot.deploy?.argocd?.healthStatus)}`],
      ['monitoring', 'prometheus targets', `${snapshot.prometheus?.targets?.up ?? '-'}/${snapshot.prometheus?.targets?.total ?? '-'} up`, `${snapshot.prometheus?.series?.pods ?? '-'} pod series`],
      ['edge', snapshot.edge?.proxy?.service ?? 'tcp_reverse_proxy', `${snapshot.edge?.proxy?.running_worker_count ?? '-'}/${snapshot.edge?.proxy?.configured_worker_count ?? '-'} workers`, `${snapshot.edge?.proxy?.total_live_sessions ?? '-'} sessions`],
    ];
    const preparedRows = (snapshot.edge?.routes ?? [])
      .filter((route) => ['dropapp.mintcocoa.cc', 'webhook.mintcocoa.cc'].includes(route.hostname))
      .map((route) => [route.hostname.replace('.mintcocoa.cc', ''), route.upstream, route.destination]);
    const preparedNames = preparedRows.map(([name]) => name).join(', ') || '-';
    const liveHost = (snapshot.deploy?.live?.url ?? 'https://portfolio.mintcocoa.cc').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const overviewRows = [
      ['문서 역할', 'Ops API live data와 연결된 홈랩 DevOps 경로'],
      ['현재 live 배포', `${snapshot.deploy?.kubernetes?.name ?? '-'} @ ${snapshot.deploy?.kubernetes?.shortImageTag ?? '-'}`],
      ['준비된 배포 후보', preparedNames],
      ['이미지 레지스트리', snapshot.deploy?.image?.repository ?? '-'],
      ['배포 제어', `${fallback(snapshot.deploy?.actions?.workflowName)} + ${fallback(snapshot.deploy?.argocd?.syncStatus)} / ${fallback(snapshot.deploy?.argocd?.healthStatus)}`],
      ['실행 환경', `${k8sVms.length || '-'} Kubernetes VMs on ${proxmoxNode?.node ?? 'Proxmox'}`],
      ['검증된 공개 경로', liveHost],
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
      deploySteps,
      vmRows,
      layerRows,
      edgeRows,
      workloadRows,
      preparedRows,
      observabilityRows,
      storageRows,
      overviewRows,
      liveHost,
    };
  }, [snapshot]);

  return (
    <Shell>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">C++ Server · GitOps · Kubernetes</p>
          <h1>홈랩 DevOps 포트폴리오</h1>
          <p className="lead">
            C++ io_uring 런타임을 Kubernetes 홈랩에 배포하고 운영하는 전체 경로.
            코드는 이미지가 되고, GitOps desired state로 승격되고, Argo CD를 지나 live HTTPS endpoint까지 도달합니다.
          </p>
          <div className="hero-actions" aria-label="주요 링크">
            <a className="button primary" href="https://mint-cocoa.github.io/portfolio/">
              <BookOpen size={18} />
              포트폴리오 상세 문서
            </a>
            <a className="button" href="https://portfolio.mintcocoa.cc/devops/DevOpsPortfolio.html" target="_blank" rel="noreferrer">
              <Activity size={18} />
              운영 mirror
            </a>
          </div>
          <div className="summary-grid devops-summary-grid">
            <Metric icon={GitCommit} label="CI/CD" value={data.deploy?.actions?.displayStatus ?? 'GitHub Actions'} detail="C++ 서버 이미지 빌드와 GHCR push" valueStatus={data.deploy?.actions?.status} />
            <Metric icon={ShieldCheck} label="GitOps" value={data.deploy?.argocd?.syncStatus ?? 'Argo CD'} detail="Helm values tag 갱신과 automated sync" valueStatus={data.deploy?.argocd?.syncStatus} />
            <Metric icon={Server} label="Platform" value={`${data.controlPlanes} + ${data.workers}`} detail="control-plane + worker native Kubernetes" valueStatus="ready" />
          </div>
        </div>
        <LivePanel data={data} loading={loading} error={error} updatedAt={updatedAt} onRefresh={load} />
      </section>

      <div className="devops-content-grid">
        <div>
          <Section number="1 Overview" title="Commit에서 Live까지 이어지는 홈랩 DevOps 경로">
            <div className="work-grid overview-work-grid">
              <FactGrid rows={data.overviewRows} />
              <div className="work-card">
                <div className="work-card-body">
                <p className="text-sm leading-7 text-zinc-700">
                  이 문서는 단순히 CI/CD workflow만 보여주는 것이 아니라, 코드가 이미지로 빌드되고,
                  GitOps desired state로 승격되고, Kubernetes에 배포되고, 외부 트래픽과 관측 시스템까지 연결되는 전체 DevOps 흐름을 정리합니다.
                </p>
                <div className="mt-4">
                  <Chain items={['Commit', 'Actions', 'Image', 'GitOps', 'Argo CD']} />
                  <div className="mt-2">
                    <Chain items={['Rollout', 'Service', 'Ingress', 'Ops API', 'Live']} />
                  </div>
                </div>
                </div>
              </div>
            </div>
          </Section>

          <Section number="2 CI/CD Pipeline" title="Commit -> Actions -> Image -> GitOps -> Argo CD -> Rollout -> Live">
            <Timeline steps={data.deploySteps} />
            <div className="mt-5">
              <DataTable headers={['단계', '책임', '검증 포인트']} rows={ciRows} />
            </div>
            <p className="mt-4 text-sm leading-7 text-zinc-700">
              배포 단위는 branch나 latest tag가 아니라 commit SHA입니다. Kubernetes에서 실행 중인 image tag를 보면 어떤 앱 commit이 배포되었는지 바로 추적할 수 있고,
              Argo CD revision을 보면 어떤 GitOps commit이 cluster state를 만들었는지 확인할 수 있습니다.
            </p>
          </Section>

          <Section number="3 Infrastructure Platform" title="Proxmox VM 위 5-node native Kubernetes HA cluster">
            <DataTable headers={['VM', 'VMID', 'Role', 'Status', 'Capacity']} rows={data.vmRows} />
            <div className="mt-4">
              <DataTable headers={['Layer', 'Component', 'Status', 'Live detail']} rows={data.layerRows} />
            </div>
          </Section>

          <Section number="4 Networking And Exposure" title="Edge proxy에서 Pod까지 이어지는 외부 트래픽 경로">
            <Chain items={['Internet', data.edge?.proxy?.service ?? 'edge proxy', data.edge?.routes?.find((route) => route.hostname === 'portfolio.mintcocoa.cc')?.upstream ?? 'portfolio upstream', 'ingress-nginx', data.deploy?.kubernetes?.name ?? 'portfolio']} />
            <div className="mt-4">
              <DataTable headers={['Hostname', 'Upstream', 'Destination']} rows={data.edgeRows} />
            </div>
            <p className="mt-4 text-sm leading-7 text-zinc-700">
              Edge route 목록은 /api/edge-runtime 응답을 그대로 사용합니다. Kubernetes로 들어가는 route와 local/docker route를 destination 값으로 구분합니다.
            </p>
          </Section>

          <Section number="5 Runtime Workloads" title="Live workload와 prepared workload를 분리해 표시">
            <DataTable headers={['Namespace', 'Workload', 'Revision / Signal', 'Status']} rows={data.workloadRows} />
            <div className="mt-4">
              <DataTable headers={['Prepared app', 'Upstream', 'Destination']} rows={data.preparedRows} />
            </div>
          </Section>

          <Section number="6 Storage" title="Storage-related live signals">
            <DataTable headers={['VM', 'Status', 'Disk', 'Memory']} rows={data.storageRows} />
          </Section>

          <Section number="7 Observability" title="Prometheus, Grafana, Ops API, split dashboard">
            <DataTable headers={['Metric', 'Live value', 'Source']} rows={data.observabilityRows} />
            <div className="mt-4">
              <Chain items={['DevOpsPortfolio.html', API_LABEL, 'FastAPI 127.0.0.1:18081', 'Prometheus', 'Proxmox API']} />
            </div>
            <p className="mt-4 text-sm leading-7 text-zinc-700">
              Live dashboard는 브라우저에서 Ops API를 호출해 Prometheus, Proxmox, GitOps rollout, C++ edge runtime 요약 상태를 읽습니다.
              CORS는 https://portfolio.mintcocoa.cc와 https://mint-cocoa.github.io만 허용합니다.
            </p>
          </Section>

          <Section number="8 Gaps And Next Steps" title="남은 운영 gap">
            <ul className="grid gap-3">
              {nextSteps.map((item) => (
                <li key={item} className="border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700">{item}</li>
              ))}
            </ul>
          </Section>

          <Section number="9 Retrospective" title="빌드 가능한 코드에서 운영 가능한 서비스로">
            <p className="text-sm leading-7 text-zinc-700">
              가장 큰 성과는 C++ 서버 구현을 빌드 가능한 코드에서 끝내지 않고 image, GitOps desired state,
              Argo CD reconciliation, Kubernetes runtime, public ingress, observability까지 연결한 점입니다.
              앞으로는 준비된 앱 후보를 같은 pipeline에 태워 portfolio 외의 live workload로 확장하는 것이 다음 단계입니다.
            </p>
          </Section>

          <Section number="10 관련 레포" title="구성 요소별 repository 역할">
            <DataTable headers={['레포', '역할']} rows={[
              ['iouring-runtime', 'C++ runtime, web module, proxy module'],
              ['portfolio', '이 문서와 C++ 정적 파일 서버 이미지'],
              ['home-k8s-gitops', 'Helm values, Argo CD Application, cluster'],
            ]} />
          </Section>
        </div>

        <aside className="devops-side-rail">
          <section className="work-card">
            <div className="work-card-body">
            <div className="flex items-center gap-2 text-sm font-black text-zinc-500">
              <Activity size={16} />
              Evidence
            </div>
            <h2 className="mt-2 text-xl font-black text-zinc-950">Live API 값</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              본문 표와 오른쪽 패널은 현재 Ops API 응답으로 최신 상태를 덧씌웁니다.
            </p>
            <div className="mt-4 grid gap-3">
              <Metric icon={Rocket} label="Live deploy" value={data.deploy?.kubernetes?.name ?? 'portfolio'} detail={data.deploy?.kubernetes?.image ?? 'C++ static server'} valueStatus="running" />
              <Metric icon={Network} label="Public route" value={data.liveHost} detail="portfolio HTTPS route" valueStatus={data.deploy?.live?.ok ? 'live' : 'check'} />
              <Metric icon={HardDrive} label="Proxmox VMs" value={data.vms?.length || '-'} detail="VM resources observed through Ops API" valueStatus="observed" />
            </div>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  );
};
