# What is knowing the pickup time worth?

Model result, 32 seeds, 20 import boxes each, default 6-stack yard, optimised allocator. True pickup times are drawn uniformly 1 to 5 hours after arrival (a stand-in; real distributions were not found in a source). Values are mean ± 95% CI.

| Information available | Rehandles | Truck wait (min) | Worst wait (min) |
|---|---|---|---|
| Guess only | 4.1 ± 0.5 | 9.8 ± 3.1 | 84 ± 38 |
| Estimate, about 60 min off | 3.1 ± 0.4 | 8.5 ± 2.3 | 81 ± 38 |
| Estimate, about 15 min off | 1.7 ± 0.4 | 7.2 ± 1.9 | 65 ± 34 |
| Booked 20 min ahead | 4.0 ± 0.5 | 0.0 ± 0.0 | 1 ± 1 |
| Booked 1 hour ahead | 4.0 ± 0.5 | 0.0 ± 0.0 | 1 ± 1 |
| Booked 2 hours ahead | 3.8 ± 0.4 | 0.1 ± 0.1 | 2 ± 3 |
| Booked at arrival | 1.3 ± 0.4 | 0.0 ± 0.0 | 0 ± 0 |

## Reading it
- A booking only helps rehandles if it is known **when the box is placed**. A booking made 20 minutes to 2 hours before pickup arrives after the box is already stacked, so it cannot change where it went.
- Even a late booking removes the truck wait: the yard sees the time, digs the box out and stages it at the gate before the truck arrives.
- A decent forecast (15 min error) recovers most of the rehandle saving without any firm booking.
- So the policy lever for a port authority is booking **at discharge**, not at pickup.

## Policies
- Guess only: assumed to leave 3 hours after arrival; the truck arrives unannounced
- Estimate, about 60 min off: a forecast with a typical error of an hour; the truck arrives unannounced
- Estimate, about 15 min off: a good forecast, such as an appointment slot; the truck arrives unannounced
- Booked 20 min ahead: the exact time is known 20 minutes before the truck is due
- Booked 1 hour ahead: the exact time is known an hour before
- Booked 2 hours ahead: the exact time is known two hours before
- Booked at arrival: the exact time is known when the box lands, before it is placed
