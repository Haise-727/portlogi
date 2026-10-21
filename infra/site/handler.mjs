/**
 * Serves the built portlogi app from a Lambda Function URL.
 *
 * Everything it can serve is a file baked into the function package (./dist), and it answers only
 * GET and HEAD, so there is nothing to write to and no user input reaches a database or a shell.
 * The one thing that touches user input is the request path, which is checked so it can never
 * leave the dist folder.
 *
 * Like a static host it returns index.html for any path that is not a file (the app has its own
 * view state, and deep links must not 404), but a missing file with an extension is a real 404, so a
 * stale script is never answered with HTML.
 *
 * Limits to know: a buffered Lambda response is at most 6 MB. The biggest file in the build is a few
 * hundred KB and text is compressed, so there is plenty of room.
 */
import { readFile, stat } from 'node:fs/promises';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.SITE_ROOT || join(fileURLToPath(new URL('.', import.meta.url)), 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};
const TEXTY = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);

/**
 * Content-Security-Policy: scripts only from this origin (no inline script, no eval). Styles allow
 * 'unsafe-inline' because React and the animation library set inline styles; that is a smaller
 * risk than scripts and is the one place the policy is looser than it could be. The connect list
 * names the Firebase database (its project host plus that region's shard hosts) and sign-in services the hardware feed talks to.
 */
const DB_HOST = 'portlogi-2d2e7-default-rtdb.asia-southeast1.firebasedatabase.app';
// Firebase's realtime server answers the first connection with a redirect to a shard host in the same region
// (for example s-gke-apse1-nssi4-11.asia-southeast1.firebasedatabase.app), so allow that region's database
// hosts. Other regions and other projects' hosts stay blocked.
const DB_REGION_HOSTS = '*.asia-southeast1.firebasedatabase.app';

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self' data:",
  `connect-src 'self' https://${DB_HOST} wss://${DB_HOST} https://${DB_REGION_HOSTS} wss://${DB_REGION_HOSTS} https://identitytoolkit.googleapis.com https://securetoken.googleapis.com`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

export const SECURITY = {
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  // allow-popups so a Firebase sign-in popup keeps working; everything else is isolated
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const memory = new Map();   // path -> { body, br, gz } so a warm function does not read or compress twice

/** The file for a request path, or null. Refuses anything that would leave the dist folder. */
export function resolvePath(rawPath) {
  let path;
  try { path = decodeURIComponent(rawPath || '/'); } catch { return null; }
  if (path.includes('\0')) return null;
  const full = normalize(join(ROOT, path));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  return full;
}

async function load(full) {
  if (memory.has(full)) return memory.get(full);
  const body = await readFile(full);
  const text = TEXTY.has(extname(full));
  const entry = {
    body,
    br: text ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }) : null,
    gz: text ? gzipSync(body) : null,
  };
  memory.set(full, entry);
  return entry;
}

async function fileOrNull(full) {
  try { return (await stat(full)).isFile() ? full : null; } catch { return null; }
}

const plain = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY, ...extra },
  body,
});

export async function handler(event) {
  const method = event?.requestContext?.http?.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') return plain(405, 'Method not allowed', { Allow: 'GET, HEAD' });

  const requested = resolvePath(event?.rawPath);
  if (!requested) return plain(400, 'Bad request');

  let file = await fileOrNull(requested);
  if (!file) {
    if (extname(requested)) return plain(404, 'Not found');
    file = await fileOrNull(join(ROOT, 'index.html'));
    if (!file) return plain(404, 'Not found');
  }

  const ext = extname(file);
  const { body, br, gz } = await load(file);
  const accept = event?.headers?.['accept-encoding'] || '';
  const encoding = br && /\bbr\b/.test(accept) ? 'br' : gz && /\bgzip\b/.test(accept) ? 'gzip' : null;
  const payload = encoding === 'br' ? br : encoding === 'gzip' ? gz : body;

  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    // Built files have a hash in their name, so they never change. Everything else must be fresh.
    'Cache-Control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding',
    ...SECURITY,
  };
  if (encoding) headers['Content-Encoding'] = encoding;

  return {
    statusCode: 200,
    headers,
    isBase64Encoded: true,
    body: method === 'HEAD' ? '' : payload.toString('base64'),
  };
}
