# Invention disclosure form: draft answers (Section A)

Draft for you to rewrite in your own words (AI-similarity limit). Facts and numbers come from this repo. **[YOU]** marks things only you can supply; **[CHECK]** marks things to verify before submitting. Fields follow the order in `classDocs/Invention DisclosureForm...docx`.

Be honest about prior art: `docs/real-world-and-patentability.md` concludes that patentability as filed is unlikely, so claim narrowly and say so in Q22.

---

**1. Title (max 15 words)**
Digital-twin yard allocation system with departure-aware container placement, RFID gate admission and booking-driven pickup

**2. What is the invention?**
- *Problem:* in a container yard, a box stacked on top of one that leaves earlier forces a "rehandle" (an extra lift). Rehandles waste vehicle time, delay trucks at the gate and cost money. Indian port dwell is long (export median just over 4 days in Q1 2024), and pickup times for import boxes are mostly unknown when a box is placed.
- *Solution:* a software system with an RFID gate front end that (a) admits a box when its RFID card is read, (b) chooses a slot with a weighted rule set plus hard safety rules (reefer power, weight, hazmat), (c) moves it with several vehicles that never collide, and (d) lets a business book a haulier's truck, which turns an unknown pickup time into a known one that the yard uses to pre-stage the box.
- *Purpose:* fewer wasted moves, shorter truck waits and an auditable reason for every placement, offered as a government-to-business (G2B) service of a port authority.

**3. Search terms**
container yard, stacking, rehandle, re-shuffle, expected departure time, slot allocation, terminal operating system, AGV, straddle carrier, time-window reservation, deadlock, RFID gate, truck appointment, digital twin, reefer, dwell time, G2B, port community system.

**4. Background (present state of the art)**
Present technology:
- Terminal Operating Systems (for example Navis N4 Expert Decking, INFORM Yard Optimizer) assign slots from live yard state; one vendor case study reports 25% fewer rehandles.
- Truck appointment systems reveal pickup time windows; research models exist for stacking with departure information (Dekker et al. 2006; Ku and Arthanari 2016).
- Conflict-free multi-AGV routing by time-window reservation (Klimm et al.; HHLA CTA Hamburg).
- In India: Logistics Data Bank RFID tags, the PCS1x single window, RFID gates at some terminals.

Limitations: commercial systems are closed and expensive; research models assume departure times are known, or study them offline; few handle *uncertain* departure times; decisions are rarely explained to the operator; nothing joins gate, allocator, traffic control and business booking in one open, replayable system.

**5. Prior art**
Literature: Dekker et al. 2006; Ku and Arthanari 2016 (EJOR 252); stochastic container relocation (arXiv 1703.04769); Klimm et al. static routing preprint; Kim, Jeon and Ryu grid-block reservation; WSC 2022 paper on AGV deadlocks.
Products: Navis N4 Expert Decking; INFORM Yard Optimizer; Kaleris.
Patents seen (claims not read): US5511923A, US 10647530, US11866260B2.
**[CHECK]** do a proper search on Google Patents, Espacenet and InPASS (CPC B65G 63/04, G06Q 10/08).

**6. Has it filled a major gap?**
Partly. The gap addressed is stacking when pickup times are uncertain and a booking may arrive later. Our experiment shows information only reduces rehandles if it is known at placement, while a later booking still removes truck waiting by pre-staging. This is a finding, not a claimed breakthrough.

**7. Components**
1. RFID reader and microcontroller at the gate (ESP32) reading the card UID **[hardware not yet built]**.
2. Cloud relay (Firebase Realtime Database, authenticated, write-only for gate devices) **[implemented; live end-to-end test pending]**.
3. Yard engine: deterministic simulation, command journal, replay.
4. Allocator: five weighted terms (rehandle 40, travel 15, cluster 15, spread 12, access 18) plus hard rules.
5. Traffic controller: A* routing, time-window cell reservations, deadlock detection and refuge.
6. Business desk: shipping-line view, haulier booking, quote.
7. Authority view, impact calculator and multi-port map.
8. Web front end hosted on AWS Lambda over HTTPS with strict security headers.

**8. How it works (sequence)**
1. A card is read at the gate; the UID goes to the cloud relay and the page receives it (or an operator presses Admit).
2. A container record is created (type, weight, reefer, hazmat, destination, estimated departure).
3. The allocator checks hard rules first (reefer needs a plug, heavy not on light, hazmat not adjacent), then scores each remaining slot; the lowest cost wins and the breakdown is stored.
4. A vehicle is assigned and a path planned; cells are reserved in time windows; if a cycle of waiting vehicles forms, one is sent to a free refuge cell.
5. The vehicle lifts, carries and lowers; a box blocking another is moved to a transfer pad and later re-slotted.
6. For an import box, the business books a haulier and window; the booking sets the box's departure time; the yard digs the box out and stages it at the gate before the window.
7. Output: slot, route, log, metrics and a "why here" explanation. Every command is journaled so a run can be replayed exactly.

**9. Novelty / inventive step** (state modestly)
- An integrated pipeline from RFID admission to booking-driven pre-staging, with deterministic replay and a per-decision explanation.
- Quantified value of information: only a departure time known at placement cuts rehandles (about 4.1 to 1.3 per 20 import boxes); a later booking removes truck wait (about 10 min to 0).
- Transfer-pad parking of a box with no legal slot, re-slotted when a legal slot opens.
- A cycle-aware deadlock breaker that tries cycle members by priority, then vehicles waiting on the cycle.

**10. Advantages over existing methods**
- Against first-available placement: 69.6% fewer rehandles (6.7 to 2.0 per 30 boxes, 100 seeds; confidence intervals in `reports/results.md`).
- Against a departure-time rule alone: about 31% fewer rehandles.
- Safety: 0 violations in 200 random layouts and 200 paired runs; identical state on replay.
- Open, explainable, runs in a browser, about zero hosting cost on free tiers.
- Against Navis or INFORM we have no evidence of being better; our baselines are not their products. Say so.

**11. Alternative embodiments**
Straddle carrier or RTG instead of the lift-AGV; rail yards; dry ports and inland container depots; warehouses and cold storage; airport cargo; integration with truck appointment systems; ML-based forecasts of pickup time; pre-marshalling when idle; real PCS1x and LDB integration.

**12. Drawings** **[YOU]** export from the app and label by hand:
1. System block diagram (gate, cloud, engine, allocator, traffic, desk, authority).
2. Allocation flow chart (rules, score, pick, plan, move).
3. Yard screenshot (a labelled and an unlabelled version).
4. Business desk, ports map and the "Why here" breakdown.
5. Charts: `reports/fig1_headline.svg` to `fig4_fleet.svg`.

**13. Description of drawings** **[YOU]** one or two sentences per figure, in your own words.

**14. Complete description with a working example**
A 3x4 yard with two tiers. A reefer arrives with an estimated departure in 90 minutes. Only powered slots are allowed; a slot that would sit on a box leaving earlier is penalised as a rehandle risk; among the rest the cheapest score wins and the breakdown shows each term. Later the owner books a haulier for a window 3 hours out; the box is dug out and brought to the gate 20 minutes before.

**15. Experiments and mathematics**
- Score(slot) = 40 x rehandle + 15 x travel + 15 x cluster + 12 x spread + 18 x access; lowest wins after hard rules. **[CHECK]** exact normalisation in `src/engine/allocator.ts`.
- Traffic: segment time proportional to real cell distance; reservations as time windows per cell.
- Impact: avoided moves = boxes x baseline rehandle rate x reduction; boxes = TEU / TEU per box. The baseline rehandle rate is a what-if because real rates are not public.
- Results: `reports/results.md` (ablation, scaling to 60 slots, fleet size, 200-layout safety, determinism) and `reports/information.md` (value of information, 32 seeds).
- Value of one avoided move uses the published shifting tariff of INR 1,278 (`src/data/ports.ts`, with its source).
- No third-party validation exists; everything is simulation.

**16. Code**
TypeScript 5, React 19, Vite; engine in `src/engine/`; tests with Vitest (99 passing) and node:test (12). Parameters: tick 0.01 sim-min; weights above; reefer 15%, hazmat 5%; handling times lift 0.6, gate 0.9, quay 0.9 min. **[YOU]** add the repository link.

**17. Machine learning**
Not applicable: no ML model is used. (A future variant could forecast pickup times with ML.)

**18. Public disclosure**
**[YOU]** The site is publicly reachable at https://psjkcvqmjxpwimkenx7bbmsfky0fxqmj.lambda-url.ap-south-1.on.aws/. State when it went public and whether anything was published. Tell your IP cell, since disclosure before filing can harm novelty.

**19. Stage**
(b) Software completed and validated in simulation. The hardware gate (ESP32 with RFID) is not built or tested, and no real port data is used. Roughly TRL 3 to 4.

**20. Proposed claims** (narrow, in order of promise)
1. A system joining an RFID gate read, a rule-and-score slot allocator and vehicle booking, in which a box with no legal stack is parked on a transfer pad and re-slotted when a legal slot opens.
2. A method in which a business booking supplies a box's departure time and the yard pre-stages the box at the gate before the booked window.
3. A traffic method with an open-ended final-cell claim, time-windowed route claims and a deadlock breaker that tries cycle members by priority, then vehicles waiting on the cycle.
4. Per-placement explanation and a deterministic command-journal replay as the audit record.

**21. Novelty search conducted**
Web search only (see Q5); no patent database was queried. **[YOU]** run Google Patents, Espacenet and InPASS and complete the table.

| Sno | Reference | Existing idea | Our invention |
|---|---|---|---|
| 1 | Dekker et al. 2006 | Stacking with departure-time information | We add uncertain and late-arriving information and measure its value |
| 2 | Ku and Arthanari 2016 | Stacking with departure time windows | We add booking after placement and pre-staging |
| 3 | Navis Expert Decking | Slot assignment from yard state | We add explanation, replay and open G2B booking |
| 4 | INFORM Yard Optimizer | Dwell and loading-sequence based optimisation | As above |
| 5 | Klimm et al.; Kim et al. | Time-window or grid reservation for AGVs | Open-ended final-cell claim; cycle-aware refuge |
| 6 | US5511923A, US 10647530 **[CHECK]** | Terminal layout; horizontal transport conflicts | Read the claims and compare |

**22. Would a person of average skill have arrived at it?**
Probably yes for each piece, since the allocator and the reservation scheme are known. The combination (a booking turning an unknown departure into a known one, pad re-slotting, RFID-to-yard integration with a replayable audit record) is less obvious, but an examiner could still find it obvious. Say this plainly.

**23. Working ranges**
Rows 1 to 8; columns 1 to 10; tiers 1 to 4; vehicles 1 to 6 (limited by yard size); transfer pads up to 4; weights 0 to 100 each; reefer share 0 to 100% (default 15%); booking lead at least 16 sim-minutes; simulated up to 60 slots. **[CHECK]** exact limits in `src/engine/layout.ts` (`LIMITS`) and handling-time ranges in the sidebar.

**24. Commercialisation**
1. Kaleris (Navis), 3460 Preston Ridge Rd., Suite 225, Alpharetta, GA 30005, USA (HQ listed on kaleris.com).
2. INFORM GmbH, Pascalstr. 35, 52076 Aachen, Germany (inform-software.com/contact).
3. PSA SICAL Terminals, Thoothukudi **[YOU: look up the address]**.
4. DP World / JNPA container terminals **[YOU: address]**.
5. APM Terminals Pipavav **[YOU: address]**.
Marketing profile: open, explainable, replayable yard decision support that a port authority could offer to shipping lines and hauliers as a booking service, with near-zero hosting cost. Not proven against commercial systems.

**25. Market potential**
Estimates disagree and come from low-authority research publishers, so cite with care **[CHECK]**: Marketintelo values the global TOS market at USD 5.8 billion in 2025, rising to USD 11.4 billion by 2034 (7.8% CAGR); Emergen Research gives the TOS segment 7.2% CAGR inside a USD 10.5 billion container-terminal-operator market in 2024.

| Year | Estimated market size | Growth drivers | Notable existing devices |
|---|---|---|---|
| 2025 | USD 5.8 B (TOS, Marketintelo) | Port automation, throughput growth | Navis N4, INFORM, Kaleris |
| 2034 | USD 11.4 B (same source) | Digital single windows, G2B services | Same, plus PCS1x and LDB in India |

---

**26. Inventors** **[YOU]** Full names, register numbers, department and role of each team member. If anyone is not from VIT Chennai (for example an outside collaborator), they must also sign the No Objection Certificate in `classDocs`. If everyone is VIT Chennai, the NOC is not needed.

**27. User information**
a. Potential users: port authorities, terminal operators, shipping lines, clearing agents, hauliers and truck operators; later inland container depots and dry ports.
b. Age group: working adults, roughly 22 to 60 (yard planners, gate staff, dispatchers, logistics managers). **[CHECK]** no survey was done.
c. Expected benefits: fewer wasted container moves, shorter truck waits, a reason shown for each placement, bookings that give the yard a real pickup time. Measured in simulation only.
d. Cost advantage: runs in a browser on free-tier cloud hosting, with a low-cost RFID reader at the gate; commercial yard-planning software is licensed and typically costly. **[CHECK]** no price comparison was gathered, so say "expected" and avoid numbers.

**28. Technology readiness level**
Tick **TRL 3** (experimental proof of concept) and say that parts of the software are validated in simulation (TRL 4 for that part only). The hardware gate is not built and no relevant environment has been used, so do not tick TRL 5 or above.

**29. Additional notes**
Say that all results are simulation results, real yard layouts and rehandle rates are not public, the businesses and hauliers are fictional, and the ports map shows illustrative yards. Mention the public demo URL and the security scan grades (A+ on Security Headers and SSL Labs).
