const BASE = `http://${location.hostname}:8888`;

async function call(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

export const getWifiStatus = () => call('/wifi/status');
export const scanWifi = () => call('/wifi/scan');
export const connectWifi = (ssid, password) =>
  call('/wifi/connect', { method: 'POST', body: JSON.stringify({ ssid, password }) });
export const disconnectWifi = (ssid) =>
  call('/wifi/disconnect', { method: 'POST', body: JSON.stringify({ ssid }) });
export const getWifiProfile = (ssid) =>
  call(`/wifi/profile?ssid=${encodeURIComponent(ssid)}`);
export const setWifiAutoconnect = (ssid, enabled) =>
  call('/wifi/autoconnect', { method: 'POST', body: JSON.stringify({ ssid, enabled }) });
