import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

// The handler reads SITE_ROOT once at import, so make the fake site first.
const root = mkdtempSync(join(tmpdir(), 'portlogi-site-'));
mkdirSync(join(root, 'assets'));
writeFileSync(join(root, 'index.html'), '<!doctype html><title>portlogi</title>'.repeat(40));
writeFileSync(join(root, 'theme-init.js'), 'document.documentElement.dataset.theme = "dark"');
writeFileSync(join(root, 'assets', 'app-abc123.js'), 'console.log("hello");'.repeat(200));
writeFileSync(join(root, 'assets', 'font-xyz.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4]));
writeFileSync(join(root, '..', 'secret.txt'), 'must never be served');
process.env.SITE_ROOT = root;
const { handler, CSP } = await import('./handler.mjs');

const get = (rawPath, opts = {}) =>
  handler({ rawPath, headers: opts.headers || {}, requestContext: { http: { method: opts.method || 'GET' } } });
const decode = (res) => Buffer.from(res.body, res.isBase64Encoded ? 'base64' : 'utf8');

before(() => {});
after(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(join(root, '..', 'secret.txt'), { force: true });
});

describe('serving files', () => {
  it('serves the app at /', async () => {
    const r = await get('/');
    assert.equal(r.statusCode, 200);
    assert.match(r.headers['Content-Type'], /text\/html/);
    assert.match(decode(r).toString(), /portlogi/);
  });

  it('answers deep links with index.html so a refresh does not 404', async () => {
    const r = await get('/some/deep/link');
    assert.equal(r.statusCode, 200);
    assert.match(r.headers['Content-Type'], /text\/html/);
  });

  it('returns a real 404 for a missing file with an extension, never HTML', async () => {
    const r = await get('/assets/gone-123.js');
    assert.equal(r.statusCode, 404);
    assert.doesNotMatch(r.body, /<title>/);
  });

  it('gives hashed assets a year-long immutable cache and everything else none', async () => {
    assert.equal((await get('/assets/app-abc123.js')).headers['Cache-Control'], 'public, max-age=31536000, immutable');
    assert.equal((await get('/')).headers['Cache-Control'], 'no-cache');
    assert.equal((await get('/theme-init.js')).headers['Cache-Control'], 'no-cache');
  });

  it('serves a binary font untouched, with the right type', async () => {
    const r = await get('/assets/font-xyz.woff2', { headers: { 'accept-encoding': 'br, gzip' } });
    assert.equal(r.headers['Content-Type'], 'font/woff2');
    assert.equal(r.headers['Content-Encoding'], undefined);
    assert.deepEqual([...decode(r)], [0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4]);
  });
});

describe('compression', () => {
  it('prefers brotli, then gzip, then plain, and each round-trips', async () => {
    const original = 'console.log("hello");'.repeat(200);
    const br = await get('/assets/app-abc123.js', { headers: { 'accept-encoding': 'gzip, br' } });
    assert.equal(br.headers['Content-Encoding'], 'br');
    assert.equal(brotliDecompressSync(decode(br)).toString(), original);
    const gz = await get('/assets/app-abc123.js', { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(gz.headers['Content-Encoding'], 'gzip');
    assert.equal(gunzipSync(decode(gz)).toString(), original);
    const none = await get('/assets/app-abc123.js');
    assert.equal(none.headers['Content-Encoding'], undefined);
    assert.equal(decode(none).toString(), original);
  });
});

describe('security', () => {
  it('cannot be used to read files outside the site folder', async () => {
    for (const p of ['/../secret.txt', '/..%2fsecret.txt', '/%2e%2e/secret.txt', '/assets/../../secret.txt', '/%2e%2e%2f%2e%2e%2fetc/passwd', '/..\\secret.txt']) {
      const r = await get(p);
      assert.ok(!decode(r).toString().includes('must never be served'), `leaked via ${p}`);
      assert.ok([200, 400, 404].includes(r.statusCode), `${p} -> ${r.statusCode}`);
      if (r.statusCode === 200) assert.match(r.headers['Content-Type'], /text\/html/, `${p} should only ever fall back to index.html`);
    }
  });

  it('rejects malformed and null-byte paths', async () => {
    assert.equal((await get('/%E0%A4%A')).statusCode, 400);
    assert.equal((await get('/index.html%00.png')).statusCode, 400);
  });

  it('refuses every method except GET and HEAD', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const r = await get('/', { method });
      assert.equal(r.statusCode, 405, method);
      assert.equal(r.headers.Allow, 'GET, HEAD');
    }
  });

  it('puts the security headers on every kind of response', async () => {
    for (const r of [await get('/'), await get('/assets/app-abc123.js'), await get('/assets/missing.js'), await get('/', { method: 'POST' }), await get('/%E0%A4%A')]) {
      assert.equal(r.headers['Content-Security-Policy'], CSP);
      assert.match(r.headers['Strict-Transport-Security'], /max-age=31536000/);
      assert.equal(r.headers['X-Content-Type-Options'], 'nosniff');
      assert.equal(r.headers['X-Frame-Options'], 'DENY');
      assert.equal(r.headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
      assert.equal(r.headers['Cross-Origin-Resource-Policy'], 'same-origin');
    }
  });

  it('has a CSP that blocks inline script, eval, plugins, framing and base-tag tricks', () => {
    // scripts: this site, plus the Firebase region's database hosts (the SDK's long-polling fallback). Nothing else.
    const scriptSrc = CSP.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src '));
    assert.equal(scriptSrc, "script-src 'self' https://*.asia-southeast1.firebasedatabase.app");
    assert.doesNotMatch(CSP, /script-src[^;]*unsafe-(inline|eval)/);
    assert.match(CSP, /object-src 'none'/);
    assert.match(CSP, /frame-ancestors 'none'/);
    assert.match(CSP, /base-uri 'self'/);
    assert.doesNotMatch(CSP, /\*(;|$)|default-src \*/);
  });

  it('answers HEAD with headers and no body', async () => {
    const r = await get('/', { method: 'HEAD' });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body, '');
  });
});
