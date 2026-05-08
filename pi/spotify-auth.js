#!/usr/bin/env node
//
// One-time OAuth flow for Spotify. Run once per user to get a refresh token.
//
//   node pi/spotify-auth.js
//
// Then open http://localhost:8888/login in a browser, sign in with the
// Spotify account you want to authorize. The refresh token is saved to
// ~/.lovebox-spotify-<identity>.json
//
// Requires: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET env vars (or .env).

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-read-recently-played',
  'user-modify-playback-state',
].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET env vars.');
  process.exit(1);
}

function post(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/login') {
    const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
    });
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error || !code) {
      res.writeHead(400);
      res.end(`Auth failed: ${error || 'no code'}`);
      return;
    }

    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const tokens = await post('https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }).toString(),
      { Authorization: `Basic ${auth}` },
    );

    if (!tokens.refresh_token) {
      res.writeHead(500);
      res.end(`Token exchange failed: ${JSON.stringify(tokens)}`);
      return;
    }

    const identity = process.argv[2] || 'unknown';
    const outPath = path.join(require('os').homedir(), `.lovebox-spotify-${identity}.json`);
    fs.writeFileSync(outPath, JSON.stringify({
      identity,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
    }, null, 2));

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h2>Done!</h2><p>Saved to <code>${outPath}</code></p><p>You can close this tab.</p>`);
    setTimeout(() => { server.close(); process.exit(0); }, 1000);
    return;
  }

  res.writeHead(404);
  res.end('Not found. Go to /login');
});

server.listen(PORT, () => {
  console.log(`Open http://127.0.0.1:${PORT}/login in your browser.`);
  console.log(`Authorizing as: ${process.argv[2] || 'unknown'} (pass "him" or "her" as argument)`);
});
