# v4 results against the full DB (2026-09-16)

## Golden set vs FULL DB (75 queries, candidates 500∪500) — desktop baseline: R@15 50.2 % / P@5 13.6 % / MRR 0.335

| method | R@15 | P@5 | MRR | R@1 |
|---|---|---|---|---|
| v4 full (cls45 crop35 lab20) | 52.4% | 14.1% | 0.432 | 30.7% |
| cls only | 40.8% | 9.1% | 0.314 | 22.7% |
| crop mean only | 36.0% | 9.6% | 0.338 | 26.7% |
| cls50 crop50 | 45.0% | 10.9% | 0.330 | 22.7% |
| cls45 crop35 lab10 rgb10 | 56.1% | 15.2% | 0.382 | 24.0% |

## Synthetic phone photos vs FULL DB (300 queries)

| method | R@1 exact | R@15 exact | R@15 design | MRR | n |
|---|---|---|---|---|---|
| v4 full (cls45 crop35 lab20) | 60.3% | 88.0% | 91.7% | 0.699 | 300 |
| v4 full (cls45 crop35 lab20) [medium] | 61.3% | 89.8% | 93.4% | 0.713 | 137 |
| cls only | 46.3% | 78.7% | 86.7% | 0.570 | 300 |
| cls only [medium] | 43.1% | 82.5% | 89.1% | 0.564 | 137 |
| crop mean only | 64.0% | 90.0% | 94.0% | 0.738 | 300 |
| crop mean only [medium] | 64.2% | 93.4% | 94.9% | 0.749 | 137 |
| cls50 crop50 | 60.3% | 90.0% | 93.7% | 0.706 | 300 |
| cls50 crop50 [medium] | 59.9% | 92.0% | 96.4% | 0.712 | 137 |
| cls45 crop35 lab10 rgb10 | 62.0% | 89.3% | 92.3% | 0.722 | 300 |
| cls45 crop35 lab10 rgb10 [medium] | 65.0% | 89.8% | 94.2% | 0.747 | 137 |
| v4 full (cls45 crop35 lab20) [mild] | 75.0% | 95.0% | 97.5% | 0.836 | 80 |
| cls only [mild] | 67.5% | 90.0% | 95.0% | 0.739 | 80 |
| crop mean only [mild] | 82.5% | 97.5% | 98.8% | 0.881 | 80 |
| cls50 crop50 [mild] | 76.3% | 95.0% | 97.5% | 0.830 | 80 |
| cls45 crop35 lab10 rgb10 [mild] | 76.3% | 95.0% | 96.3% | 0.843 | 80 |
| v4 full (cls45 crop35 lab20) [hard] | 44.6% | 78.3% | 83.1% | 0.545 | 83 |
| cls only [hard] | 31.3% | 61.4% | 74.7% | 0.416 | 83 |
| crop mean only [hard] | 45.8% | 77.1% | 88.0% | 0.581 | 83 |
| cls50 crop50 [hard] | 45.8% | 81.9% | 85.5% | 0.577 | 83 |
| cls45 crop35 lab10 rgb10 [hard] | 43.4% | 83.1% | 85.5% | 0.564 | 83 |
