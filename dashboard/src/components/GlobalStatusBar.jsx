import { Activity, RefreshCw } from 'lucide-react';

const StatusBadge = ({ label, status }) => {
  const isOk = status === 'ok' || status === 'up' || status === 'running';
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-sm shadow-sm">
      <span className="font-semibold text-slate-200">{label}</span>
      <div className={`w-3 h-3 rounded-full ${isOk ? 'bg-green-500' : 'bg-red-500'}`} />
    </div>
  );
};

export const GlobalStatusBar = ({ health, onRefresh, lastUpdated }) => {
  return (
    <div className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950 px-4 py-3 shadow-sm sm:px-6">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-lg font-bold text-white">
            <Activity size={20} className="text-blue-400" />
            Ops Dashboard V2
          </h1>
          <div className="hidden h-6 w-px bg-slate-700 sm:block"></div>
          <StatusBadge label="API" status={health?.status || 'loading'} />
          <StatusBadge label="Proxmox" status={health?.details?.proxmox?.status || 'loading'} />
          <StatusBadge label="Prometheus" status={health?.details?.prometheus?.status || 'loading'} />
        </div>
        <div className="flex items-center justify-between gap-4 lg:justify-end">
          <span className="text-xs text-slate-400">
            Last Updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '...'}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-slate-700 p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Refresh dashboard"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
