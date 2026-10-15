import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { GRADE_LABEL, PORTS, type PortFact } from '../../data/ports'
import { formatInt } from '../../lib/impact'
import { useYard } from '../../store/app'
import { Button } from '../ui/button'
import { Dialog } from '../ui/overlay'
import { PRESETS } from '../../data/presets'

/**
 * Bird's-eye view of the ports in the dataset. Drawn as plain SVG so it works with no network at all (venue wifi).
 * The coastline is a schematic outline of about 40 points, not survey data, and is labelled as such. Marker size follows
 * reported throughput where a source exists. Opening a port loads an *illustrative* yard seeded for that port: the real
 * layouts of these yards were not found in a source.
 */
const OUTLINE: [number, number][] = [
  [68.2, 23.7], [69.7, 22.4], [70.5, 20.9], [72.1, 21.1], [72.6, 20.4], [72.8, 19.2], [73.0, 17.3], [73.8, 15.6], [74.6, 13.0],
  [75.4, 11.9], [76.2, 9.9], [77.1, 8.4], [78.1, 8.8], [79.3, 10.3], [79.9, 11.8], [80.3, 13.1], [80.2, 15.2], [82.2, 16.8],
  [84.8, 19.2], [86.8, 20.7], [88.0, 21.6], [89.0, 22.0], [90.6, 22.5], [92.0, 21.6], [92.6, 24.2], [94.2, 26.3], [96.2, 28.2],
  [95.0, 29.2], [92.6, 27.8], [90.0, 28.0], [88.4, 27.2], [88.0, 26.5], [84.0, 27.4], [81.0, 30.2], [79.0, 31.0], [78.8, 34.0],
  [77.0, 35.5], [75.0, 35.0], [74.5, 33.0], [75.2, 31.4], [74.4, 30.0], [71.0, 27.6], [70.0, 25.2], [68.2, 23.7],
]
const LON = [67, 98]
const LAT = [6, 37]
const W = 420
const H = 460
const px = (lon: number) => ((lon - LON[0]) / (LON[1] - LON[0])) * W
const py = (lat: number) => ((LAT[1] - lat) / (LAT[1] - LAT[0])) * H
const radius = (p: PortFact) => 6 + Math.sqrt((p.throughput?.teu ?? 300_000) / 1e6) * 9

export default function PortMap() {
  const open = useYard((s) => s.mapOpen)
  const setOpen = useYard((s) => s.setMapOpen)
  const current = useYard((s) => s.portId)
  const openPort = useYard((s) => s.openPort)
  const [sel, setSel] = useState(current)
  const [mode, setMode] = useState<'live' | 'schematic'>(typeof navigator !== 'undefined' && navigator.onLine ? 'live' : 'schematic')
  const p = PORTS.find((x) => x.id === sel) ?? PORTS[0]
  const d = OUTLINE.map(([lo, la], i) => `${i ? 'L' : 'M'}${px(lo).toFixed(1)} ${py(la).toFixed(1)}`).join(' ') + 'Z'

  return (
    <Dialog open={open} onOpenChange={setOpen} className="h-[min(720px,88vh)]" title="Ports of India" description="drag and zoom; each port opens its own illustrative yard">
      <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="flex min-h-[320px] min-w-0 flex-col gap-2">
          <div className="flex gap-1 text-t10">
            {(['live', 'schematic'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={'border px-2 py-1 ' + (mode === m ? 'border-signal text-ink' : 'border-line text-ink-3')} style={{ borderRadius: 2 }}>
                {m === 'live' ? 'Street map (online)' : 'Schematic (offline)'}
              </button>
            ))}
          </div>
          {mode === 'live' ? <LiveMap sel={sel} setSel={setSel} current={current} onFail={() => setMode('schematic')} /> : (
        <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto max-h-full w-full max-w-[460px]" role="img" aria-label="Schematic map of India with port markers">
            <path d={d} fill="var(--color-raise)" stroke="var(--color-line)" strokeWidth={1.5} strokeLinejoin="round" />
            {PORTS.map((x) => (
              <g key={x.id} onClick={() => setSel(x.id)} className="cursor-pointer" role="button" tabIndex={0} aria-label={x.short}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSel(x.id)}>
                <circle cx={px(x.lon)} cy={py(x.lat)} r={radius(x)} fill="var(--color-signal)" fillOpacity={x.id === sel ? 0.55 : 0.28}
                  stroke="var(--color-signal)" strokeWidth={x.id === sel ? 2.5 : 1} />
                {x.id === current && <circle cx={px(x.lon)} cy={py(x.lat)} r={3} fill="var(--color-ink)" />}
                <text x={px(x.lon) + (x.lon > 80 ? -radius(x) - 4 : radius(x) + 4)} y={py(x.lat) + (x.id === 'kamarajar' ? -8 : 4)} textAnchor={x.lon > 80 ? 'end' : 'start'}
                  style={{ fontSize: 11, fill: 'var(--color-ink)' }}>{x.short.split(' ')[0]}</text>
              </g>
            ))}
          </svg>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2 text-t11 text-ink-2">
          <div className="text-t13 font-medium text-ink">{p.name}</div>
          <div>{p.state}</div>
          {p.throughput ? (
            <div>
              <span className="tnum text-ink">{formatInt(p.throughput.teu)} TEU</span>, {p.throughput.period} ({GRADE_LABEL[p.throughput.grade]})
              {' '}<a className="text-signal underline" href={p.throughput.source.url} target="_blank" rel="noreferrer noopener">source</a>
            </div>
          ) : (
            <div>No throughput figure found in a source.</div>
          )}
          {p.terminals && <div>{p.terminals}</div>}
          <div className="text-ink-3">Illustrative yard: {PRESETS[p.id]?.blurb}</div>
          <Button className="mt-1" onClick={() => openPort(p.id)}>
            {p.id === current ? 'Restart this port’s illustrative yard' : 'Open illustrative yard'}
          </Button>
          <p className="mt-auto text-t10 text-ink-3">
            Circle size follows reported throughput (a default size where none was found). The outline is schematic, not survey data. Yards are
            illustrative; real layouts were not found in a source.
          </p>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * Pannable street map from OpenStreetMap's standard tile server, which is fine for a small demo under its tile usage policy
 * (attribution shown, no bulk use). It needs the network; if tiles fail to load the dialog falls back to the schematic.
 */
function LiveMap({ sel, setSel, current, onFail }: { sel: string; setSel: (id: string) => void; current: string; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const markers = useRef(new Map<string, L.CircleMarker>())
  const map = useRef<L.Map | null>(null)
  const first = useRef(true)

  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { center: [16, 80], zoom: 5, minZoom: 4, maxZoom: 14, zoomControl: true })
    map.current = m
    let errors = 0
    let loaded = 0
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    })
    tiles.on('tileload', () => loaded++)
    tiles.on('tileerror', () => {
      if (++errors >= 6 && loaded === 0) onFail()
    })
    tiles.addTo(m)
    for (const x of PORTS) {
      const mk = L.circleMarker([x.lat, x.lon], { radius: radius(x), color: '#0b8aa6', weight: 2, fillColor: '#0b8aa6', fillOpacity: 0.35 })
      mk.bindTooltip(x.short, { permanent: true, direction: 'right', offset: [radius(x) - 4, 0] })
      mk.on('click', () => setSel(x.id))
      mk.addTo(m)
      markers.current.set(x.id, mk)
    }
    const group = markers.current
    return () => {
      m.remove()
      group.clear()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    for (const [id, mk] of markers.current) mk.setStyle({ weight: id === sel ? 4 : id === current ? 3 : 2, fillOpacity: id === sel ? 0.65 : 0.35 })
    if (first.current) {
      first.current = false
      return
    }
    const x = PORTS.find((q) => q.id === sel)
    if (x && map.current) map.current.flyTo([x.lat, x.lon], Math.max(map.current.getZoom(), 7), { duration: 0.6 })
  }, [sel, current])

  return <div ref={box} className="min-h-[320px] flex-1 border border-line" style={{ borderRadius: 2 }} role="application" aria-label="Street map of Indian ports" />
}
