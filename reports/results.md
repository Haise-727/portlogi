# portlogi: experimental results

Generated 2026-10-14T18:36:24.504Z by `npm run report`.

## 1. Allocator versus first-available placement

100 independent seeds, 30 arrivals each, identical containers within every pair. Mean ± 95% confidence interval.

| Measure | First-available | Allocator |
|---|---|---|
| Rehandles per run | 6.7 ± 0.4 | 2.0 ± 0.3 |
| Grid cells driven | 917 ± 10 | 864 ± 9 |
| Time to clear the yard (min) | 355 ± 7 | 345 ± 6 |
| Average dwell (min) | 112 ± 2 | 108 ± 2 |

Rehandle reduction: **69.6%**. The allocator was better in 96 of 100 runs, tied in 2, worse in 2. Safety violations across all 200 runs: **0**.

## 2. Ablation: contribution of each scoring term

One term's weight set to zero at a time, 40 seeds each.

| Configuration | Rehandles | Cells driven | Time to clear (min) |
|---|---|---|---|
| All terms | 2.0 ± 0.4 | 861 ± 14 | 342 ± 9 |
| ETD rule only (rehandle term alone) | 2.9 ± 0.5 | 910 ± 13 | 355 ± 11 |
| No rehandle risk | 7.1 ± 0.6 | 872 ± 13 | 346 ± 10 |
| No travel | 1.9 ± 0.5 | 866 ± 14 | 343 ± 9 |
| No cluster | 2.2 ± 0.4 | 852 ± 13 | 342 ± 10 |
| No spread | 2.1 ± 0.4 | 867 ± 17 | 344 ± 9 |
| No aisle access | 2.4 ± 0.4 | 885 ± 13 | 348 ± 11 |
| First-available (baseline) | 7.0 ± 0.5 | 915 ± 16 | 353 ± 11 |

## 3. Scaling to larger yards

12 seeds per layout; arrivals scale with yard size. Wall-clock is the cost of simulating the whole run headless.

| Layout (positions) | Vehicles | Rehandles: allocator | Rehandles: first-available | Time to clear (min) | Traffic holds | Wall-clock per run |
|---|---|---|---|---|---|---|
| 3×4 (12) | 2 | 0.9 ± 0.4 | 5.3 ± 1.2 | 307 ± 17 | 20 ± 7 | 0.0 s |
| 4×6 (24) | 4 | 2.8 ± 0.9 | 22.8 ± 2.2 | 386 ± 20 | 71 ± 11 | 0.1 s |
| 5×8 (40) | 5 | 5.7 ± 1.7 | 36.7 ± 3.4 | 506 ± 15 | 221 ± 41 | 0.5 s |
| 6×10 (60) | 6 | 7.1 ± 1.6 | 56.7 ± 3.1 | 625 ± 14 | 326 ± 31 | 1.6 s |

## 4. Fleet size on the default 4×3 yard

20 seeds per size.

| Vehicles | Time to clear (min) | Average gate wait (min) | Traffic holds | Utilisation |
|---|---|---|---|---|
| 1 | 371 ± 11 | 12.0 ± 0.7 | 0 ± 0 | 0.62 ± 0.02 |
| 2 | 337 ± 10 | 5.2 ± 0.9 | 42 ± 7 | 0.39 ± 0.01 |
| 3 | 334 ± 10 | 3.7 ± 0.7 | 72 ± 14 | 0.27 ± 0.01 |

## 5. Safety and robustness

200 random yards (1–6 rows, 2–10 columns, 1–4 tiers, 1–3 gates and quays, 1–6 vehicles, a closed slot in 40% of them) were each driven for 1000 simulated minutes with a vessel surge, a vehicle breakdown and a reefer storm injected. Invariants were checked every 9 ticks.

| Property | Result |
|---|---|
| Layouts simulated | 200 |
| Safety violations (collision, illegal stack, lost or duplicated box) | **0** |
| Layouts that stalled (no departure for 600 min) | 0 (0.0%) |
| Clean runs | 200 (100.0%) |

No layout stalled.

## 6. Determinism

Ten seeds were each simulated twice for 600 sim-minutes and compared state-for-state: **identical**. This is what makes replay and the experiments reproducible.
