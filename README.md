# portlogi

Browser-based simulation of an automated container yard at **V.O. Chidambaranar Port,
Thoothukudi**. It is the software half of a smart-cities project; the hardware rig — twelve
slot buttons and three control keys on a 4×4 matrix keypad — carries the same A1–C4 slot
legend, so the two halves read as one system.

The point of the thing is that the algorithms are *visible*. Every placement, route, priority
band and traffic hold can be interrogated on screen while it happens.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle
```

No backend, no network calls at runtime. Fonts are bundled, so it runs on a venue's wifi or
none at all.

## The yard

```
                  ┌── GATE (entry) ──┐
                  ▼
          ┌─────┬─────┬─────┬─────┐
     Row A│ A1  │ A2  │ A3  │ A4  │   ← powered bank, reefers only
          ├─────┼─────┼─────┼─────┤
     Row B│ B1  │ B2  │ B3  │ B4  │
          ├─────┼─────┼─────┼─────┤
     Row C│ C1  │ C2  │ C3  │ C4  │
          └─────┴─────┴─────┴─────┘
                       ▲
                QUAY (exit, berth 3)
```

Twelve ground slots, two tiers, twenty-four boxes, plus two transfer pads on the quay apron
for temporary set-downs. Lift-AGVs — automated yard trucks with an onboard spreader — run the
aisles between rows and the driveways down each side; they carry horizontally and lift on the
spot, which is why one vehicle type covers both moving and stacking. Every dimension lives in [`src/lib/yardConfig.ts`](src/lib/yardConfig.ts) —
change `rows`, `cols` or `tiers` there and the grid, the pathfinding graph and the rendered
layout all follow.

## The four algorithms

All of `src/lib/` is pure TypeScript with no React import, so each piece can be explained and
tested on its own. Every one returns a decision **and** the reasoning behind it.

| File | What it decides | How it justifies itself |
|---|---|---|
| [`allocator.ts`](src/lib/allocator.ts) | Which slot and tier an arriving box goes to | Five weighted terms, each with its own sentence, plus the rule that rejected every illegal slot |
| [`priority.ts`](src/lib/priority.ts) | Which boxes get worked first | Urgency, handling class, dwell and vessel cutoff, and which of the four drove the band |
| [`pathfinder.ts`](src/lib/pathfinder.ts) | How an AGV gets there | A\* path, its cost, its turns, and the nodes the search expanded |
| [`traffic.ts`](src/lib/traffic.ts) | Who moves when two AGVs want the same cell | The reservation that clashed, whose cargo outranked whose, and whether waiting or detouring was cheaper |

### Best-position scoring

`score(slot) = 40·rehandleRisk + 15·travel + 15·cluster + 12·spread + 18·access`, lowest wins.
Each term is normalised to 0–1 before weighting so the bars in the inspector are comparable.

**Rehandle risk is the core idea**: putting a box that leaves at t=100 on top of one that
leaves at t=50 guarantees a wasted AGV cycle later. **Aisle access** is measured rather than
assumed — the router is re-run over the whole yard with the candidate cell treated as solid,
so "this slot walls off the aisle" is a number.

Hard constraints reject a slot outright instead of penalising it, because *impossible* and
*expensive* are different answers: tier 1 needs tier 0 filled, a heavier box cannot sit on a
lighter one, reefers need the powered bank, hazmat cannot touch hazmat.

### What the comparison proves

Comparison mode runs the same thirty arrivals twice from one seed — identical containers,
weights, departures and arrival times, with slot choice the only variable. Across seeds the
allocator cuts rehandles by 55–100%. Rehandles are counted at retrieval, where a terminal
actually pays for them, not predicted at placement.

The gate-blocked row is shown even though the allocator often loses it: refusing slots the
naive rule would take means holding the gate longer, and that is the honest other half of the
result.

## Reading the screen

- **Colour is priority** and nothing else — critical, high, normal, low.
- **Icon is cargo type** — reefer, hazmat, fragile.
- **Tier 1 offsets up-left** of tier 0 and casts a shadow onto it. The identity strip sits on
  the bottom edge of every box, which the box above never covers.
- **Hatched slots** are illegal for the box being placed; hover for the rule.
- **The dashed cyan line is the real A\*** route, not a straight line between two points.
- **Boxes with a striped red edge are overdue** — their departure has already passed. They are
  forced to the critical band whatever the weighted score says.
- **T1 and T2 on the quay apron are transfer pads**, where a box goes while whatever it was
  sitting on top of is fetched.

The activity log is plain by default, one sentence per event. The **detail** switch in its
header adds the scores, costs and rules underneath each line, plus the vehicle-level traffic
chatter that is hidden the rest of the time.

### Presenter keys

`S` scan · `A` auto mode · `C` comparison · `space` pause · `1`–`4` rate · `Esc` clear

## Structure

```
src/
  lib/          algorithms and the simulation clock — no React anywhere
  store/        Zustand: the clock, the job dispatcher, AGV execution
  components/
    Yard/       grid, slots, containers, AGVs, route and plan overlays
    Panels/     controls, metrics, inspector, event log, container file
    Comparison/ the headline result (lazy-loaded; Recharts is heavy)
```

## Stack

React + TypeScript + Vite, Tailwind v4, Motion for animation, Zustand for simulation state,
Recharts in comparison mode only, lucide-react for icons.

The simulation clock is a `requestAnimationFrame` loop with a speed multiplier rather than
`setInterval`: it stays smooth, it drives the AGV interpolation off the real frame delta, and
it pauses cleanly with the tab instead of banking up a backlog of missed intervals.

Design rationale, including the critique pass, is in [DESIGN.md](DESIGN.md).
