# portlogi

Browser-based simulation of an automated container yard at **V.O. Chidambaranar Port,
Thoothukudi**. It is the software half of a smart-cities project; an ESP32 with an RFID reader
is the hardware half, and a card scanned at the rig admits that card's container at the gate on
screen.

The point of the thing is that the algorithms are *visible*: every placement, route, priority
band and traffic hold can be interrogated while it happens, and any moment can be replayed.

```bash
npm install
npm run dev        # http://localhost:5173  (the whole app, no backend needed)
npm run server     # optional: ESP32 bridge + experiments API on :8787
npm test           # engine, traffic safety, replay, random-layout stress
npm run report     # every number and figure for the written report -> reports/
npm run build
```

No network calls happen unless the hardware feed is switched on. Fonts are bundled, so it runs
on a venue's wifi or none at all.

## The screen

The yard owns the screen. Everything else is something you summon.

| You see | Behind it |
|---|---|
| The yard, a thin top bar, a three-line log | |
| Four figures in the bar (in yard, out, rehandles, busy) | Click them for the full metrics |
| | **☰ Settings** (right sidebar): Run, Layout, Boxes, Tuning |
| | **Click a crate** for its inspector (Details, Why here). Close with the X or `Esc` |
| | **Click the log** to open the full history. Click any line and the yard rewinds to that moment; scrub, play on, or go back to live |
| | **Optimised vs first-available**: the experiment, run 40+ times in a worker |

`S` scan · `A` auto · `space` pause · `1`–`5` speed · `M` settings · `L` log · `C` compare · `Esc` close the top layer

### Editing the yard while it runs

- **Layout tab**: 1–8 rows, 1–10 columns, 1–4 tiers, any number of gates and quays on the top
  and bottom edges, transfer pads, and a per-position toggle (dry, powered, out of service).
  Aisles are generated, so any layout stays drivable. Applying a layout while vehicles are
  working pauses new arrivals and applies it the moment they are free. It is refused if it would
  leave a stored box without a position.
- **A crate's inspector**: change its type (a reefer needs a powered slot; if the box is in the
  wrong place it is relocated automatically), name a group, **Retrieve**, or **Move to…** and
  click any legal slot (illegal slots are hatched, with the rule on hover).
- **Boxes tab**: tick several boxes and name them as a group; the allocator keeps a group together.
- **Run tab**: scan at a specific gate, and one-click scenarios: vessel surge, gate burst, reefer
  storm, cutoff rush, vehicle breakdown.
- **Tuning tab**: the allocator's five weights and the vehicles' handling times, live.

## How it works

```
src/engine/      pure TypeScript, no React, no timers, no globals
  layout.ts        LayoutSpec -> Layout: grid, slots, gates, quays, pads, parking bays
  allocator.ts     where a box goes (5 weighted terms, hard rules, a reason for each rejection)
  priority.ts      which boxes go first (urgency, class, dwell, vessel cutoff)
  pathfinder.ts    A* with a corner penalty; costMap prices the whole yard in one pass
  traffic.ts       time-window reservations; the collision guarantee lives here
  engine.ts        the simulation: fixed 0.01-minute step, commands in, events out
  session.ts       command journal + checkpoints = deterministic replay
  experiment.ts    headless runs and the allocator-vs-baseline comparison
  invariants.ts    safety properties checked by the tests and the stress sweep
src/store/       Zustand: owns the session, the clock and UI state
src/components/  stage/ (the yard), chrome/ (bar, sidebar, inspector, log), ui/ (shadcn-style)
server/          node:http backend: ESP32 bridge (SSE) and experiments
scripts/         report generator
```

### Vehicles and traffic

A vehicle moves at constant speed (0.15 min per 100 drawing units, so a wide slot column takes longer to cross than a narrow aisle row), and **0.12 min more to take a corner**, spent pivoting in place at the corner cell (it is booked in the schedule; on screen the vehicle turns on the spot rather than slowing). It stands still while it
lifts (0.6 min at a slot, 0.9 at the gate and quay, 2.2× slower for a dig-out), shown as a ring
around it. Those times are configurable.

Every vehicle books the cells of its route for the exact windows it will occupy them, including
the slower corners. The final cell is an open-ended claim: a parked or waiting vehicle holds its
cell until it books a way out. A new route is checked against all bookings first; on a clash the
vehicle waits for the window to clear or detours, whichever is cheaper. **There is no pre-emption**:
a booking is honoured, so priority decides who is served first, never who is shoved aside.
Because the simulation advances vehicles with the same per-segment times the schedule used, the
windows are exact rather than estimates. Deadlocks (two vehicles waiting on each other, or one
waiting on an idle vehicle) are broken by sending the lower-priority one to the nearest free cell
that is off everyone else's route.

### Replay

The engine is deterministic: same seed, layout and command sequence give the same yard. Every
command is journalled, and a checkpoint is taken every simulated hour. Replaying to any moment
restores the nearest checkpoint and re-runs the journal, so it costs at most an hour of steps.

### Best-position scoring

`score(slot) = 40·rehandleRisk + 15·travel + 15·cluster + 12·spread + 18·access`, lowest wins.
**Rehandle risk is the core idea**: putting a box that leaves at t=100 on top of one that leaves at
t=50 guarantees a wasted vehicle cycle later. Hard constraints reject a slot outright rather than
penalising it, because *impossible* and *expensive* are different answers: tier-N needs tier N-1,
a heavier box cannot sit on a lighter one, reefers need a plug, hazmat cannot touch hazmat.

## Hardware bridge

The rig only has to report a card's UID. An ESP32 sends:

```
POST http://<laptop-ip>:8787/api/scan
x-device-key: portlogi-dev            (set DEVICE_KEY in the environment to change it)
content-type: application/json

{ "uid": "04:A3:2F:91", "reader": "gate-1" }
```

The backend validates it (8–20 hex characters, separators allowed), then pushes it to every open
browser over `GET /api/events` (Server-Sent Events). With **Settings → Run → Hardware scanner**
on, the page admits that card's container. A card always maps to the same container (the UID seeds
the generator), and scanning a card that is already in the yard is reported rather than duplicated.

Other endpoints: `GET /api/health`, `GET /api/scans`, `POST /api/experiments {seeds, arrivals}`.

## Evidence

`npm run report` runs the real engine headless and writes to `reports/`: the allocator-vs-baseline
comparison over 100 seeds with confidence intervals, an ablation of each scoring term, scaling
from 12 to 60 positions, fleet size, a randomised robustness sweep with safety invariants checked
throughout, and a determinism check. Tables are CSV and `results.md`; figures are SVG.

`npm test` covers the algorithms, the traffic rules, replay, and 24 random layouts under load.

### Known limits

- Very crowded yards can stall: in a 500-layout sweep, a handful of layouts with 4–5 vehicles in
  large, tall yards stopped delivering. The editor therefore caps the fleet at about one vehicle per
  five positions and never more than rows + 1. The default yard is unaffected.
- Safety held in every run: no collision, illegal stack or lost box was ever observed.
- Time is simulated: one real second is one sim-minute at 1×.

## Stack

React 19 + TypeScript + Vite, Tailwind v4, Radix primitives with shadcn-style wrappers, Motion for
animation, Zustand, Recharts (comparison dialog only, lazy-loaded), lucide icons. Vitest for tests.

Design rationale is in [DESIGN.md](DESIGN.md).
