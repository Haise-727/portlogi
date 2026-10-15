import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ArrowRight, Info } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { GRADE_LABEL, PORTS, type PortFact } from '../data/ports'
import { PRESETS } from '../data/presets'
import { formatInt } from '../lib/impact'
import { useYard } from '../store/app'
import { Button } from './ui/button'

/**
 * The front door: a large street map of Indian ports with a short description. Pick a port, then enter its yard.
 * Tiles come from OpenStreetMap's standard server (fine for a small demo, attribution shown). If the tiles cannot
 * load, a plain panel lists the ports so the page still works offline.
 */
const radius = (p: PortFact) => 7 + Math.sqrt((p.throughput?.teu ?? 250_000) / 1e6) * 9

export default function Landing() {
  const portId = useYard((s) => s.portId)
  const openPort = useYard((s) => s.openPort)
  const enterYard = useYard((s) => s.enterYard)
  const [sel, setSel] = useState(portId)
  const [offline, setOffline] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef(new Map<string, L.CircleMarker>())
  const last = useRef(sel)
  const p = PORTS.find((x) => x.id === sel) ?? PORTS[0]

  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, {
      center: [18.5, 80],
      zoom: 5,
      minZoom: 4,
      maxZoom: 13,
      zoomControl: false,
      zoomSnap: 0.25,
    })
    map.current = m
    L.control.zoom({ position: 'bottomleft' }).addTo(m)
    let errors = 0
    let loaded = 0
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    })
    tiles.on('tileload', () => loaded++)
    tiles.on('tileerror', () => {
      if (++errors >= 6 && loaded === 0) setOffline(true)
    })
    tiles.addTo(m)
    for (const x of PORTS) {
      const mk = L.circleMarker([x.lat, x.lon], {
        radius: radius(x),
        color: '#0b6f87',
        weight: 2,
        fillColor: '#0b8aa6',
        fillOpacity: 0.4,
      })
      mk.bindTooltip(x.short, {
        permanent: true,
        direction: 'right',
        offset: [radius(x) - 3, 0],
        className: 'port-label',
      })
      mk.on('click', () => setSel(x.id))
      mk.on('dblclick', () => openPort(x.id))
      mk.addTo(m)
      markers.current.set(x.id, mk)
    }
    const wide = box.current.clientWidth > 800
    m.fitBounds(L.latLngBounds(PORTS.map((x) => [x.lat, x.lon] as [number, number])), {
      paddingTopLeft: [wide ? 440 : 30, 40],
      paddingBottomRight: [30, wide ? 40 : 330],
    })
    const group = markers.current
    m.doubleClickZoom.disable()
    return () => {
      m.remove()
      group.clear()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    for (const [id, mk] of markers.current)
      mk.setStyle({
        weight: id === sel ? 4 : 2,
        fillOpacity: id === sel ? 0.75 : 0.4,
        color: id === sel ? '#064c5e' : '#0b6f87',
      })
    if (last.current === sel) return
    last.current = sel
    const x = PORTS.find((q) => q.id === sel)
    if (x && map.current)
      map.current.flyTo([x.lat, x.lon], Math.max(map.current.getZoom(), 7), {
        duration: 0.6,
      })
  }, [sel])

  return (
    <div className="relative h-full w-full bg-void">
      <div ref={box} className="absolute inset-0" role="application" aria-label="Map of Indian container ports" />

      {offline && (
        <div className="absolute inset-0 z-[500] overflow-auto bg-void p-6 pt-72 md:pl-[440px] md:pt-6">
          <p className="mb-3 text-t12 text-ink-2">The street map could not load (no internet?). Pick a port from the list.</p>
          <div className="grid max-w-[720px] gap-2 sm:grid-cols-2">
            {PORTS.map((x) => (
              <button
                key={x.id}
                onClick={() => setSel(x.id)}
                className={'border px-3 py-2 text-left text-t12 ' + (x.id === sel ? 'border-signal text-ink' : 'border-line text-ink-2')}
                style={{ borderRadius: 2 }}
              >
                {x.short} <span className="text-ink-3">{x.state}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <section
        className="absolute left-4 top-4 z-[1000] max-h-[calc(100%-2rem)] w-[min(400px,calc(100%-2rem))] overflow-auto border border-line bg-panel/95 p-4 shadow-lg backdrop-blur"
        style={{ borderRadius: 4 }}
      >
        <div className="font-mono text-t12 font-semibold tracking-[0.16em] text-ink">PORTLOGI</div>
        <h1 className="mt-1 text-t16 font-medium leading-snug text-ink">A smart container yard for India's ports</h1>
        <p className="mt-2 text-t12 leading-relaxed text-ink-2">
          Choose where each container goes so the one you need is never buried, move them with self-driving vehicles that never collide, and let
          businesses book a truck so the yard knows when each box will leave.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-t11 text-ink-2">
          <li>Placement that explains itself, and a run you can replay exactly.</li>
          <li>A port-authority view and a business booking desk.</li>
          <li>A simulation: each port opens an illustrative yard, not its real layout.</li>
        </ul>

        <div className="mt-3 border-t border-line pt-3">
          <div className="text-t13 font-medium text-ink">{p.name}</div>
          <div className="text-t11 text-ink-3">{p.state}</div>
          {p.throughput ? (
            <div className="mt-1 text-t11 text-ink-2">
              <span className="tnum text-ink">{formatInt(p.throughput.teu)} TEU</span>, {p.throughput.period} ({GRADE_LABEL[p.throughput.grade]}){' '}
              <a className="text-signal underline" href={p.throughput.source.url} target="_blank" rel="noreferrer noopener">
                source
              </a>
            </div>
          ) : (
            <div className="mt-1 text-t11 text-ink-3">No throughput figure gathered for this port.</div>
          )}
          <div className="mt-1 text-t11 text-ink-3">Illustrative yard: {PRESETS[p.id]?.blurb}</div>
          <Button className="mt-3 w-full" onClick={() => openPort(p.id)}>
            Enter {p.short}
            <ArrowRight size={12} />
          </Button>
          <button className="mt-2 w-full text-center text-t10 text-ink-3 underline" onClick={enterYard}>
            or continue with the current yard
          </button>
        </div>
        <p className="mt-3 flex gap-1 text-t10 text-ink-3">
          <Info size={11} className="mt-[2px] shrink-0" />
          Circle size follows reported throughput where a source exists. Click a port, then enter it. Drag and zoom the map freely.
        </p>
      </section>
    </div>
  )
}
