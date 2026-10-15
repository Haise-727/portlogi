# Presentation (PPT) text, slide by slide

About 12 slides, 8 to 10 minutes. Put numbers on slides, keep sentences short. Speaker notes are in italics. **[YOU]** marks things only you can fill. Rubric hooks: link to the Tamil Nadu Smart City challenge, explain architecture and workflow, show contribution of each member.

---

**Slide 1: Title**
Smart yard for V.O. Chidambaranar Port, Thoothukudi
Departure-aware container placement with RFID gate admission and truck booking
[Names, register numbers, guide, date] **[YOU]**

**Slide 2: The problem**
- A box stacked on top of one that leaves earlier means an extra lift (a "rehandle").
- Indian port dwell is long: export median just over 4 days (S&P, Q1 2024).
- Pickup times for import boxes are mostly unknown at the moment the box is placed.
- Trucks wait, vehicles do wasted moves, cost rises.
*Say: our challenge is Tamil Nadu port logistics, run as a Smart City service.* **[YOU]** name the exact challenge from your DA1/DA2.

**Slide 3: Objectives**
1. Place each box where it is least likely to block another.
2. Move boxes with several vehicles without collisions.
3. Let businesses book a truck so the yard learns the pickup time.
4. Show every decision and be able to replay it.
5. Offer it securely as a government-to-business (G2B) service.

**Slide 4: Background and gap**
- Commercial systems (Navis, INFORM) are closed and costly; research models mostly assume known departure times.
- Few studies handle *uncertain* pickup times.
- Our gap: what is departure information worth, and when must it arrive?
*Be honest: stacking by departure time is a known idea.*

**Slide 5: System architecture** (diagram)
Gate RFID reader (ESP32, planned) → Firebase relay (authenticated) → Web app on AWS Lambda → Yard engine (allocator + traffic control) → Business desk and authority view.
Label what is built and what is planned: hardware gate = planned.

**Slide 6: How a box is placed** (flow chart)
Card read → record created → hard rules (power, weight, hazmat) → score every slot (rehandle 40, travel 15, cluster 15, spread 12, access 18) → best slot → vehicle plans route → reserves cells → lift, carry, lower → log with "why here".

**Slide 7: Traffic without collisions**
- Each vehicle reserves cells for time windows; no two share a cell.
- Deadlock (a ring of waiting vehicles) is detected and one vehicle is sent to a free cell.
- Result: 0 safety violations in 200 random yards and 200 paired runs.

**Slide 8: Business desk (G2B)**
Screenshot. A shipping line sees only its boxes, picks a haulier and a pickup window, sees a quote including dig-out cost. The booking becomes the box's departure time. (Lines and hauliers are fictional; names are altered.)

**Slide 9: Results 1: placement quality** (chart `reports/fig1_headline.svg`)
| | First-available | Our allocator |
|---|---|---|
| Rehandles per 30 boxes | 6.7 ± 0.4 | 2.0 ± 0.3 |
- 69.6% fewer rehandles; better in 96 of 100 runs.
- Against a departure-time rule alone: about 31% fewer. Show both.

**Slide 10: Results 2: what is departure information worth?** (chart from `reports/information.md`)
| Information | Rehandles per 20 boxes | Truck wait (min) |
|---|---|---|
| Guess only | 4.1 | 9.8 |
| Estimate 15 min off | 1.7 | 7.2 |
| Booked 1 hour ahead | 4.0 | 0.0 |
| Booked at arrival | 1.3 | 0.0 |
Message: **book at discharge, not at pickup.** Later booking still removes truck waiting. Model result (pickup times are assumed 1 to 5 h after arrival).

**Slide 11: Security and deployment**
- Hosted on AWS Lambda over HTTPS; free-tier cost checks before each deploy.
- Security Headers grade **A+** (scan 15 Oct 2026); our own 31 of 31 live checks pass (CSP, HSTS, no path traversal, etc.).
- Firebase rules: gate devices can only add scan records; sign-up disabled. **[YOU]** add the SSL Labs result.
- Not claimed: "unhackable". It is a demo with no real port data.

**Slide 12: Smart City relevance** 
- Citizens and businesses: shorter truck waits, less idling and congestion near the port, lower handling cost.
- Sustainability: fewer wasted moves means less fuel or energy (not yet measured).
- SDGs: 9 (industry, innovation, infrastructure), 11 (sustainable cities), 12 (efficient resource use), 13 (climate). **[CHECK]** keep only those you can justify.
- Scalable: ports map with eight Indian ports, each with its own illustrative yard.

**Slide 13: Limitations and next steps**
- All results are from simulation; the real yard layout and rehandle rate of VOC Port are not public.
- Hardware gate (ESP32 plus RFID) is the next build; latency to be measured.
- Next: noisy forecasts of pickup time, real PCS1x and LDB links, pilot data.

**Slide 14: Team contribution** **[YOU]**
One line per member: who built what (engine, interface, hardware, security, report).

**Slide 15: Demo plan** (1 to 2 minutes, rehearse)
1. Press Auto; point out vehicles and the log.
2. Click a box; show "Why here".
3. Vessel discharge scenario, open Business desk, book a truck, watch the box staged at the gate.
4. Ports map: open Mundra (4 tiers) vs VOC.
5. Open "Real ports and G2B" for sources and the impact calculator.
Backup: if wifi fails, the street map falls back to the schematic; screenshots in the deck.
