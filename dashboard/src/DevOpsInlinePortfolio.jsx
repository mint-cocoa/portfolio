import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
} from '@xyflow/react';
import {
  Activity,
  Boxes,
  Cloud,
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
import '@xyflow/react/dist/style.css';
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

const flowStatusClass = (status) => `flow-node-${statusTone(status)}`;

const FlowNode = ({ data }) => {
  const Icon = data.icon ?? Network;
  const NodeTag = data.href ? 'a' : 'div';
  const nodeProps = data.href
    ? { href: data.href, target: '_blank', rel: 'noreferrer' }
    : {};

  return (
    <NodeTag className={`flow-node-card ${flowStatusClass(data.status)} ${data.compact ? 'flow-node-compact' : ''} ${data.wide ? 'flow-node-wide' : ''}`} {...nodeProps}>
      <Handle className="flow-handle" type="target" position={data.targetPosition ?? Position.Left} isConnectable={false} />
      <div className="flow-node-icon">
        <Icon size={16} />
      </div>
      <div className="flow-node-body">
        <p>{data.eyebrow}</p>
        <strong>{fallback(data.label)}</strong>
        {data.detail && <span>{fallback(data.detail)}</span>}
      </div>
      {data.href && <ExternalLink className="flow-node-link" size={13} aria-hidden="true" />}
      <Handle className="flow-handle" type="source" position={data.sourcePosition ?? Position.Right} isConnectable={false} />
    </NodeTag>
  );
};

const flowNodeTypes = {
  evidence: FlowNode,
};

const flowEdge = (id, source, target, label) => ({
  id,
  source,
  target,
  label,
  type: 'smoothstep',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
  },
  style: {
    stroke: '#94a3b8',
    strokeWidth: 1.5,
  },
  labelStyle: {
    fill: '#64748b',
    fontSize: 10,
    fontWeight: 700,
  },
  labelBgPadding: [6, 3],
  labelBgBorderRadius: 4,
  labelBgStyle: {
    fill: '#ffffff',
    fillOpacity: 0.86,
  },
});

const EvidenceFlow = ({ nodes, edges, height = 360, ariaLabel, minZoom = 0.25, fitPadding = 0.16 }) => (
  <div
    className="evidence-flow"
    style={{ '--flow-height': `${height}px`, height: `${height}px`, minHeight: `${height}px` }}
    aria-label={ariaLabel}
  >
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={flowNodeTypes}
      fitView
      fitViewOptions={{ padding: fitPadding }}
      minZoom={minZoom}
      maxZoom={1.4}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnScroll={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} color="#dbe4ef" />
      <Controls showInteractive={false} />
    </ReactFlow>
  </div>
);

const pipelineNodePosition = (index, columnCount = 4, xGap = 280, yGap = 132) => {
  const row = Math.floor(index / columnCount);
  const column = index % columnCount;
  const isReverseRow = row % 2 === 1;

  return {
    x: (isReverseRow ? columnCount - 1 - column : column) * xGap,
    y: row * yGap,
  };
};

const pipelineNodePorts = (index, total, columnCount = 4) => {
  const row = Math.floor(index / columnCount);
  const previousRow = Math.floor((index - 1) / columnCount);
  const nextRow = Math.floor((index + 1) / columnCount);
  const isReverseRow = row % 2 === 1;

  return {
    targetPosition: index > 0 && previousRow < row ? Position.Top : isReverseRow ? Position.Right : Position.Left,
    sourcePosition: index < total - 1 && nextRow > row ? Position.Bottom : isReverseRow ? Position.Left : Position.Right,
  };
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

const DOC_PATHS = {
  home: '/',
  docsRoot: '/portfolio/',
  server: '/portfolio/server/ServerCorePortfolio.html',
  client: '/portfolio/client/ClientPortfolio.html',
  devops: '/portfolio/devops/DevOpsPortfolio.html',
  ops: '/portfolio/devops/OpsDashboard.html',
};
const OPS_DASHBOARD_PATH = './OpsDashboard.html';
const LIVE_OPS_DASHBOARD_URL = DOC_PATHS.ops;
const hiddenPublicRouteHosts = new Set(['webhook.mintcocoa.cc']);

const visiblePortfolioRoute = (route) => !hiddenPublicRouteHosts.has(route?.hostname);

const currentHostname = () => {
  if (typeof window === 'undefined') return 'portfolio.mintcocoa.cc';
  return window.location.hostname || 'portfolio.mintcocoa.cc';
};

const displayCurrentHostPath = (path) => {
  if (typeof window === 'undefined') return path.replace(/^\//, '');
  return `${window.location.host}${path}`;
};

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

const runtimeSummaryCards = [
  {
    title: 'Infra',
    body: 'NAS와 남은 PC를 활용해 여러 컨테이너 이미지를 배포하고 운영할 수 있는 홈랩 인프라를 구축했습니다.',
  },
  {
    title: 'GitOps',
    body: 'Argo CD가 Git commit을 기준으로 desired state를 추적하고 클러스터 배포를 자동화합니다.',
  },
  {
    title: 'C++ Edge',
    body: 'nginx를 모방한 C++ 서버 런타임 위에 웹 서버와 HTTPS 프록시, SSL 인증서 발급 경로를 구현했습니다.',
  },
  {
    title: 'Domain',
    body: '개인 도메인과 edge proxy route를 이용해 포트폴리오 사이트와 운영 경로를 외부에 노출했습니다.',
  },
  {
    title: 'Observe',
    body: 'Prometheus/Grafana 기반 경량 모니터링과 Ops API로 클러스터와 VM 상태를 확인합니다.',
  },
  {
    title: 'Provision',
    body: 'Terraform과 Kubespray로 VM과 Kubernetes 클러스터 구축 과정을 자동화 가능한 형태로 정리했습니다.',
  },
];

const problemStatements = [
  'NAS와 남은 PC 자원을 묶어 여러 컨테이너 이미지를 안정적으로 운영할 수 있는가?',
  'Git commit을 단일 변경 기준으로 두고 Argo CD가 배포를 자동 수렴시킬 수 있는가?',
  '직접 만든 C++ 서버 런타임이 웹 서버, HTTPS, SSL 인증서 발급 가능한 프록시 역할을 수행할 수 있는가?',
  '개인 도메인에서 포트폴리오와 운영 서비스 경로를 실제로 노출할 수 있는가?',
  'Prometheus/Grafana로 홈랩 규모에 맞는 경량 모니터링을 구성할 수 있는가?',
  'Terraform과 Kubespray로 클러스터 구축 절차를 반복 가능한 코드로 남길 수 있는가?',
];

const platformLayers = [
  ['Management Plane', 'Odroid', '172.30.1.83', 'Terraform, Ansible, Kubespray, kubectl, Helm, GitOps bootstrap'],
  ['Edge Plane', 'Mini PC', '172.30.1.27', 'C++ HTTPS reverse proxy, certificate flow, Kubernetes API HAProxy'],
  ['Virtualization Plane', 'Proxmox VE', '172.30.1.12', 'VM runtime, snapshots, backup base'],
  ['Workload Plane', 'Kubernetes VMs', '172.30.1.231-235', 'Application and platform workloads'],
  ['Delivery Plane', 'GitHub Actions, GHCR, Argo CD', 'external + cluster', 'Image build, registry, GitOps deployment'],
  ['Storage Plane', 'NAS / OMV VM', '172.30.1.52', 'NFS backing store for Kubernetes PVCs and persistent data'],
];

const deploymentSteps = [
  ['01', 'GitHub push', '애플리케이션 코드 변경이 workflow를 시작합니다.'],
  ['02', 'GitHub Actions', '컨테이너 이미지를 빌드하고 GHCR에 push합니다.'],
  ['03', 'GitOps update', 'Helm values의 image tag를 commit SHA로 갱신합니다.'],
  ['04', 'Argo CD sync', '변경된 chart를 감지해 클러스터 desired state에 반영합니다.'],
  ['05', 'Kubernetes rollout', 'Deployment, Service, Ingress가 수렴하고 ingress-nginx + MetalLB 경로로 노출됩니다.'],
];

const clusterNodes = [
  ['k8s-cp-1', '172.30.1.231', 'control-plane', 'Ready', 'containerd'],
  ['k8s-cp-2', '172.30.1.232', 'control-plane', 'Ready', 'containerd'],
  ['k8s-cp-3', '172.30.1.233', 'control-plane', 'Ready', 'containerd'],
  ['k8s-worker-1', '172.30.1.234', 'worker', 'Ready', 'containerd'],
  ['k8s-worker-2', '172.30.1.235', 'worker', 'Ready', 'containerd'],
];

const operationNotes = [
  {
    title: 'Argo CD GitOps',
    body: 'GitOps repo의 Helm values와 Application manifest를 기준으로 Git commit 단위의 자동 배포 경로를 구성했습니다.',
  },
  {
    title: 'C++ Web/Proxy Runtime',
    body: 'HTTP 라우팅, 정적 파일 서빙, reverse proxy, SNI 기반 HTTPS 경로를 직접 구현한 서버 런타임 위에서 검증했습니다.',
  },
  {
    title: 'Published Routes',
    body: '개인 도메인은 edge proxy route tree에서 runtime destination별로 분기되고, Kubernetes ingress 또는 로컬 서비스로 전달됩니다.',
  },
  {
    title: 'Observability',
    body: 'Prometheus와 Grafana를 lightweight profile로 구성해 클러스터 메트릭과 운영 대시보드의 근거를 제공합니다.',
  },
  {
    title: 'Provisioning',
    body: 'Terraform으로 VM 기반을 준비하고 Kubespray로 native Kubernetes HA cluster를 재현 가능한 절차로 구축했습니다.',
  },
];

const StatusPill = ({ value }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${tone[statusTone(value)]}`}>
    {fallback(value)}
  </span>
);

const Shell = ({ children }) => (
  <div className="app-shell devops-app">
    <header className="site-header">
      <a className="brand" href={DOC_PATHS.home} aria-label="배진후 포트폴리오 홈">
        <span>JH</span>
        배진후
      </a>
      <nav aria-label="상세 포트폴리오">
        <a href={DOC_PATHS.server}>Server</a>
        <a href={DOC_PATHS.client}>Client</a>
        <a href={DOC_PATHS.devops}>DevOps</a>
        <a href={DOC_PATHS.ops}>Ops</a>
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

const RuntimePlatformDocument = () => (
  <div className="runtime-doc">
    <div className="runtime-doc-summary" aria-label="DevOps 핵심 요약">
      {runtimeSummaryCards.map((item) => (
        <article key={item.title}>
          <strong>{item.title}</strong>
          <p>{item.body}</p>
        </article>
      ))}
    </div>

    <article className="runtime-doc-prose">
      <p className="card-eyebrow">Overview</p>
      <h3>NAS와 남은 PC에서 GitOps 운영 경로까지</h3>
      <p>
        이 문서는 NAS와 남은 PC를 활용해 여러 컨테이너 이미지를 배포하고 운영할 수 있는
        인프라 환경을 구축한 과정을 정리한 운영 포트폴리오입니다. 컨테이너 이미지,
        GitHub Actions, GitOps, Argo CD, Kubernetes Ingress, NAS 기반 persistent storage를
        하나의 홈랩 운영 경로로 연결했습니다.
      </p>
      <p>
        C++ io_uring 서버 런타임에서는 nginx를 모방한 웹 서버와 HTTPS reverse proxy를
        구현했고, 개인 도메인과 SSL 인증서 발급 경로를 이용해 외부에서 접근 가능한
        route tree까지 검증했습니다. 상세 문서는 현재 호스트의 /portfolio 경로로 제공하고,
        route tree 시각화는 Ops API가 제공하는 edge runtime 데이터를 React Flow로 렌더링합니다.
      </p>
    </article>

    <div className="runtime-doc-question-grid">
      {problemStatements.map((item, index) => (
        <article key={item}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <p>{item}</p>
        </article>
      ))}
    </div>

    <div className="runtime-doc-table-card">
      <div className="runtime-doc-table-head">
        <p className="card-eyebrow">Homelab Layers</p>
        <h3>관리, edge, 가상화, workload, delivery, storage 계층 분리</h3>
      </div>
      <div className="runtime-doc-table-scroll">
        <table className="runtime-doc-table">
          <thead>
            <tr>
              <th>Layer</th>
              <th>Component</th>
              <th>Address</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {platformLayers.map(([layer, component, address, role]) => (
              <tr key={layer}>
                <td>{layer}</td>
                <td>{component}</td>
                <td><code>{address}</code></td>
                <td>{role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="runtime-doc-flow">
      <div>
        <p className="card-eyebrow">Deploy Flow</p>
        <h3>애플리케이션 코드와 운영 매니페스트를 분리한 배포 흐름</h3>
      </div>
      <ol>
        {deploymentSteps.map(([step, title, body]) => (
          <li key={step}>
            <span>{step}</span>
            <strong>{title}</strong>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </div>

    <div className="runtime-doc-table-card">
      <div className="runtime-doc-table-head">
        <p className="card-eyebrow">Kubernetes HA Cluster</p>
        <h3>Proxmox VM 위 5-node native Kubernetes cluster</h3>
        <p>검증된 버전은 Client v1.34.7 / Server v1.35.4이며 Calico CNI, CoreDNS, NodeLocal DNS, kube-proxy, metrics-server를 포함합니다.</p>
      </div>
      <div className="runtime-doc-table-scroll">
        <table className="runtime-doc-table">
          <thead>
            <tr>
              <th>Host</th>
              <th>IP</th>
              <th>Role</th>
              <th>Status</th>
              <th>Runtime</th>
            </tr>
          </thead>
          <tbody>
            {clusterNodes.map(([host, ip, role, status, runtime]) => (
              <tr key={host}>
                <td><code>{host}</code></td>
                <td><code>{ip}</code></td>
                <td>{role}</td>
                <td><StatusPill value={status} /></td>
                <td>{runtime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="runtime-doc-note-grid">
      {operationNotes.map((item) => (
        <article key={item.title}>
          <strong>{item.title}</strong>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  </div>
);

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

const PipelineOverview = ({ steps }) => {
  const nodes = steps.map((step, index) => ({
    id: step.id,
    type: 'evidence',
    position: pipelineNodePosition(index),
    data: {
      eyebrow: `0${index + 1} - ${fallback(step.status, 'check')}`,
      label: step.label,
      detail: fallback(step.value, 'Ops API 연결 시 표시'),
      status: step.status,
      href: step.href,
      icon: step.icon,
      ...pipelineNodePorts(index, steps.length),
    },
  }));
  const edges = steps.slice(0, -1).map((step, index) => (
    flowEdge(`pipeline-${step.id}-${steps[index + 1].id}`, step.id, steps[index + 1].id, steps[index + 1].label)
  ));

  return (
    <EvidenceFlow
      nodes={nodes}
      edges={edges}
      height={280}
      minZoom={0.5}
      fitPadding={0.08}
      ariaLabel="RuntimeWeb 배포 파이프라인 요약"
    />
  );
};

const routeGroupStatus = (destination) => ({
  kubernetes: 'ready',
  docker: 'running',
  'local-service': 'running',
  'api-ha': 'observed',
  'cxx-web': 'ready',
  external: 'check',
}[destination] ?? 'check');

const RouteTopologyFlow = ({ routeTreeGroups, routes, hiddenRouteCount, selectedRoute, proxyService, liveHost }) => {
  const groups = routeTreeGroups.length
    ? routeTreeGroups
    : [['check', [{ hostname: liveHost, upstream: '-', destination: 'check' }]]];
  const itemSpacing = 94;
  const groupGap = 58;
  let groupCursorY = 0;
  const groupLayouts = groups.map(([destination, items]) => {
    const apiHaRoot = destination === 'api-ha'
      ? items.find((item) => item.kind === 'haproxy') ?? items[0]
      : null;
    const apiHaChildren = destination === 'api-ha'
      ? items.filter((item) => item !== apiHaRoot)
      : [];
    const visibleItems = destination === 'api-ha' ? [apiHaRoot].filter(Boolean) : items;
    const routeRows = Math.max(visibleItems.length, apiHaChildren.length, 1);
    const height = Math.max(190, routeRows * itemSpacing);
    const layout = {
      destination,
      items,
      apiHaRoot,
      apiHaChildren,
      visibleItems,
      y: groupCursorY,
      height,
    };
    groupCursorY += height + groupGap;
    return layout;
  });
  const totalRouteHeight = Math.max(0, groupCursorY - groupGap);
  const nodes = [
    {
      id: 'edge-proxy',
      type: 'evidence',
      position: { x: 0, y: Math.max(0, totalRouteHeight / 2 - 48) },
      data: {
        eyebrow: 'Actual route tree',
        label: fallback(proxyService, 'edge proxy'),
        detail: `${routes.length || '-'} published routes${hiddenRouteCount > 0 ? ` / ${hiddenRouteCount} private` : ''}`,
        status: routes.length ? 'running' : 'check',
        icon: Network,
      },
    },
  ];
  const edges = [];
  let maxY = totalRouteHeight;

  groupLayouts.forEach(({ destination, items, apiHaChildren, visibleItems, y: groupY }) => {
    const destinationId = `destination-${destination}`;
    const sourceSummary = [...new Set(items.map((item) => routeTreeSource(item)))].join(' + ');
    nodes.push({
      id: destinationId,
      type: 'evidence',
      position: { x: 300, y: groupY },
      data: {
        eyebrow: destination === 'api-ha' ? 'Cluster API HA' : destinationLabels[destination] ?? destination,
        label: `${items.length} ${destination === 'api-ha' ? `node${items.length === 1 ? '' : 's'}` : `route${items.length === 1 ? '' : 's'}`}`,
        detail: sourceSummary,
        status: routeGroupStatus(destination),
        icon: destination === 'kubernetes' ? Cloud : destination === 'api-ha' ? ShieldCheck : Route,
        compact: true,
      },
    });
    edges.push(flowEdge(`edge-proxy-${destinationId}`, 'edge-proxy', destinationId, destinationLabels[destination] ?? destination));

    visibleItems.forEach((item, itemIndex) => {
      const itemId = `route-${destination}-${itemIndex}-${item.hostname}`;
      const y = groupY + (destination === 'api-ha' && apiHaChildren.length > 1 ? Math.floor(apiHaChildren.length / 2) * itemSpacing : itemIndex * itemSpacing);
      nodes.push({
        id: itemId,
        type: 'evidence',
        position: { x: 600, y },
        data: {
          eyebrow: item === selectedRoute ? 'Selected public path' : routeTreeDestination(item),
          label: item.hostname,
          detail: item.upstream,
          status: item === selectedRoute ? 'live' : routeGroupStatus(routeTreeDestination(item)),
          href: publicRouteHref(item),
          icon: item.kind === 'haproxy' ? ShieldCheck : item.kind === 'control-plane' ? Server : ExternalLink,
          compact: true,
        },
      });
      edges.push(flowEdge(`${destinationId}-${itemId}`, destinationId, itemId, item === selectedRoute ? 'selected' : undefined));
      maxY = Math.max(maxY, y);

      if (destination === 'api-ha') {
        apiHaChildren.forEach((child, childIndex) => {
          const childId = `route-api-ha-child-${childIndex}-${child.upstream}`;
          const childY = groupY + childIndex * itemSpacing;
          nodes.push({
            id: childId,
            type: 'evidence',
            position: { x: 895, y: childY },
            data: {
              eyebrow: child.kind ?? 'control-plane',
              label: child.hostname,
              detail: child.upstream,
              status: 'running',
              icon: Server,
              compact: true,
            },
          });
          edges.push(flowEdge(`${itemId}-${childId}`, itemId, childId, '6443'));
          maxY = Math.max(maxY, childY);
        });
      }
    });
  });

  return (
    <EvidenceFlow
      nodes={nodes}
      edges={edges}
      height={Math.max(420, maxY + 150)}
      ariaLabel="Actual edge route topology"
    />
  );
};

const TrafficPathFlow = ({ entryPath, publicBranch, route }) => {
  const branchIcons = [ShieldCheck, Split, Cloud, Package];
  const branchStatuses = [
    'running',
    route?.destination === 'kubernetes' ? 'live' : route?.destination ?? 'check',
    route?.destination === 'kubernetes' ? 'ready' : route?.destination ?? 'observed',
    'ready',
  ];
  const steps = [
    ...entryPath.map(([label, primary, secondary, status, Icon]) => ({
      id: `entry-${label}`,
      eyebrow: label,
      label: primary,
      detail: secondary,
      status,
      icon: Icon,
    })),
    ...publicBranch.map(([label, primary, secondary], index) => ({
      id: `branch-${label}`,
      eyebrow: label,
      label: primary,
      detail: secondary,
      status: branchStatuses[index],
      icon: branchIcons[index] ?? Route,
    })),
  ];
  const nodes = steps.map((step, index) => ({
    id: step.id,
    type: 'evidence',
    position: pipelineNodePosition(index, 4, 292, 142),
    data: {
      eyebrow: `${String(index + 1).padStart(2, '0')} - ${step.eyebrow}`,
      label: step.label,
      detail: step.detail,
      status: step.status,
      icon: step.icon,
      wide: true,
      ...pipelineNodePorts(index, steps.length),
    },
  }));
  const edges = steps.slice(0, -1).map((step, index) => (
    flowEdge(`traffic-${step.id}-${steps[index + 1].id}`, step.id, steps[index + 1].id)
  ));

  return (
    <EvidenceFlow
      nodes={nodes}
      edges={edges}
      height={330}
      minZoom={0.5}
      fitPadding={0.02}
      ariaLabel="External public traffic path"
    />
  );
};

const HeroDashboardPreview = () => (
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
      <strong>{displayCurrentHostPath(LIVE_OPS_DASHBOARD_URL)}</strong>
      <ExternalLink size={16} />
    </a>
  </aside>
);

const NetworkTopologyMap = ({ data }) => {
  const allRoutes = data.edge?.routes ?? [];
  const routes = allRoutes.filter(visiblePortfolioRoute);
  const hiddenRouteCount = allRoutes.length - routes.length;
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
    ['Runtime Proxy', data.edge?.proxy?.service ?? 'tcp_reverse_proxy', topology.publicListen],
    ['SNI Route', route?.hostname ?? data.liveHost, route?.upstream ?? data.edge?.proxy?.default_upstream],
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

        <div className="mt-4">
          <TrafficPathFlow entryPath={entryPath} publicBranch={publicBranch} route={route} />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4">
          <div>
            <h4 className="text-base font-black text-zinc-950">Published route tree</h4>
            <p className="mt-1 text-sm font-semibold text-zinc-500">
              {routes.length || '-'} public routes are grouped by runtime destination.
            </p>
          </div>
          <StatusPill value={`${hiddenRouteCount} private hidden`} />
        </div>
        <RouteTopologyFlow
          routeTreeGroups={routeTreeGroups}
          routes={routes}
          hiddenRouteCount={hiddenRouteCount}
          selectedRoute={route}
          proxyService={data.edge?.proxy?.service}
          liveHost={data.liveHost}
        />
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
    const liveHost = currentHostname();
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
      .filter((route) => ['dropapp.mintcocoa.cc'].includes(route.hostname))
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
        label: 'Docs HTTPS',
        value: liveHost,
        detail: '/portfolio 공개 경로',
        status: 'live',
        href: DOC_PATHS.docsRoot,
        linkLabel: 'Open docs',
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
            NAS와 남은 PC를 활용해 Kubernetes 실행 환경을 구축하고 GitHub Actions, GHCR, Argo CD로
            컨테이너 배포를 자동화했습니다. C++ HTTPS 프록시와 Prometheus/Grafana 기반 운영 상태를
            이 페이지의 React Flow route tree에 연결했습니다.
          </p>
          <div className="hero-document-card">
            <div className="hero-document-head">
              <Activity size={18} />
              <span>DevOps document</span>
            </div>
            <h2>NAS/PC 기반 GitOps 홈 Kubernetes 운영</h2>
            <p>클러스터 구축 자동화, C++ edge proxy, 개인 도메인 route, 모니터링을 실제 운영 API와 연결해 문서화했습니다.</p>
            <div className="hero-actions" aria-label="주요 링크">
              <a className="button" href={DOC_PATHS.devops} target="_blank" rel="noreferrer">
                상세 문서
                <ExternalLink size={16} />
              </a>
              <a className="button" href={LIVE_OPS_DASHBOARD_URL} target="_blank" rel="noreferrer">
                Ops Dashboard
                <Cloud size={16} />
              </a>
            </div>
            <div className="hero-tag-list" aria-label="기술 스택">
              {['Kubernetes', 'Argo CD', 'C++ HTTPS Proxy', 'Terraform', 'Kubespray'].map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <HeroDashboardPreview />
      </section>

      <div className="devops-content-grid devops-content-grid-wide">
        <div>
          <Section number="1 Overview" title="프로젝트 개요">
            <div className="work-card overview-pipeline-card">
              <div className="work-card-body">
                <div className="pipeline-overview-title">
                  <div>
                    <p className="card-eyebrow">Pages Delivery</p>
                    <h3>Source commit에서 Argo CD와 공개 경로까지 이어지는 운영 흐름</h3>
                  </div>
                  <div className="pipeline-api-state">
                    <StatusPill value={data.health?.ok ? 'live API' : error ? 'partial API' : loading ? 'loading' : 'static overview'} />
                    <span>{API_LABEL} · updated {formatTime(updatedAt)}</span>
                  </div>
                </div>
                <p className="pipeline-overview-copy">
                  GitHub Actions가 컨테이너 이미지를 만들고 GHCR에 push한 뒤 GitOps repo의
                  image tag를 commit SHA로 갱신합니다. Argo CD는 해당 commit을 기준으로
                  Kubernetes desired state를 수렴시키며, 공개 문서와 route tree는 현재 호스트의
                  /portfolio 경로와 Ops API를 통해 운영 증거를 함께 보여줍니다.
                </p>
                <dl className="overview-inline-facts">
                  <div>
                    <dt>Runtime source</dt>
                    <dd>{data.liveWorkload === '-' && data.liveRevision === '-' ? 'Ops API 연결 시 표시' : `${data.liveWorkload} @ ${data.liveRevision}`}</dd>
                  </div>
                  <div>
                    <dt>Verification path</dt>
                    <dd>{'commit -> image -> GitOps -> Argo CD -> route tree'}</dd>
                  </div>
                </dl>
                <PipelineOverview steps={data.overviewPipeline} />
              </div>
            </div>
          </Section>

          <Section
            number="2 Runtime Platform"
            title="Kubernetes 실행 환경"
            kicker="NAS와 남은 PC를 재활용해 여러 컨테이너 이미지를 운영할 수 있도록 계층을 나눠 구성했습니다."
          >
            <RuntimePlatformDocument />
          </Section>

          <Section number="3 Network Path" title="외부 트래픽과 Published route tree">
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
