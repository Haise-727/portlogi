// Checks a deployed portlogi URL from the outside and writes reports/security/live-check.md.
//   node infra/scripts/check-live.mjs https://xxxx.lambda-url.ap-south-1.on.aws
// Exits non-zero if any check fails, so it can also run in CI after a deploy.
import { mkdirSync, writeFileSync } from 'node:fs';
import { connect } from 'node:tls';
import { fileURLToPath } from 'node:url';

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https:\/\//.test(base)) {
  console.error('usage: node infra/scripts/check-live.mjs https://your-site');
  process.exit(2);
}
const host = new URL(base).hostname;
const rows = [];
const check = (area, name, ok, detail = '') => rows.push({ area, name, ok, detail });

const res = await fetch(base + '/', { headers: { 'accept-encoding': 'br' } });
const h = (n) => res.headers.get(n) || '';

/* ---- response headers ---- */
check('Headers', 'HTTP 200 for the app', res.status === 200, String(res.status));
check('Headers', 'Content-Security-Policy present', !!h('content-security-policy'));
const csp = h('content-security-policy');
check('Headers', "CSP: scripts only from 'self', no unsafe-inline or eval", /script-src 'self'(;|$)/.test(csp) && !/script-src[^;]*unsafe-/.test(csp), (csp.match(/script-src[^;]*/) || [''])[0]);
check('Headers', 'CSP: no plugins (object-src none)', /object-src 'none'/.test(csp));
check('Headers', 'CSP: cannot be framed (frame-ancestors none)', /frame-ancestors 'none'/.test(csp));
check('Headers', 'CSP: no wildcard default-src', !/default-src[^;]*\*/.test(csp));
check('Headers', 'Strict-Transport-Security, at least 1 year', /max-age=(\d+)/.test(h('strict-transport-security')) && Number(RegExp.$1) >= 31536000, h('strict-transport-security'));
check('Headers', 'X-Content-Type-Options: nosniff', h('x-content-type-options') === 'nosniff');
check('Headers', 'X-Frame-Options: DENY', h('x-frame-options') === 'DENY');
check('Headers', 'Referrer-Policy set', !!h('referrer-policy'), h('referrer-policy'));
check('Headers', 'Permissions-Policy disables camera, microphone, location', /camera=\(\)/.test(h('permissions-policy')) && /microphone=\(\)/.test(h('permissions-policy')) && /geolocation=\(\)/.test(h('permissions-policy')));
check('Headers', 'Cross-Origin-Opener-Policy set', !!h('cross-origin-opener-policy'), h('cross-origin-opener-policy'));
check('Headers', 'Cross-Origin-Resource-Policy: same-origin', h('cross-origin-resource-policy') === 'same-origin');
check('Headers', 'No server or framework version leaked', !h('server') && !h('x-powered-by'), h('server') || h('x-powered-by') || 'none');
check('Headers', 'Pages are not cached stale (no-cache)', /no-cache/.test(h('cache-control')), h('cache-control'));
check('Headers', 'Compressed (brotli)', h('content-encoding') === 'br', h('content-encoding'));

/* ---- transport ---- */
const tls = await new Promise((resolve, reject) => {
  const s = connect({ host, port: 443, servername: host }, () => {
    const info = { protocol: s.getProtocol(), cipher: s.getCipher()?.name, cert: s.getPeerCertificate(), authorized: s.authorized };
    s.end();
    resolve(info);
  });
  s.on('error', reject);
});
const days = Math.round((new Date(tls.cert.valid_to) - Date.now()) / 86400000);
check('Transport', 'TLS 1.2 or newer', ['TLSv1.2', 'TLSv1.3'].includes(tls.protocol), `${tls.protocol}, ${tls.cipher}`);
check('Transport', 'Certificate chain trusted', tls.authorized === true, `issuer: ${tls.cert.issuer?.O || tls.cert.issuer?.CN}`);
check('Transport', 'Certificate is not about to expire', days > 14, `${days} days left`);
const http80 = await fetch(`http://${host}/`, { signal: AbortSignal.timeout(6000), redirect: 'manual' }).then((r) => r.status, () => 'no answer');
check('Transport', 'Plain HTTP (port 80) is not served', http80 === 'no answer' || (http80 >= 300 && http80 < 400), `port 80: ${http80}`);

/* ---- behaviour under hostile requests ---- */
const code = (path, opts) => fetch(base + path, { redirect: 'manual', ...opts }).then((r) => r.status);
for (const method of ['POST', 'PUT', 'DELETE']) check('Hostile requests', `${method} is refused`, (await code('/', { method })) === 405);
// fetch() tidies '..' out of a URL before sending it, so send the raw, un-normalised request over TLS.
const raw = (path) =>
  new Promise((resolve, reject) => {
    const s = connect({ host, port: 443, servername: host }, () => s.write(`GET ${path} HTTP/1.1
Host: ${host}
Connection: close

`));
    let data = '';
    s.on('data', (d) => (data += d));
    s.on('end', () => resolve({ status: Number(/^HTTP\/1\.1 (\d+)/.exec(data)?.[1]), body: data }));
    s.on('error', reject);
  });
for (const path of ['/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2fetc%2fpasswd']) {
  const r = await raw(path);
  check('Hostile requests', `Raw traversal ${path} is refused and leaks nothing`, [400, 404].includes(r.status) && !/root:.*:0:0/.test(r.body), `HTTP ${r.status}`);
}
const normalised = await fetch(base + '/%2e%2e/%2e%2e/etc/passwd');
check('Hostile requests', 'A tidied-up traversal just gets the app page, never a file', normalised.status === 200 && /text\/html/.test(normalised.headers.get('content-type')) && !/root:.*:0:0/.test(await normalised.text()));
check('Hostile requests', 'Null byte in path is refused', (await code('/index.html%00.png')) === 400);
check('Hostile requests', 'Missing script is a 404, not HTML', (await code('/assets/does-not-exist-123.js')) === 404);
check('Hostile requests', 'Oversized path does not crash it', [200, 400, 404, 414].includes(await code('/' + 'a'.repeat(6000))));
const bad = await fetch(base + '/<script>alert(1)</script>');
const body = await bad.text();
check('Hostile requests', 'Script in the URL is not reflected back', !body.includes('alert(1)'));

/* ---- report ---- */
const failed = rows.filter((r) => !r.ok);
const md = [
  '# Live security check',
  '',
  `Target: ${base}`,
  `Run: ${new Date().toISOString()}`,
  `Result: **${rows.length - failed.length} of ${rows.length} checks passed**`,
  '',
  'This checks what an outside visitor can observe. It is not a penetration test and it does not cover the AWS account itself (IAM, billing) or Firebase rules.',
  '',
  ...['Headers', 'Transport', 'Hostile requests'].flatMap((area) => [
    `## ${area}`,
    '',
    '| Check | Result | Detail |',
    '|---|---|---|',
    ...rows.filter((r) => r.area === area).map((r) => `| ${r.name} | ${r.ok ? 'pass' : '**FAIL**'} | ${String(r.detail).replace(/\|/g, '/')} |`),
    '',
  ]),
].join('\n');

const out = new URL('../../reports/security/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('live-check.md', out), md);
console.log(md.split('\n').slice(0, 5).join('\n'));
if (failed.length) {
  console.error('\nFAILED:\n - ' + failed.map((r) => r.name).join('\n - '));
  process.exit(1);
}
console.log('\nwrote ' + fileURLToPath(new URL('live-check.md', out)));
