# v4 results against the full DB (2026-09-17)

## Golden set vs FULL DB (75 queries, candidates 500∪500) — desktop baseline: R@15 50.2 % / P@5 13.6 % / MRR 0.335

| method | R@15 | P@5 | MRR | R@1 |
|---|---|---|---|---|
| v4 full (cls45 crop35 lab20) | 58.2% | 16.0% | 0.448 | 30.7% |
| cls only | 40.8% | 9.1% | 0.314 | 22.7% |
| crop mean only | 36.0% | 9.6% | 0.338 | 26.7% |
| cls50 crop50 | 45.0% | 10.9% | 0.330 | 22.7% |
| cls45 crop35 lab10 rgb10 | 60.4% | 14.9% | 0.420 | 29.3% |
| colour 30 (cls40 crop30 lab30) | 64.1% | 18.4% | 0.510 | 36.0% |
| colour 40 (cls35 crop25 lab40) | 64.1% | 19.5% | 0.557 | 44.0% |
| v4 + gate lab<0.35 → -0.3 | 64.2% | 17.3% | 0.490 | 34.7% |
| v4 + gate lab<0.50 → -0.3 | 55.7% | 18.1% | 0.500 | 37.3% |
| colour 30 + gate lab<0.35 → -0.3 | 63.2% | 19.2% | 0.536 | 40.0% |
| colour 40 + pattern hint | 56.0% | 16.8% | 0.506 | 41.3% |
| colour 40 + pattern hint + gate lab<0.35 | 56.7% | 17.9% | 0.519 | 42.7% |

## Synthetic phone photos vs FULL DB (300 queries)

| method | R@1 exact | R@15 exact | R@15 design | MRR | n |
|---|---|---|---|---|---|
| v4 full (cls45 crop35 lab20) | 62.3% | 87.7% | 91.7% | 0.712 | 300 |
| v4 full (cls45 crop35 lab20) [medium] | 63.5% | 89.8% | 94.9% | 0.724 | 137 |
| cls only | 46.3% | 78.7% | 86.7% | 0.570 | 300 |
| cls only [medium] | 43.1% | 82.5% | 89.1% | 0.564 | 137 |
| crop mean only | 64.0% | 90.0% | 94.0% | 0.738 | 300 |
| crop mean only [medium] | 64.2% | 93.4% | 94.9% | 0.749 | 137 |
| cls50 crop50 | 60.3% | 90.0% | 93.7% | 0.706 | 300 |
| cls50 crop50 [medium] | 59.9% | 92.0% | 96.4% | 0.712 | 137 |
| cls45 crop35 lab10 rgb10 | 64.7% | 89.7% | 92.0% | 0.736 | 300 |
| cls45 crop35 lab10 rgb10 [medium] | 67.2% | 91.2% | 94.2% | 0.755 | 137 |
| colour 30 (cls40 crop30 lab30) | 58.7% | 84.7% | 91.0% | 0.680 | 300 |
| colour 30 (cls40 crop30 lab30) [medium] | 62.8% | 83.9% | 94.2% | 0.708 | 137 |
| colour 40 (cls35 crop25 lab40) | 55.0% | 82.0% | 88.7% | 0.637 | 300 |
| colour 40 (cls35 crop25 lab40) [medium] | 58.4% | 81.0% | 90.5% | 0.665 | 137 |
| v4 + gate lab<0.35 → -0.3 | 60.0% | 81.0% | 89.3% | 0.680 | 300 |
| v4 + gate lab<0.35 → -0.3 [medium] | 62.0% | 83.2% | 92.0% | 0.700 | 137 |
| v4 + gate lab<0.50 → -0.3 | 57.3% | 77.0% | 87.7% | 0.645 | 300 |
| v4 + gate lab<0.50 → -0.3 [medium] | 60.6% | 76.6% | 89.1% | 0.672 | 137 |
| colour 30 + gate lab<0.35 → -0.3 | 57.7% | 80.3% | 89.3% | 0.661 | 300 |
| colour 30 + gate lab<0.35 → -0.3 [medium] | 61.3% | 81.0% | 92.0% | 0.691 | 137 |
| colour 40 + pattern hint | 60.0% | 84.0% | 91.0% | 0.677 | 300 |
| colour 40 + pattern hint [medium] | 62.8% | 82.5% | 92.7% | 0.697 | 137 |
| colour 40 + pattern hint + gate lab<0.35 | 59.7% | 80.0% | 90.0% | 0.667 | 300 |
| colour 40 + pattern hint + gate lab<0.35 [medium] | 62.0% | 80.3% | 92.0% | 0.687 | 137 |
| v4 full (cls45 crop35 lab20) [mild] | 73.8% | 97.5% | 98.8% | 0.833 | 80 |
| cls only [mild] | 67.5% | 90.0% | 95.0% | 0.739 | 80 |
| crop mean only [mild] | 82.5% | 97.5% | 98.8% | 0.881 | 80 |
| cls50 crop50 [mild] | 76.3% | 95.0% | 97.5% | 0.830 | 80 |
| cls45 crop35 lab10 rgb10 [mild] | 76.3% | 95.0% | 96.3% | 0.844 | 80 |
| colour 30 (cls40 crop30 lab30) [mild] | 70.0% | 97.5% | 98.8% | 0.804 | 80 |
| colour 40 (cls35 crop25 lab40) [mild] | 70.0% | 95.0% | 97.5% | 0.785 | 80 |
| v4 + gate lab<0.35 → -0.3 [mild] | 71.3% | 92.5% | 98.8% | 0.802 | 80 |
| v4 + gate lab<0.50 → -0.3 [mild] | 70.0% | 92.5% | 98.8% | 0.790 | 80 |
| colour 30 + gate lab<0.35 → -0.3 [mild] | 68.8% | 92.5% | 98.8% | 0.783 | 80 |
| colour 40 + pattern hint [mild] | 75.0% | 97.5% | 98.8% | 0.823 | 80 |
| colour 40 + pattern hint + gate lab<0.35 [mild] | 75.0% | 92.5% | 98.8% | 0.811 | 80 |
| v4 full (cls45 crop35 lab20) [hard] | 49.4% | 74.7% | 79.5% | 0.576 | 83 |
| cls only [hard] | 31.3% | 61.4% | 74.7% | 0.416 | 83 |
| crop mean only [hard] | 45.8% | 77.1% | 88.0% | 0.581 | 83 |
| cls50 crop50 [hard] | 45.8% | 81.9% | 85.5% | 0.577 | 83 |
| cls45 crop35 lab10 rgb10 [hard] | 49.4% | 81.9% | 84.3% | 0.599 | 83 |
| colour 30 (cls40 crop30 lab30) [hard] | 41.0% | 73.5% | 78.3% | 0.513 | 83 |
| colour 40 (cls35 crop25 lab40) [hard] | 34.9% | 71.1% | 77.1% | 0.450 | 83 |
| v4 + gate lab<0.35 → -0.3 [hard] | 45.8% | 66.3% | 75.9% | 0.528 | 83 |
| v4 + gate lab<0.50 → -0.3 [hard] | 39.8% | 62.7% | 74.7% | 0.459 | 83 |
| colour 30 + gate lab<0.35 → -0.3 [hard] | 41.0% | 67.5% | 75.9% | 0.495 | 83 |
| colour 40 + pattern hint [hard] | 41.0% | 73.5% | 80.7% | 0.504 | 83 |
| colour 40 + pattern hint + gate lab<0.35 [hard] | 41.0% | 67.5% | 78.3% | 0.496 | 83 |
