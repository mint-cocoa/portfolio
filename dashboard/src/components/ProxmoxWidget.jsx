import React from 'react';
import { Server, Activity } from 'lucide-react';

export const ProxmoxWidget = ({ nodes = [], vms = [] }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b pb-3">
        <Server className="text-purple-600" size={24} />
        <h2 className="text-xl font-bold text-gray-800">Proxmox Infrastructure</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {nodes.map(node => (
          <div key={node.node} className="p-4 border rounded-lg bg-gray-50">
            <h3 className="font-semibold text-lg">{node.node} <span className="text-sm font-normal text-gray-500">({node.status})</span></h3>
            <div className="mt-2 text-sm text-gray-700">
              <div className="flex justify-between mb-1">
                <span>CPU Usage</span>
                <span>{(node.cpu * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${node.cpu * 100}%` }}></div>
              </div>
              <div className="flex justify-between mb-1">
                <span>Memory</span>
                <span>{(node.mem / node.maxmem * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(node.mem / node.maxmem * 100)}%` }}></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <h3 className="font-semibold text-md mb-2 flex items-center gap-2">
          <Activity size={16}/> Virtual Machines
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="p-2 border-b">ID</th>
                <th className="p-2 border-b">Name</th>
                <th className="p-2 border-b">Status</th>
                <th className="p-2 border-b">vCPU</th>
                <th className="p-2 border-b">Memory</th>
              </tr>
            </thead>
            <tbody>
              {vms.sort((a,b)=>b.cpu - a.cpu).map(vm => (
                <tr key={vm.vmid} className="text-sm border-b last:border-0 hover:bg-gray-50">
                  <td className="p-2">{vm.vmid}</td>
                  <td className="p-2 font-medium">{vm.name}</td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${vm.status === 'running' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                      {vm.status}
                    </span>
                  </td>
                  <td className="p-2">{vm.maxcpu} Cores</td>
                  <td className="p-2">{(vm.maxmem / (1024*1024*1024)).toFixed(1)} GB</td>
                </tr>
              ))}
              {vms.length === 0 && (
                 <tr>
                    <td colSpan="5" className="text-center p-4 text-gray-500">No VMs found</td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
