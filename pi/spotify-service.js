#!/usr/bin/env node
//
// Spotify polling service for Lovebox.
//
// Polls both users' Spotify accounts every 10 seconds, writes playback state
// to Firestore. Listens to a "spotify-commands" collection for queue hijack
// requests and executes them.
//
// Required env vars:
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
//   GOOGLE_APPLICATION_CREDENTIALS — path to Firebase service account key
//
// Required files (created by spotify-auth.js):
//   ~/.lovebox-spotify-him.json
//   ~/.lovebox-spotify-her.json

const https = require('https');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});
const db = admin.firestore();

// ── Token management ──

function loadTokenFile(identity) {
  const p = path.join(require('os').homedir(), `.lovebox-spotify-${identity}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveTokenFile(identity, data) {
  const p = path.join(require('os').homedir(), `.lovebox-spotify-${identity}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

const tokens = {
  him: loadTokenFile('him'),
  her: loadTokenFile('her'),
};

if (!tokens.him && !tokens.her) {
  console.error('No token files found. Run spotify-auth.js first.');
  process.exit(1);
}
for (const id of ['him', 'her']) {
  if (!tokens[id]) console.log(`[${id}] no token file — skipping`);
}

function httpsRequest(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: headers || {},
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function refreshToken(identity) {
  const t = tokens[identity];
  if (!t) return null;
  if (Date.now() < t.expires_at - 60_000) return t.access_token;

  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await httpsRequest('POST', 'https://accounts.spotify.com/api/token', {
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: `Basic ${auth}`,
  }, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: t.refresh_token,
  }).toString());

  if (res.body?.access_token) {
    t.access_token = res.body.access_token;
    t.expires_at = Date.now() + (res.body.expires_in || 3600) * 1000;
    if (res.body.refresh_token) t.refresh_token = res.body.refresh_token;
    saveTokenFile(identity, t);
    console.log(`[${identity}] token refreshed`);
  } else {
    console.error(`[${identity}] token refresh failed:`, res.body);
  }
  return t.access_token;
}

async function spotifyGet(identity, endpoint) {
  const token = await refreshToken(identity);
  return httpsRequest('GET', `https://api.spotify.com/v1${endpoint}`, {
    Authorization: `Bearer ${token}`,
  });
}

async function spotifyPost(identity, endpoint, body) {
  const token = await refreshToken(identity);
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';
  return httpsRequest('POST', `https://api.spotify.com/v1${endpoint}`, headers,
    body ? JSON.stringify(body) : undefined);
}

async function spotifyPut(identity, endpoint, body) {
  const token = await refreshToken(identity);
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';
  return httpsRequest('PUT', `https://api.spotify.com/v1${endpoint}`, headers,
    body ? JSON.stringify(body) : undefined);
}

// ── Polling ──

function extractTrack(item) {
  if (!item) return null;
  return {
    name: item.name,
    artist: (item.artists || []).map(a => a.name).join(', '),
    album: item.album?.name || '',
    albumArt: item.album?.images?.[0]?.url || '',
    uri: item.uri,
    durationMs: item.duration_ms,
  };
}

async function pollPlayback(identity) {
  if (!tokens[identity]) return;
  try {
    const [playing, queue, recent] = await Promise.all([
      spotifyGet(identity, '/me/player/currently-playing'),
      spotifyGet(identity, '/me/player/queue'),
      spotifyGet(identity, '/me/player/recently-played?limit=5'),
    ]);

    const data = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (playing.status === 200 && playing.body) {
      data.isPlaying = playing.body.is_playing || false;
      data.progressMs = playing.body.progress_ms || 0;
      data.nowPlaying = extractTrack(playing.body.item);
      data.device = playing.body.device ? {
        name: playing.body.device.name,
        type: playing.body.device.type,
      } : null;
    } else {
      data.isPlaying = false;
      data.nowPlaying = null;
      data.progressMs = 0;
      data.device = null;
    }

    if (queue.status === 200 && queue.body) {
      data.queue = (queue.body.queue || []).slice(0, 5).map(extractTrack);
    } else {
      data.queue = [];
    }

    if (recent.status === 200 && recent.body) {
      data.recent = (recent.body.items || []).map(i => ({
        ...extractTrack(i.track),
        playedAt: i.played_at,
      }));
    } else {
      data.recent = [];
    }

    await db.doc(`playback/${identity}`).set(data);
  } catch (err) {
    console.error(`[${identity}] poll error:`, err.message);
  }
}

let pollCount = 0;

async function pollBoth() {
  await Promise.all([pollPlayback('him'), pollPlayback('her')]);
  pollCount++;
  if (pollCount % 30 === 0) {
    console.log(`[poll] ${pollCount} cycles completed`);
  }
}

// ── Command listener ──

function listenForCommands() {
  db.collection('spotify-commands')
    .where('executed', '==', false)
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type !== 'added') return;
        const cmd = change.doc.data();
        const id = change.doc.id;
        console.log(`[cmd] ${cmd.action} → ${cmd.target}: ${cmd.uri}`);

        try {
          if (cmd.action === 'queue') {
            await spotifyPost(cmd.target, `/me/player/queue?uri=${encodeURIComponent(cmd.uri)}`);
          } else if (cmd.action === 'play') {
            await spotifyPut(cmd.target, '/me/player/play', { uris: [cmd.uri] });
          }
          await db.doc(`spotify-commands/${id}`).update({ executed: true });
          console.log(`[cmd] ${id} executed`);
        } catch (err) {
          console.error(`[cmd] ${id} failed:`, err.message);
          await db.doc(`spotify-commands/${id}`).update({ executed: true, error: err.message });
        }
      });
    });
}

// ── Main ──

console.log('Lovebox Spotify service starting...');
listenForCommands();
pollBoth();
setInterval(pollBoth, 10_000);
console.log('Polling every 10s. Listening for commands.');
