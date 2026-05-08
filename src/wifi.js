const BASE = `http://${location.hostname}:8888`;

async function call(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

export const getWifiStatus = () => call('/wifi/status');
export const scanWifi = () => call('/wifi/scan');
export const connectWifi = (ssid, password) =>
  call('/wifi/connect', { method: 'POST', body: JSON.stringify({ ssid, password }) });
