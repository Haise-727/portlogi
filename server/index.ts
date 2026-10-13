import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * The small backend. It has two jobs:
 *
 *   1. Hardware bridge. The ESP32 reads an RFID card and POSTs its UID to
 *      /api/scan; every open browser tab hears about it over Server-Sent
 *      Events (/api/events) and admits that card's container at the gate.
 *   2. Experiments. POST /api/experiments runs the real simulation headless,
 *      over many seeds, and returns the results (the numbers for the report).
 *
 * No framework, no database: node:http only, so there is nothing to install on
 * the machine that sits next to the rig.
 */
const PORT = Number(process.env.PORT ?? 8787)
/** Shared secret the ESP32 sends in x-device-key. Change it for anything but a demo. */
const DEVICE_KEY = process.env.DEVICE_KEY ?? 'portlogi-dev'

type Scan = { uid: string; at: string; reader: string }
const clients = new Set<ServerResponse>()
const recent: Scan[] = []
let lastDeviceSeen: string | null = null

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-device-key',
  })
  res.end(JSON.stringify(body))
}

function readJson(req: IncomingMessage, limit = 8192): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk
      if (raw.length > limit) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('invalid JSON'))
      }
    })
  })
}

function broadcast(event: string, data: unknown): void {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const c of clients) c.write(frame)
}

/** RFID UIDs are 4, 7 or 10 bytes: 8-20 hex characters. Anything else is noise. */
const UID = /^[0-9A-F]{8,20}$/

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (req.method === 'OPTIONS') return send(res, 204, {})

  if (url.pathname === '/api/health') {
    return send(res, 200, { ok: true, listeners: clients.size, lastDeviceSeen, scans: recent.length })
  }

  // Browsers subscribe here.
  if (url.pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
    })
    res.write(`event: hello\ndata: ${JSON.stringify({ lastDeviceSeen })}\n\n`)
    clients.add(res)
    const ping = setInterval(() => res.write(': ping\n\n'), 20000)
    req.on('close', () => {
      clearInterval(ping)
      clients.delete(res)
    })
    return
  }

  // The ESP32 posts here.
  if (url.pathname === '/api/scan' && req.method === 'POST') {
    if (req.headers['x-device-key'] !== DEVICE_KEY) return send(res, 401, { error: 'bad device key' })
    const body = (await readJson(req)) as { uid?: unknown; reader?: unknown }
    const uid = typeof body.uid === 'string' ? body.uid.replace(/[\s:-]/g, '').toUpperCase() : ''
    if (!UID.test(uid)) return send(res, 400, { error: 'uid must be 8-20 hex characters' })
    const scan: Scan = { uid, at: new Date().toISOString(), reader: typeof body.reader === 'string' ? body.reader.slice(0, 24) : 'gate' }
    recent.unshift(scan)
    recent.length = Math.min(recent.length, 50)
    lastDeviceSeen = scan.at
    broadcast('scan', scan)
    return send(res, 200, { ok: true, delivered: clients.size })
  }

  if (url.pathname === '/api/scans' && req.method === 'GET') return send(res, 200, recent)

  // Headless experiments, run off the request thread.
  if (url.pathname === '/api/experiments' && req.method === 'POST') {
    const body = (await readJson(req)) as { seeds?: number; arrivals?: number }
    const seeds = Math.max(1, Math.min(200, Math.round(body.seeds ?? 20)))
    const arrivals = Math.max(5, Math.min(120, Math.round(body.arrivals ?? 30)))
    // a child process, not a thread: it loads TypeScript through tsx and
    // cannot stall the event loop that is serving the scanner
    const result = await new Promise((resolve, reject) => {
      const child = fork(fileURLToPath(new URL('./experiment-worker.ts', import.meta.url)), [], {
        execArgv: ['--import', 'tsx'],
      })
      child.once('message', (m) => {
        resolve(m)
        child.kill()
      })
      child.once('error', reject)
      child.once('exit', (code) => code && reject(new Error(`experiment worker exited with ${code}`)))
      child.send({ seeds: Array.from({ length: seeds }, (_, i) => i + 1), arrivals })
    })
    return send(res, 200, result)
  }

  send(res, 404, { error: 'not found' })
}

createServer((req, res) => {
  handle(req, res).catch((e: Error) => send(res, 500, { error: e.message }))
}).listen(PORT, () => {
  console.log(`portlogi backend on http://localhost:${PORT}  (device key: ${DEVICE_KEY === 'portlogi-dev' ? 'default, change DEVICE_KEY' : 'set'})`)
})
