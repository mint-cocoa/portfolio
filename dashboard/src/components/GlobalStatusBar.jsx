import React from 'react';
import { Activity, Server, Database, RefreshCw } from 'lucide-react';

const StatusBadge = ({ label, status }) => {
  const isOk = status === 'ok' || status === 'up' || status === 'running';
  return (
    <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-gray-200 text-sm">
      <span className="font-semibold text-gray-700">{label}</span>
      <div className={`w-3 h-3 rounded-full ${isOk ? 'bg-green-500' : 'bg-red-500'}`} />
    </div>
  );
};

export const GlobalStatusBar = ({ health, onRefresh, lastUpdated }) => {
  return (
    <div className="bg-white border-b sticky top-0 z-50 shadow-sm px-6 py-3 flex justify-between items-center">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Activity size={20} className="text-blue-600" />
          Ops Dashboard V2
        </h1>
        <div className="h-6 w-px bg-gray-300 mx-2"></div>
        <StatusBadge label="API" status={health?.status || 'loading'} />
        <StatusBadge label="Proxmox" status={health?.details?.proxmox?.status || 'loading'} />
        <StatusBadge label="Prometheus" status={health?.details?.prometheus?.status || 'loading'} />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-gray-500">
          Last Updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '...'}
        </span>
        <button 
          onClick={onRefresh}
          className="p-2 rounded hover:bg-gray-100 transition-colors cursor-pointer text-gray-600"
        >
          <RefreshCw size={18} />
        </button>
      </div>
    </div>
  );
};
