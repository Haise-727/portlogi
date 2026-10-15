# Poster text (A1 or A2, portrait)

Rubric: A1/A2; diagrams, charts and short bullets rather than paragraphs; highlight problem, innovation, results and citizen benefits; verified results only; label anything not yet implemented; readable from a distance (body at least 24 pt on A1, titles 60 pt or more). Boxes marked [FIG] are images you will export.

---

## HEADER
**Smart yard: placing containers so the one you need is never buried**
V.O. Chidambaranar Port, Thoothukudi | Design of Smart Cities, Tamil Nadu Smart Cities Project
[Names, register numbers, guide, institute] **[YOU]**

## 1. THE PROBLEM
- A box under one that leaves earlier needs an extra lift: a **rehandle**.
- Export median dwell at Indian ports: just over **4 days** (Q1 2024).
- Import pickup times are usually unknown when a box is placed.
- Result: trucks wait, vehicles do wasted moves, costs and congestion rise.

## 2. OUR IDEA
- Choose each slot by rules (reefer power, weight, hazmat) plus a five-part score.
- Several vehicles move boxes without ever sharing a cell.
- A business books a truck; the booking tells the yard the pickup time.
- Every decision is explained and can be replayed exactly.

## 3. HOW IT WORKS
[FIG] system diagram: RFID gate (planned) → cloud relay → web app → yard engine → business desk
[FIG] flow chart: card read → rules → score → vehicle route → log
Tag clearly: **Built** = engine, interface, business desk, ports map, secure hosting. **Planned** = ESP32 RFID gate hardware.

## 4. RESULTS (simulation, verified)
[FIG] `reports/fig1_headline.svg`
- **69.6% fewer rehandles** than first-available placement (6.7 → 2.0 per 30 boxes, 100 runs).
- About **31% fewer** than a departure-time rule alone.
- **0 safety violations** in 200 random yards.
- Identical results on replay (10 of 10 seeds).

## 5. WHAT IS TIMELY INFORMATION WORTH?
[FIG] chart of the table in `reports/information.md`
- Pickup time known **when the box is placed**: rehandles 4.1 → **1.3**.
- A booking made later: no fewer rehandles, but truck wait ~10 min → **0**.
- **Take-away: book at discharge, not at pickup.**
(Model result, 32 runs; pickup times assumed 1 to 5 h after arrival.)

## 6. BUSINESS AND GOVERNMENT (G2B)
[FIG] business desk screenshot
- Shipping line sees its own boxes, picks a haulier and window, sees a quote.
- Port authority sees all lines and an impact calculator with sourced figures.
- Lines and hauliers shown are fictional.

## 7. SECURE AND LOW COST
- Runs on AWS Lambda over HTTPS; Firebase rules allow gate devices to add scans only.
- Security Headers grade **A+**; 31 of 31 own live checks passed. [FIG] screenshot of the A+ result
- Free-tier hosting; no real port data stored.

## 8. MULTIPLE PORTS
[FIG] ports map screenshot
- Eight Indian ports, each with its own illustrative yard (size, tiers, vehicles, settings).
- Illustrative only: real yard layouts are not public.

## 9. CITIZEN AND SMART CITY BENEFITS
- Shorter truck waits and less idling near the port. (Reduction proven in simulation; field effect not yet measured.)
- Lower handling cost and energy use per box (expected).
- Open, auditable service for small businesses, not just large terminals.
- SDGs: 9, 11, 12, 13 **[CHECK]** keep what you can justify.

## 10. LIMITS AND NEXT STEPS
- Results come from simulation, not a real yard.
- Planned: ESP32 + RFID gate with measured latency, forecasts of pickup time, links to national port systems.

## FOOTER
References: Dekker et al. 2006; Ku and Arthanari 2016 (EJOR 252); Klimm et al., conflict-free AGV routing; S&P Global Q1 2024 via BusinessWorld; JNPA/LDB Analytics Oct 2024. Map © OpenStreetMap contributors.
QR code: live site **[YOU]** generate from https://psjkcvqmjxpwimkenx7bbmsfky0fxqmj.lambda-url.ap-south-1.on.aws/
