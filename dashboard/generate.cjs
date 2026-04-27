const fs = require('fs');

let html = fs.readFileSync('extracted.html', 'utf-8');

html = html.replace(/class=/g, 'className=')
           .replace(/style="([^"]*)"/g, 'style={{}}')
           .replace(/stroke-width/g, 'strokeWidth')
           .replace(/stroke-dasharray/g, 'strokeDasharray')
           .replace(/marker-end/g, 'markerEnd')
           .replace(/preserveAspectRatio/g, 'preserveAspectRatio')
           .replace(/aria-hidden/g, 'ariaHidden')
           .replace(/aria-label/g, 'ariaLabel');

html = html.replace(/<button([^>]*)data-endpoint="([^"]+)"([^>]*)data-title="([^"]+)"(.*?)>/g, '<button$1onClick={() => updateSelectedEndpoint("$2", "$4")}$3$5>')

const jsx = `import React, { useState, useEffect } from 'react';
import './styles.css';

const OPS_API_BASE = "https://ops-api.mintcocoa.cc";

function formatBytes(bytes) {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b <= 0) return "-";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = b;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return \`\${size.toFixed(index === 0 ? 0 : 1)} \${units[index]}\`;
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "-";
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  if (days > 0) return \`\${days}d \${hours}h\`;
  return \`\${hours}h\`;
}

export default function App() {
  const [health, setHealth] = useState({});
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedEndpoint, setSelectedEndpoint] = useState('/api/ops/summary');
  const [selectedTitle, setSelectedTitle] = useState('Ops Summary');
  const [endpointData, setEndpointData] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [healthRes, summaryRes] = await Promise.all([
          fetch(OPS_API_BASE + "/api/health").then(r => r.json()),
          fetch(OPS_API_BASE + "/api/ops/summary").then(r => r.json())
        ]);
        setHealth(healthRes);
        setSummary(summaryRes);
      } catch(err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    async function fetchEndpoint() {
      setEndpointData({ loading: true });
      try {
        const res = await fetch(OPS_API_BASE + selectedEndpoint);
        const json = await res.json();
        setEndpointData({ data: json });
      } catch(err) {
        setEndpointData({ error: err.message });
      }
    }
    fetchEndpoint();
  }, [selectedEndpoint]);

  function updateSelectedEndpoint(endpoint, title) {
    setSelectedEndpoint(endpoint);
    setSelectedTitle(title);
  }

  const prom = summary?.prometheus?.data;
  const node = summary?.proxmoxNodes?.data?.nodes?.[0];
  const vms = summary?.proxmoxVMs?.data?.resources ?? [];
  const runningVms = vms.filter((vm) => vm.status === "running").length;
  
  return (
    <div className="ops-dashboard">
      <header>
        <h1>Live Ops Dashboard</h1>
      </header>
      ${html}
    </div>
  );
}
`;

fs.writeFileSync('src/App.jsx', jsx);
console.log('Done!');