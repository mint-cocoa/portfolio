import { useMemo, useState } from 'react';
import { Boxes, CheckCircle2, CircleDashed, ExternalLink, GitBranch, GitCommit, Package, PlayCircle, RadioTower, ShieldCheck } from 'lucide-react';

const icons = {
  commit: GitCommit,
  actions: PlayCircle,
  image: Package,
  gitops: GitBranch,
  argocd: ShieldCheck,
  rollout: Boxes,
  live: RadioTower,
};

const statusClasses = {
  success: 'border-green-200 bg-green-50 text-green-700',
  completed: 'border-green-200 bg-green-50 text-green-700',
  running: 'border-blue-200 bg-blue-50 text-blue-700',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  queued: 'border-blue-200 bg-blue-50 text-blue-700',
  failure: 'border-red-200 bg-red-50 text-red-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
  unknown: 'border-slate-200 bg-slate-50 text-slate-600',
};

const StatusIcon = ({ status }) => {
  if (['success', 'completed'].includes(status)) return <CheckCircle2 size={16} />;
  if (['running', 'in_progress', 'queued'].includes(status)) return <PlayCircle size={16} />;
  return <CircleDashed size={16} />;
};

const DetailRow = ({ label, value }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3 border-b border-slate-100 py-2 text-xs last:border-b-0">
      <div className="font-semibold uppercase text-slate-400">{label}</div>
      <div className="min-w-0 break-words text-slate-700">{String(value)}</div>
    </div>
  );
};

const StepButton = ({ step, selected, onClick }) => {
  const Icon = icons[step.id] ?? CircleDashed;
  const statusClass = statusClasses[step.status] ?? statusClasses.unknown;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-28 rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-slate-400 ${selected ? 'ring-2 ring-slate-900' : 'ring-0'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-md border p-2 ${statusClass}`}>
          <Icon size={18} />
        </div>
        <div className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>
          <StatusIcon status={step.status} />
          {step.status}
        </div>
      </div>
      <div className="mt-3 text-sm font-bold text-slate-900">{step.label}</div>
      <div className="mt-1 truncate text-xs font-semibold text-slate-600">{step.primary}</div>
      <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{step.secondary}</div>
    </button>
  );
};

export const DeploymentPipeline = ({ pipeline }) => {
  const steps = useMemo(() => pipeline?.steps ?? [], [pipeline]);
  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(
    () => steps.find((step) => step.id === (selectedId ?? steps[0]?.id)) ?? null,
    [selectedId, steps],
  );
  const details = selected?.details ?? {};

  if (!pipeline || steps.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Interactive CI/CD</p>
          <h3 className="text-xl font-bold text-slate-900">Commit to live rollout evidence</h3>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
          <GitCommit size={14} />
          {pipeline.commit?.shortSha ?? '-'} to {pipeline.kubernetes?.readyReplicas ?? 0}/{pipeline.kubernetes?.replicas ?? 0}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {steps.map((step) => (
            <StepButton
              key={step.id}
              step={step}
              selected={selected?.id === step.id}
              onClick={() => setSelectedId(step.id)}
            />
          ))}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">{selected?.label}</div>
              <div className="mt-1 text-xs text-slate-500">{selected?.primary}</div>
            </div>
            {selected?.href && (
              <a className="rounded-md border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900" href={selected.href} target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
              </a>
            )}
          </div>
          <div className="mt-3 rounded-md border border-slate-200 bg-white px-3">
            <DetailRow label="status" value={selected?.status} />
            <DetailRow label="sha" value={details.shortSha ?? details.shortRevision ?? details.shortImageTag} />
            <DetailRow label="message" value={details.message} />
            <DetailRow label="image" value={details.image} />
            <DetailRow label="revision" value={details.shortRevision} />
            <DetailRow label="sync" value={details.syncStatus} />
            <DetailRow label="health" value={details.healthStatus} />
            <DetailRow label="replicas" value={details.replicas !== undefined ? `${details.readyReplicas}/${details.replicas}` : null} />
            <DetailRow label="assets" value={details.assets?.join(', ')} />
            <DetailRow label="updated" value={details.updatedAt ?? details.finishedAt ?? details.createdAt} />
          </div>
        </div>
      </div>
    </section>
  );
};
