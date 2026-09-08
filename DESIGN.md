# portlogi — design plan

Written before the first component. Revised once against the brief (critique at the bottom).

## Subject

A port operations console for Thoothukudi container yard. The reference points are vessel
traffic services, ATC strips and SCADA HMIs — screens people stare at for eight-hour shifts.
Those screens are dark, dense, hairline-ruled, and use colour only where colour means
something. They are never padded out, never decorated, never "designed" in the marketing sense.

## Palette

Neutral base, cool charcoal (never `#000`). One accent. Everything else is data colour.

| token | value | use |
|---|---|---|
| `void` | `#080B0D` | page ground |
| `panel` | `#0E1316` | panels, rails |
| `raise` | `#151B20` | slot floors, inputs |
| `line` | `#1E262C` | hairline rules (the main structural device) |
| `line-hi` | `#2C363E` | active/hover rules |
| `ink` | `#E4EBF0` | primary text |
| `ink-2` | `#8B9AA5` | labels |
| `ink-3` | `#56646E` | disabled, units, axis |
| `signal` | `#2FA9BC` | **accent — selection, A\* route, chosen slot.** Nothing else. |

Priority bands are the only other colours, and they are the point of the colour system:

| band | value | reading |
|---|---|---|
| `critical` | `#E0503C` | departs imminently / vessel cutoff |
| `high` | `#DE9A32` | urgent |
| `normal` | `#5E8CA6` | routine (steel, deliberately quiet) |
| `low` | `#4A5A65` | plenty of dwell left |

Rejection uses `#6E3A38` as a muted fill, not a bright red — a rejected slot is information,
not an error. Desaturated across the board so the yard reads as one system under low light.

## Type

- **Sans:** Geist — chrome, labels, prose.
- **Mono:** Geist Mono — container IDs, slot labels, all numerals, scores, coordinates, clock.
  Machine identifiers are monospace in every real ops system; tabular figures also stop
  metric counters from jittering as they tick.
- Both bundled locally via `@fontsource`. The demo must not depend on the venue's wifi.
- Scale is small and tight: 11/12/13px working sizes, `tracking-tight` on the few headings.
  No oversized display type — nothing on this screen is a headline.

## Layout

Three zones, asymmetric, full viewport height, no page scroll:

```
┌────────────────────────────────────────────────────────────┐
│ status bar — port, sim clock, speed, mode                   │
├──────────┬──────────────────────────────┬───────────────────┤
│ controls │                              │  ALGORITHM        │
│  scan    │        THE YARD              │  INSPECTOR        │
│  retrieve│      (hero, centred,         │  score breakdown  │
│  auto    │       everything else        │  runners-up       │
│  speed   │       is quiet)              │  rejections       │
│          │                              │  A* cost          │
│ metrics  │  gate ▸ grid ▸ quay          ├───────────────────┤
│          │                              │  EVENT LOG        │
└──────────┴──────────────────────────────┴───────────────────┘
   288px              1fr                       384px
```

The yard owns the centre at a fixed aspect ratio so crane, route overlay and slots share one
coordinate space. Panels are separated by 1px rules, not by gaps, shadows or rounded cards.

## Principles

1. **Colour is data.** If a colour is not a priority band, a route, or a rejection, it is grey.
2. **Hairlines, not boxes.** Structure comes from 1px rules and negative space. Radius ≤ 3px.
3. **Motion explains.** Every animation shows a step the algorithm actually took — the route
   traced along real A\* output, candidate slots flashing their scores, a rehandle played
   slowly enough to feel wasteful. Nothing loops for decoration.
4. **Every decision is inspectable.** No number appears without somewhere to see how it was
   derived. The inspector is a first-class screen, not a tooltip.
5. **Dense is correct.** Padding is 8–12px, not 32px. This is a cockpit.

## Critique of the first draft, and what changed

- *"Metrics as six bordered cards"* — that is the generic dashboard default, and the brief
  bans identical soft-shadow cards. **Changed:** metrics become one hairline-divided column of
  value-over-label rows, no borders around each figure.
- *"Accent gradient on the primary button"* — decoration, and a gradient wash is on the
  avoid-list. **Changed:** the scan button is a flat signal-tinted surface with a 1px inner
  top highlight and a 1px active press. Tactile, not glossy.
- *"Caps eyebrow labels over every panel heading"* — banned by the brief. **Changed:** panel
  headings are single small sans words in `ink-2`; caps are reserved for machine tokens
  (`B2`, `CRITICAL`, `TUTX`), where caps are the real-world convention rather than styling.
- *"Colour containers by cargo type"* — this competes with the priority encoding, and priority
  is what the algorithms actually act on. **Changed:** type is an icon (snowflake, triangle,
  glass), priority is the fill. One channel, one meaning.
- *"Neon glow on the selected slot"* — an AI tell and physically wrong for a top-down yard
  view. **Changed:** selection is a 1px signal ring plus corner ticks, like a radar cursor.
