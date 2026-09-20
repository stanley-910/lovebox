// In-memory stand-in for firebase.js. Loaded when Vite runs with
// `--mode demo` (see .env.demo), so the UI can be explored without a
// Firebase project or credentials. Same export surface as firebase.js.

const IDENTITY = "her";

const now = Date.now();
const minutesAgo = (m) => new Date(now - m * 60 * 1000);

let messages = [
  { id: "m1", text: "landed safe. call you after dinner?", from: "him", timestamp: minutesAgo(4), read: false },
  { id: "m2", text: "look at the sky rn", from: "him", timestamp: minutesAgo(38), read: false },
  { id: "m3", text: "made the soup you like. it's in the fridge", from: "her", timestamp: minutesAgo(190), read: true },
  { id: "m4", text: "good morning ☕", from: "him", timestamp: minutesAgo(600), read: true },
  { id: "m5", text: "night night", from: "her", timestamp: minutesAgo(1500), read: true },
  { id: "m6", text: "did you see the drawing?", from: "him", timestamp: minutesAgo(2900), read: true },
];

let mood = { mood: "thinking", from: "him", timestamp: minutesAgo(12) };

let strokes = [
  { id: "s1", from: "him", color: "#a83a52", width: 3, points: heart(260, 150, 70) },
  { id: "s2", from: "her", color: "#5a78a8", width: 3, points: line(90, 290, 430, 290) },
];

let snapshots = [];

const playback = {
  isPlaying: true,
  progressMs: 74_000,
  device: "Leo's Laptop",
  nowPlaying: {
    name: "Pink + White",
    artist: "Frank Ocean",
    durationMs: 184_000,
    albumArt: "",
  },
  queue: [
    { name: "Nights", artist: "Frank Ocean" },
    { name: "Self Control", artist: "Frank Ocean" },
    { name: "Ivy", artist: "Frank Ocean" },
  ],
  recent: [
    { name: "Solo", artist: "Frank Ocean", playedAt: minutesAgo(8).toISOString() },
    { name: "White Ferrari", artist: "Frank Ocean", playedAt: minutesAgo(12).toISOString() },
    { name: "Godspeed", artist: "Frank Ocean", playedAt: minutesAgo(16).toISOString() },
  ],
};

const geo = { lat: 37.7749, lon: -122.4194, label: "san francisco" };

// ── Listener plumbing ──
const listeners = { messages: [], mood: [], canvas: [], snapshots: [] };
const emit = (k, v) => listeners[k].forEach((cb) => cb(v));
const subscribe = (k, cb, current) => {
  listeners[k].push(cb);
  setTimeout(() => cb(current()), 0);
  return () => {
    listeners[k] = listeners[k].filter((x) => x !== cb);
  };
};
let nextId = 100;
const id = () => `demo${nextId++}`;

// ── Auth ──
export function signIn() {
  return Promise.resolve();
}
export function onAuth(callback) {
  setTimeout(() => callback({ uid: "demo" }), 0);
}
export function getIdentity() {
  return IDENTITY;
}

// ── Messages ──
export function subscribeMessages(cb) {
  return subscribe("messages", cb, () => [...messages]);
}
export async function sendMessage(text, from) {
  messages = [{ id: id(), text, from, timestamp: new Date(), read: false, type: "text" }, ...messages];
  emit("messages", [...messages]);
}
export async function sendDrawing(dataUrl, from) {
  messages = [{ id: id(), text: "", imageUrl: dataUrl, from, timestamp: new Date(), read: false, type: "drawing" }, ...messages];
  emit("messages", [...messages]);
}
export async function markRead(messageId) {
  const m = messages.find((x) => x.id === messageId);
  if (m) m.read = true;
}

// ── Mood ──
export function subscribeMood(from, cb) {
  return subscribe("mood", cb, () => ({ id: "mood", ...mood }));
}
export async function setMood(m, from, custom = null) {
  mood = { mood: m, from, timestamp: new Date(), ...(custom ? { custom } : {}) };
}

// ── Canvas ──
export function subscribeCanvas(cb) {
  return subscribe("canvas", cb, () => [...strokes]);
}
export async function addStroke(s) {
  strokes = [...strokes, { id: id(), ...s, timestamp: new Date() }];
  emit("canvas", [...strokes]);
}
export async function deleteStroke(strokeId) {
  strokes = strokes.filter((s) => s.id !== strokeId);
  emit("canvas", [...strokes]);
}
export async function clearCanvas() {
  strokes = [];
  emit("canvas", []);
}

// ── Snapshots ──
export function subscribeSnapshots(cb) {
  return subscribe("snapshots", cb, () => [...snapshots]);
}
export async function saveSnapshot(imageUrl, from) {
  snapshots = [{ id: id(), imageUrl, from, timestamp: new Date() }, ...snapshots];
  emit("snapshots", [...snapshots]);
}
export async function deleteSnapshot(snapshotId) {
  snapshots = snapshots.filter((s) => s.id !== snapshotId);
  emit("snapshots", [...snapshots]);
}

// ── Playback / geo ──
export function subscribePlayback(identity, cb) {
  setTimeout(() => cb({ ...playback, updatedAt: new Date() }), 0);
  return () => {};
}
export async function sendSpotifyCommand() {}
export function subscribeGeo(identity, cb) {
  setTimeout(() => cb(geo), 0);
  return () => {};
}
export async function setGeo() {}

// ── Seed shapes ──
function heart(cx, cy, r) {
  const pts = [];
  for (let t = 0; t <= Math.PI * 2 + 0.05; t += 0.08) {
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push({ x: Math.round(cx + (x * r) / 16), y: Math.round(cy - (y * r) / 16) });
  }
  return pts;
}
function line(x1, y1, x2, y2) {
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push({ x: Math.round(x1 + (x2 - x1) * t), y: Math.round(y1 + (y2 - y1) * t + Math.sin(t * 6) * 6) });
  }
  return pts;
}
