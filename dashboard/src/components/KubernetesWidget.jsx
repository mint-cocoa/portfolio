import React from 'react';
import { Box, Network, CloudRain } from 'lucide-react';

export const KubernetesWidget = ({ summary, targets }) => {
  const activeTargets = targets?.activeTargets || [];
  const downTargets = activeTargets.filter(t => t.health !== 'up');

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b pb-3">
        <Box className="text-blue-600" size={24} />
        <h2 className="text-xl font-bold text-gray-800">Kubernetes Workloads</h2>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 border rounded-lg bg-blue-50 flex items-center justify-between">
            <div>
                <p className="text-sm text-gray-500 font-medium">Scrape Targets</p>
                <p className="text-2xl font-bold text-blue-700">{activeTargets.length}</p>
            </div>
            <Network className="text-blue-300" size={32} />
        </div>
        <div className="p-4 border rounded-lg bg-green-50 flex items-center justify-between">
            <div>
                <p className="text-sm text-gray-500 font-medium">Healthy Targets</p>
                <p className="text-2xl font-bold text-green-700">{activeTargets.filter(t=>t.health==='up').length}</p>
            </div>
            <CloudRain className="text-green-300" size={32} />
        </div>
      </div>

      {downTargets.length > 0 && (
          <div className="mt-2 text-sm border-l-4 border-red-500 bg-red-50 p-3 rounded-r-md">
             <h4 className="font-semibold text-red-800 mb-1">Down Targets</h4>
             <ul className="list-disc list-inside text-red-600">
                 {downTargets.map((t, idx) => (
                     <li key={idx}>{t.labels?.job || 'Unknown Job'} : {t.labels?.instance || 'Unknown Instance'}</li>
                 ))}
             </ul>
          </div>
      )}
    </div>
  );
};
