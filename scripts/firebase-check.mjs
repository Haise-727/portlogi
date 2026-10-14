// Sets up and tests the Firebase side of the hardware feed, using a service-account key kept in
// .secrets/firebase-admin.json (git-ignored). It never prints a password or token.
//
//   node scripts/firebase-check.mjs            publish the rules, make the accounts, run every test
//   node scripts/firebase-check.mjs setup      only publish the rules and make the accounts
//   node scripts/firebase-check.mjs test       only run the tests (accounts must already exist)
//
// Writes reports/security/firebase-check.md. Exits non-zero if any test does not behave as expected.
// When you are done, delete the service-account key (Project settings > Service accounts, or Google Cloud IAM).
import { createSign, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const keyPath = new URL('.secrets/firebase-admin.json', root);
const accountsPath = new URL('.secrets/accounts.json', root);
const mode = process.argv[2] || 'all';

if (!existsSync(keyPath)) {
  console.error('No service-account key at .secrets/firebase-admin.json.\nFirebase console > Project settings > Service accounts > Generate new private key, then save it there.');
  process.exit(2);
}

const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
const cfgText = readFileSync(new URL('src/lib/firebaseConfig.ts', root), 'utf8');
const pick = (k) => new RegExp(`${k}:\\s*'([^']+)'`).exec(cfgText)?.[1];
const API_KEY = pick('apiKey');
const DB = pick('databaseURL');
const PROJECT = pick('projectId');
if (sa.project_id !== PROJECT) {
  console.error(`The key is for project "${sa.project_id}" but the app uses "${PROJECT}". Wrong key.`);
  process.exit(2);
}

/* ---------------------------------------------------------------- admin access */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function adminToken() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: [
      'https://www.googleapis.com/auth/firebase.database',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/identitytoolkit',
      'https://www.googleapis.com/auth/cloud-platform',
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3000,
  })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Could not get an admin token: ' + (j.error_description || j.error));
  return j.access_token;
}

const idp = (path, token, body, method = 'POST') =>
  fetch(`https://identitytoolkit.googleapis.com/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

/* ---------------------------------------------------------------- setup */
const accounts = existsSync(accountsPath) ? JSON.parse(readFileSync(accountsPath, 'utf8')) : {};
const wanted = { device: 'gate1@portlogi.example', viewer: 'viewer@portlogi.example' };

async function setup(token) {
  const log = [];

  // 1. rules (full-line // comments are for humans; strip them for the REST endpoint)
  const rulesText = readFileSync(new URL('firebase/database.rules.json', root), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  JSON.parse(rulesText); // refuse to publish something that is not valid JSON
  const put = await fetch(`${DB}/.settings/rules.json`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: rulesText });
  if (!put.ok) throw new Error(`Publishing rules failed: HTTP ${put.status} ${await put.text()}`);
  log.push('Rules published.');

  // 2. accounts. Passwords are random and live only in .secrets/accounts.json.
  for (const [role, email] of Object.entries(wanted)) {
    const password = accounts[role]?.password || randomBytes(18).toString('base64url');
    const made = await idp(`v1/projects/${PROJECT}/accounts`, token, { email, password, emailVerified: true });
    if (made.error?.message === 'EMAIL_EXISTS') {
      const found = await idp(`v1/projects/${PROJECT}/accounts:lookup`, token, { email: [email] });
      const localId = found.users?.[0]?.localId;
      if (!localId) throw new Error(`${email} exists but could not be looked up`);
      const upd = await idp(`v1/projects/${PROJECT}/accounts:update`, token, { localId, password });
      if (upd.error) throw new Error(`Could not set the password for ${email}: ${upd.error.message}`);
      log.push(`${role} account existed; password reset to the saved one.`);
    } else if (made.error) {
      throw new Error(`Could not create ${email}: ${made.error.message}`);
    } else {
      log.push(`${role} account created.`);
    }
    accounts[role] = { email, password };
  }
  mkdirSync(new URL('.secrets/', root), { recursive: true });
  writeFileSync(accountsPath, JSON.stringify(accounts, null, 2));

  // 3. open registration must be off, so only accounts added by hand can sign in
  const cfg = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
  const disabled = cfg.client?.permissions?.disabledUserSignup === true;
  if (!disabled) {
    const patch = await fetch(
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=client.permissions.disabledUserSignup`,
      { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ client: { permissions: { disabledUserSignup: true } } }) },
    ).then((r) => r.json());
    log.push(patch.error ? `Could not turn sign-up off automatically (${patch.error.message}); do it in the console.` : 'Open sign-up turned off.');
  } else {
    log.push('Open sign-up was already off.');
  }
  return log;
}

/* ---------------------------------------------------------------- tests */
async function signIn(role) {
  const a = accounts[role];
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: a.email, password: a.password, returnSecureToken: true }),
  }).then((x) => x.json());
  if (!r.idToken) throw new Error(`Could not sign in as the ${role}: ${r.error?.message}`);
  return r.idToken;
}

async function runTests(adminTok) {
  const rows = [];
  const device = await signIn('device');
  const viewer = await signIn('viewer');
  const call = async (method, path, { token, body } = {}) => {
    const r = await fetch(`${DB}/${path}.json${token ? `?auth=${token}` : ''}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  const expect = (name, got, want) => rows.push({ name, ok: want === 'allowed' ? got.status === 200 : got.status === 401 || got.status === 403, got: `HTTP ${got.status}`, want });
  const stamp = { '.sv': 'timestamp' };
  const good = () => ({ uid: 'FA11BACC', reader: 'check-1', at: stamp });

  expect('Anonymous cannot read the whole database', await call('GET', ''), 'refused');
  expect('Anonymous cannot read scans', await call('GET', 'scans'), 'refused');
  expect('Anonymous cannot write a scan', await call('POST', 'scans', { body: good() }), 'refused');
  expect('A forged token is not accepted', await call('GET', 'scans', { token: 'not-a-real-token' }), 'refused');
  expect('A signed-in viewer can read scans', await call('GET', 'scans', { token: viewer }), 'allowed');
  expect('A viewer cannot write a scan', await call('POST', 'scans', { token: viewer, body: good() }), 'refused');

  const ok = await call('POST', 'scans', { token: device, body: good() });
  expect('A device account can write a valid scan', ok, 'allowed');
  const id = ok.json?.name;
  expect('The scan can be read back with the server timestamp', await call('GET', `scans/${id}`, { token: viewer }), 'allowed');

  expect('Device: a lower-case or non-hex UID is refused', await call('POST', 'scans', { token: device, body: { ...good(), uid: 'zz11bbcc' } }), 'refused');
  expect('Device: a too-short UID is refused', await call('POST', 'scans', { token: device, body: { ...good(), uid: 'AB12' } }), 'refused');
  expect('Device: a 21-character UID is refused', await call('POST', 'scans', { token: device, body: { ...good(), uid: 'A'.repeat(21) } }), 'refused');
  expect('Device: a scan with no timestamp is refused', await call('POST', 'scans', { token: device, body: { uid: 'FA11BACC', reader: 'check-1' } }), 'refused');
  expect('Device: a back-dated (client-chosen) timestamp is refused', await call('POST', 'scans', { token: device, body: { ...good(), at: Date.now() - 3_600_000 } }), 'refused');
  expect('Device: an extra field is refused', await call('POST', 'scans', { token: device, body: { ...good(), admin: true } }), 'refused');
  expect('Device: a 25-character reader name is refused', await call('POST', 'scans', { token: device, body: { ...good(), reader: 'x'.repeat(25) } }), 'refused');
  expect('Device: an existing scan cannot be overwritten', await call('PUT', `scans/${id}`, { token: device, body: good() }), 'refused');
  expect('Device: an existing scan cannot be deleted', await call('DELETE', `scans/${id}`, { token: device }), 'refused');
  expect('Device: nothing outside /scans can be written', await call('PUT', 'other', { token: device, body: { x: 1 } }), 'refused');

  // clean up the test records with admin access (the rules, by design, would not let a device do it)
  await fetch(`${DB}/scans.json`, { method: 'DELETE', headers: { authorization: `Bearer ${adminTok}` } });
  return rows;
}

/* ---------------------------------------------------------------- run */
const tok = await adminToken();
const notes = [];
if (mode === 'all' || mode === 'setup') notes.push(...(await setup(tok)));
let rows = [];
if (mode === 'all' || mode === 'test') rows = await runTests(tok);

const failed = rows.filter((r) => !r.ok);
const md = [
  '# Firebase rules check',
  '',
  `Project: ${PROJECT} (Realtime Database, free Spark plan)`,
  `Run: ${new Date().toISOString()}`,
  rows.length ? `Result: **${rows.length - failed.length} of ${rows.length} tests behaved as expected**` : 'Setup only.',
  '',
  ...notes.map((n) => `- ${n}`),
  '',
  rows.length ? '| Test | Expected | Got | Result |\n|---|---|---|---|' : '',
  ...rows.map((r) => `| ${r.name} | ${r.want} | ${r.got} | ${r.ok ? 'pass' : '**FAIL**'} |`),
  '',
  'Test records are removed afterwards. Passwords are in .secrets/accounts.json and are never printed.',
].join('\n');
mkdirSync(new URL('reports/security/', root), { recursive: true });
writeFileSync(new URL('reports/security/firebase-check.md', root), md);
console.log(md.split('\n').filter((l) => !l.startsWith('|')).join('\n'));
if (failed.length) {
  console.error('\nUNEXPECTED:\n - ' + failed.map((r) => `${r.name} (got ${r.got}, wanted ${r.want})`).join('\n - '));
  process.exit(1);
}
