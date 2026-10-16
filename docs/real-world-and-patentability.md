# portlogi against real ports, and whether it is patentable

Written 2026-10-13 from web research plus portlogi's own experiment data. **This is an engineering
assessment, not legal advice.** I could search the web but not Google Patents or the Indian Patent
Office database directly, so "I found no matching patent" below means *my search did not surface one*,
which is much weaker than "none exists". Items from my own background knowledge rather than a source
I read are marked **(unverified)**.

## Bottom line

1. **The problem is real and the approach is sound**, but it is a *textbook* approach. Putting departure
   time into stacking decisions to avoid rehandles is established in the literature and in commercial
   yard-planning software.
2. **Our headline number flatters us.** Most of the 70% reduction comes from that one well-known idea
   (80% of the gain, see §3). Against a strong baseline the improvement is about 31%, not 70%.
3. **As it stands it is unlikely to be patentable**, particularly in India. The core is an algorithm
   (Section 3(k)) and each building block has close prior art. There may be narrow combinations worth
   claiming; see §5.
4. **The biggest realism gap is that we assume exact departure times.** Real yards mostly don't know them.
   That is also the most promising direction for both realism and novelty.

## 1. How real ports handle it

| Topic | What real terminals do | Source |
|---|---|---|
| Yard equipment | RTG blocks stack up to 4 full or 5 empty containers high at up to ~1,000 TEU/ha. An RTG serves 8–9 trucks/hour, which is 30–40 moves because boxes must be reshuffled within the stack. Straddle carriers stack 3 high at 500–700 TEU/ha. | [Transport Geography](https://transportgeography.org/contents/chapter6/function-of-transport-terminals/intermodal-terminal-equipment) |
| Density vs rehandling | Higher density needs careful operations to avoid rehandling; performance holds until a utilisation threshold, then drops sharply because a full yard has no free space to reshuffle. | [Port Economics](https://porteconomicsmanagement.org/stacking-density-container-yard-equipment), [TU Delft thesis](https://repository.tudelft.nl/file/File_1a60914d-c008-4893-ad06-4ffdba3d58ef?preview=1) |
| Automation | About 63 automated terminals were listed as of Jan 2022. Rotterdam's ECT Delta was the first with a complete AGV fleet. Automated yards typically separate AGVs (horizontal transport) from stacking cranes. | [PMC table](https://pmc.ncbi.nlm.nih.gov/articles/PMC9331010/table/Tab1), [container-mag](https://container-mag.com/2011/08/15/gottwald-to-supply-22-agvs-to-rotterdam/) |
| Slot allocation | Done by the Terminal Operating System. Navis N4 *Expert Decking* assigns slots from live yard state; a vendor case study (Darsena Toscana) reports a 25% rehandle reduction. INFORM sells a *Yard Optimizer* that uses dwell time and loading sequence. | [Kaleris](https://kaleris.com/?p=14697), [INFORM listing](https://ptievents.app.swapcard.com/event/container-terminal-automation-conference-americas-2026/product/UHJvZHVjdF8xNDI4NzMy) |
| Departure information | Often only partly known. Research models departure *time windows* revealed by truck appointment systems; "only a few articles" handle uncertain departure times. | [Ku & Arthanari 2016](https://ideas.repec.org/a/eee/ejores/v252y2016i3p1031-1039.html), [Stochastic CRP](https://arxiv.org/pdf/1703.04769) |
| Multi-AGV traffic | Conflict-free routing by **time-window / grid-block reservation** is established, including at HHLA CTA Hamburg; deadlocks are classed as head-on and loop cycles. | [Möhring et al. (2005)](https://opus4.kobv.de/opus4-matheon/files/501/5137_preprint-static-routing.pdf), [WSC 2022](https://www.informs-sim.org/wsc22papers/141.pdf), [Kim et al.](https://ideas.repec.org/h/spr/sprchp/978-3-540-49550-5_12.html) |
| Gate and RFID in India | Logistics Data Bank (NLDS) RFID tags track containers; LDB tracks containers with RFID across Indian ports (a later DLDS milestone says 25 ports; the "27" in an earlier note could not be re-verified); JNPT terminals have automated RFID gates. | [ITLN](https://www.itln.in/apm-terminals-pipavav-goes-live-with-nlds-container-tracking-service-supply-chain), [Maritime Gateway](https://www.maritimegateway.com/dmicdc-launches-pan-india-logistics-data-bank/) |
| Dwell in India | Export median dwell rose to just over 4 days in Q1 2024 (S&P). Historically 3–6 days vs a 24–48 h benchmark at efficient ports. NICDC reports hours (JNPA import cycle 20.3 h, Oct 2024) with different definitions. | [BusinessWorld/S&P](https://businessworld.in/article/volume-productivity-improved-at-most-indian-ports-in-q1-2024-sp-520277), [Allcargo](https://www.allcargoterminals.com/?p=3427), [JNPA/LDB](https://www.jnport.gov.in/uploads/pdf/ia_report/107/LDB_Analytics_Report-Oct24.pdf) |
| V.O. Chidambaranar Port | Two private container terminals (PSA SICAL, DBGT), about 1.17 M TEU capacity, ~734 k TEU in FY22-23, third terminal planned. **I could not verify its yard equipment or layout.** Treat "RTG-based" as an assumption (unverified). | [Wikipedia](https://en.wikipedia.org/wiki/V._O._Chidambaranar_Port), [Port Technology](https://www.porttechnology.org/news/voc-port-inks-concession-for-new-600000-teu-container-terminal-in-india/) |

## 2. How portlogi differs, and whether its data is realistic

| Aspect | portlogi | Reality | Verdict |
|---|---|---|---|
| Scale | 12 positions, 2 tiers (up to 60 and 4 in the editor) | Blocks are far larger (typical block dimensions are from my background knowledge, **unverified**); heights 3–5 | A scale model. Relative results are meaningful; absolute counts are not. |
| Vehicle | One "lift-AGV" that carries *and* stacks | Automated yards split transport (AGV) from stacking (crane); a vehicle that does both is closest to a **straddle carrier** (3 high) | A simplification. Reframing it as an automated straddle carrier would be defensible. |
| Departure times | **Exactly known at arrival** | Export boxes: vessel and cutoff known, exact order not; import pickups mostly uncertain | **Largest gap.** Our result is an optimistic upper bound. |
| Baseline | "First free slot" | Real TOS group by vessel, port, weight class, size | A straw man. Real practice is already better than our baseline. |
| Cargo mix | 15% reefer, 5% hazmat | Reefers ≈ 5% of seaborne container volume (Drewry via [Kuehne+Nagel](https://mykn.kuehne-nagel.com/news/article/global-reefer-trade-maintains-momentum-18-Jun-2025) search). Hazmat share: **unverified** | Reefer share is ~3× too high. Defensible only as a stress choice. |
| Time scale | ETDs 18–~200 sim-min, mean dwell ~108 | Real dwell is hours to days | Compressed by a large, unstated factor. Fine for ratios; label it. |
| Stacking rules | Plug, weight-on-top, hazmat "no touching neighbour" | Plugs and weight rules are real. IMDG segregation is more detailed (classes, distances) | Hazmat rule is a simplification. |
| Pads | Two "transfer pads" for set-downs | No standard term. Closest real idea is a buffer or handover area, and temporary re-marshalling slots. | Our own construct. An earlier code comment claimed terminals "solve this the same way"; I could not verify that, so don't repeat it. |
| Gate | One lane, instant admit | Multi-lane, OCR/RFID, queues outside, appointments | Fine for a demo. |
| Fleet | 1–6 vehicles | Tens to hundreds | Small; traffic findings won't transfer directly. |

## 3. What our own data says about novelty

Same 30 arrivals, 60 seeds, current engine:

| Strategy | Rehandles per run | Reduction vs first-available |
|---|---|---|
| First-available | 7.07 ± 0.48 | none |
| **ETD rule alone** (rehandle term only) | 3.12 ± 0.40 | **−56%** |
| + destination clustering | 2.68 ± 0.34 | −62% |
| Full 5-term allocator | 2.15 ± 0.36 | −70% |

The textbook idea (don't bury an earlier departure) delivers **about 80% of the total gain**. The other four
terms (travel, cluster, spread, aisle access) add roughly a further 31% over the ETD rule alone: real, but
incremental, and weight-tuning of this kind is routine in a TOS.

## 4. Prior art against each building block

| Block in portlogi | Closest prior art found | Assessment |
|---|---|---|
| Departure-time-aware stacking to cut rehandles | Dekker et al. 2006 (stacking with levels of departure information); Ku & Arthanari 2016; category stacking by expected departure time; Navis Expert Decking; INFORM Yard Optimizer | **Known.** Not novel. |
| Weighted multi-criteria slot scoring with hard rules (plug, weight, segregation) | Standard TOS slotting rules; yard planning as a constrained assignment problem | **Known.** The specific weights are unlikely to be inventive. |
| A\* with a corner penalty | Textbook | **Known.** |
| Time-window reservation of cells for multi-AGV conflict-free routing, with deadlock handling | Möhring et al. (2005) (HHLA CTA); Kim, Jeon & Ryu grid-block reservation with priority table; head-on/loop deadlock taxonomy | **Known.** Our "open-ended final-cell claim" and "cycle-aware refuge" are engineering refinements, not new concepts. |
| RFID card scan admits a container at the gate | LDB RFID at Indian ports; automated RFID gates | **Known** at industrial scale. Ours is a prototype of it. |
| Digital twin / simulation of a yard | Digital-twin yard-allocation research and products (e.g. [Revetria & Rozhok](https://marlog.aast.edu/files/marlog15/123.pdf), iPlanXpert) | **Known.** |
| Deterministic command-journal replay | General event-sourcing technique | A software design choice with no technical effect on the port. |
| Per-decision explanation (score breakdown, rejection reasons) | Explainable-AI practice | Interface feature; not a technical effect. |

Patent hits from my searches were only loosely related: [US5511923A](https://patents.google.com/patent/US5511923A/en) (terminal layout),
US 10647530 (horizontal transport conflicts in a yard), and AutoStore [US11866260B2](https://patents.google.com/patent/US11866260) (grid
storage robots, a different domain). I did not read their claims.

## 5. Patentability

**Indian law is the main obstacle.** Section 3(k) excludes mathematical methods, business methods, computer
programmes *per se* and algorithms. The [Delhi High Court in *Ferid Allani* (2019)](https://ipindia.gov.in/storage/uploads/media/2.%20Ferid%20Allani%20v.%20Union%20of%20India%2C%202019%2C%20M%20Pratibha.pdf)
limited the bar to programs *per se*, so software with a technical effect or contribution can be patentable.
The Patent Office issued revised CRI Guidelines on 29 July 2025 ([overview](https://www.aippi.org/news/decoding-cri-guidelines-2025/));
I did not read the annexure of worked examples, which is where logistics cases would be, so check it.

Applying that, honestly:

- **Not claimable:** the allocation scoring, ETD rule, A\*, and reservation scheduling, each as an algorithm.
- **Technical effect exists** (69.6% fewer rehandle moves, ~6% less distance driven, zero collisions in 400 runs),
  but it flows from an approach that is already published, so it does not rescue novelty.
- **Possible narrow candidates**, in descending order of promise, and all weak:
  1. A *system* claim tying together a gate RFID read, an allocator, and vehicle booking such that a reefer
     or heavy box stuck without a legal stack is automatically parked on a transfer pad and re-slotted when a
     legal position opens (the "legality deadlock" escape). Needs a prior-art search for buffer/re-marshalling art.
  2. The booking semantics: open-ended claim on a vehicle's final cell plus time-windowed claims on its route plus
     a deadlock breaker that tries cycle members in priority order and then vehicles waiting on the cycle. Incremental.
  3. A hardware-in-the-loop arrangement where physical RFID reads drive the simulated yard and return slot
     indication to the rig. Looks like warehouse put-to-light and pick-to-light art.
- **My honest estimate:** a patent examiner would likely find the invention obvious over published stacking
  literature combined with AGV reservation literature. Treat "patentable as filed" as **unlikely**.

## 6. What I would do

For the assignment (rubric: complete, accurate, evidence-backed; AI/plagiarism similarity under 10%):

1. **Fill the disclosure form truthfully.** State the closest prior art (§4) yourselves, describe the invention as an
   *integrated, explainable, simulation-validated system* rather than a new algorithm, claim narrowly, and mark the
   stage as prototype (TRL around 4). Completeness and honesty will score better than an overclaim, and an
   overclaim is the thing a reviewer will attack. Write the prose yourselves; I can supply data and figures.
2. **Run a real prior-art search** before any filing: Google Patents, Espacenet and the Indian Patent Office
   (InPASS), with terms such as yard crane, stacking, rehandle, expected departure time, AGV, reservation,
   deadlock. My searches suggested CPC B65G 63/04 and G06Q 10/08 as starting classes. Involve your institute's IP cell.
3. **Consider the IEEE conference route instead.** The rubric allows it, a paper is judged on contribution and
   evaluation (which you have), not on patentable novelty, and the template is already in `classDocs`.

To make the work both more realistic and more novel, in this order:

1. **Uncertain departure times.** Let the allocator see a noisy ETD (and revise it over time) while the truth differs;
   measure how fast the advantage decays. This answers the biggest realism gap and targets the literature's stated gap.
2. **Stronger baselines**: destination-grouped and ETD-greedy, so the headline is honest (§3 already shows the
   ETD-only baseline).
3. **Calibrate** dwell, reefer share and arrival mix to public figures (S&P, NICDC, Drewry) instead of round numbers.
4. **Idle-time re-marshalling** (move boxes toward better stacks when vehicles are idle). Known as pre-marshalling,
   but combined with live ETD revisions it is the nearest thing to a genuinely open question here.
5. **Real hardware data**: a latency and reliability measurement of ESP32 to yard admit, so the hardware claim has numbers.

## What I could not verify

- VOC Port's actual yard equipment, block sizes and rehandle rate.
- The dangerous-goods share of container volumes, and typical block dimensions at RTG terminals.
- Claim language of any patent. I did not read one in full.
- The 2025 CRI Guidelines annexure.
- Whether the "transfer pad" idea has a close real-world equivalent beyond general buffer areas.
