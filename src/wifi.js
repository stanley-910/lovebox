// Wi-Fi client. Talks to the Pi's sleep-server on :8888.
// Falls back to an in-memory mock when the backend is unreachable (e.g. Mac
// dev). The mock activates lazily on the first network failure and persists
// for the session, so the UI is fully testable without the Pi.

const BASE = `http://${location.hostname}:8888`;

let mockMode = false;
let mockChecked = false;

const mockState = {
  connected: 'swifi_v2',
  ip: '192.168.2.38',
  profiles: {
    swifi_v2: { autoconnect: true },
    BELL842:  { autoconnect: false },
  },
  networks: [
    { ssid: 'swifi_v2', signal: 78, security: 'WPA2' },
    { ssid: 'BELL240',  signal: 82, security: 'WPA2' },
    { ssid: 'BELL486',  signal: 74, security: 'WPA2' },
    { ssid: 'BELL557',  signal: 62, security: 'WPA2' },
    { ssid: 'BELL842-V', signal: 59, security: 'WPA2' },
    { ssid: 'BELL842',  signal: 55, security: 'WPA2' },
    { ssid: 'cafe_guest', signal: 45, security: '' },
    { ssid: 'BELL001',  signal: 25, security: 'WPA2' },
  ],
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

// Try real call once at startup. If it errors (network unreachable, timeout),
// flip to mock mode for the rest of the session.
async function withFallback(realFn, mockFn) {
  if (mockMode) return mockFn();
  if (!mockChecked) {
    mockChecked = true;
    try {
      // Probe with a short-circuit on /status; if this works, real backend is up
      await fetch(`${BASE}/wifi/status`, { method: 'GET' });
    } catch {
      mockMode = true;
      console.info('[wifi] backend unreachable — using mock networks');
      return mockFn();
    }
  }
  try {
    return await realFn();
  } catch (e) {
    // First real call failed even though probe passed — most likely the
    // backend died between probe and call. Don't swallow further errors.
    throw e;
  }
}

// ── Real implementations ──
const realStatus  = () => call('/wifi/status');
const realScan    = () => call('/wifi/scan');
const realConnect = (ssid, password) =>
  call('/wifi/connect', { method: 'POST', body: JSON.stringify({ ssid, password }) });
const realDisconnect = (ssid) =>
  call('/wifi/disconnect', { method: 'POST', body: JSON.stringify({ ssid }) });
const realProfile = (ssid) => call(`/wifi/profile?ssid=${encodeURIComponent(ssid)}`);
const realAutoconnect = (ssid, enabled) =>
  call('/wifi/autoconnect', { method: 'POST', body: JSON.stringify({ ssid, enabled }) });

// ── Mock implementations ──
async function mockStatus() {
  await wait(120);
  if (!mockState.connected) return { ssid: null, signal: 0, ip: null };
  const n = mockState.networks.find((x) => x.ssid === mockState.connected);
  return { ssid: mockState.connected, signal: n?.signal || 60, ip: mockState.ip };
}

async function mockScan() {
  await wait(800);
  return {
    networks: mockState.networks.map((n) => ({
      ...n,
      in_use: n.ssid === mockState.connected,
    })).sort((a, b) => (a.in_use ? -1 : b.in_use ? 1 : b.signal - a.signal)),
  };
}

async function mockConnect(ssid, password) {
  await wait(1200);
  const n = mockState.networks.find((x) => x.ssid === ssid);
  if (!n) return { ok: false, error: 'network not found' };
  const secured = n.security && n.security !== '';
  if (secured && (!password || password.length < 8)) {
    return { ok: false, error: 'Secrets were required, but not provided' };
  }
  mockState.connected = ssid;
  mockState.profiles[ssid] = mockState.profiles[ssid] || { autoconnect: true };
  return { ok: true };
}

async function mockDisconnect(ssid) {
  await wait(400);
  if (mockState.connected === ssid) mockState.connected = null;
  return { ok: true };
}

async function mockProfile(ssid) {
  await wait(150);
  const p = mockState.profiles[ssid];
  if (!p) return { exists: false, ssid };
  return { exists: true, ssid, autoconnect: p.autoconnect };
}

async function mockSetAutoconnect(ssid, enabled) {
  await wait(200);
  if (!mockState.profiles[ssid]) return { ok: false, error: 'no profile' };
  mockState.profiles[ssid].autoconnect = !!enabled;
  return { ok: true, autoconnect: !!enabled };
}

// ── Public API ──
export const getWifiStatus = () => withFallback(realStatus, mockStatus);
export const scanWifi = () => withFallback(realScan, mockScan);
export const connectWifi = (ssid, password) =>
  withFallback(() => realConnect(ssid, password), () => mockConnect(ssid, password));
export const disconnectWifi = (ssid) =>
  withFallback(() => realDisconnect(ssid), () => mockDisconnect(ssid));
export const getWifiProfile = (ssid) =>
  withFallback(() => realProfile(ssid), () => mockProfile(ssid));
export const setWifiAutoconnect = (ssid, enabled) =>
  withFallback(() => realAutoconnect(ssid, enabled), () => mockSetAutoconnect(ssid, enabled));
