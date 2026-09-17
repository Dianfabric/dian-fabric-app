# v4 results against the full DB (2026-09-17)

## Golden set vs FULL DB (75 queries, candidates 500∪500) — desktop baseline: R@15 50.2 % / P@5 13.6 % / MRR 0.335

| method | R@15 | P@5 | MRR | R@1 |
|---|---|---|---|---|
| v4 full (cls45 crop35 lab20) | 52.4% | 14.1% | 0.432 | 30.7% |
| cls only | 40.8% | 9.1% | 0.314 | 22.7% |
| crop mean only | 36.0% | 9.6% | 0.338 | 26.7% |
| cls50 crop50 | 45.0% | 10.9% | 0.330 | 22.7% |
| cls45 crop35 lab10 rgb10 | 56.1% | 15.2% | 0.382 | 24.0% |
| colour 30 (cls40 crop30 lab30) | 55.5% | 14.7% | 0.464 | 36.0% |
| colour 40 (cls35 crop25 lab40) | 57.1% | 17.1% | 0.513 | 40.0% |
| v4 + gate lab<0.35 → -0.3 | 57.1% | 15.2% | 0.452 | 32.0% |
| v4 + gate lab<0.50 → -0.3 | 50.7% | 15.5% | 0.486 | 37.3% |
| colour 30 + gate lab<0.35 → -0.3 | 55.3% | 15.7% | 0.473 | 36.0% |

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
| colour 30 (cls40 crop30 lab30) | 57.0% | 83.7% | 89.3% | 0.664 | 300 |
| colour 30 (cls40 crop30 lab30) [medium] | 58.4% | 84.7% | 90.5% | 0.687 | 137 |
| colour 40 (cls35 crop25 lab40) | 55.0% | 80.3% | 87.0% | 0.630 | 300 |
| colour 40 (cls35 crop25 lab40) [medium] | 54.7% | 80.3% | 86.9% | 0.638 | 137 |
| v4 + gate lab<0.35 → -0.3 | 58.7% | 80.7% | 89.0% | 0.670 | 300 |
| v4 + gate lab<0.35 → -0.3 [medium] | 59.9% | 82.5% | 89.8% | 0.689 | 137 |
| v4 + gate lab<0.50 → -0.3 | 58.0% | 77.3% | 87.7% | 0.657 | 300 |
| v4 + gate lab<0.50 → -0.3 [medium] | 59.9% | 81.0% | 89.8% | 0.686 | 137 |
| colour 30 + gate lab<0.35 → -0.3 | 56.0% | 79.7% | 88.7% | 0.647 | 300 |
| colour 30 + gate lab<0.35 → -0.3 [medium] | 57.7% | 81.8% | 89.8% | 0.675 | 137 |
| v4 full (cls45 crop35 lab20) [mild] | 75.0% | 95.0% | 97.5% | 0.836 | 80 |
| cls only [mild] | 67.5% | 90.0% | 95.0% | 0.739 | 80 |
| crop mean only [mild] | 82.5% | 97.5% | 98.8% | 0.881 | 80 |
| cls50 crop50 [mild] | 76.3% | 95.0% | 97.5% | 0.830 | 80 |
| cls45 crop35 lab10 rgb10 [mild] | 76.3% | 95.0% | 96.3% | 0.843 | 80 |
| colour 30 (cls40 crop30 lab30) [mild] | 72.5% | 93.8% | 97.5% | 0.811 | 80 |
| colour 40 (cls35 crop25 lab40) [mild] | 71.3% | 93.8% | 98.8% | 0.793 | 80 |
| v4 + gate lab<0.35 → -0.3 [mild] | 72.5% | 88.8% | 96.3% | 0.797 | 80 |
| v4 + gate lab<0.50 → -0.3 [mild] | 72.5% | 87.5% | 95.0% | 0.792 | 80 |
| colour 30 + gate lab<0.35 → -0.3 [mild] | 70.0% | 88.8% | 96.3% | 0.779 | 80 |
| v4 full (cls45 crop35 lab20) [hard] | 44.6% | 78.3% | 83.1% | 0.545 | 83 |
| cls only [hard] | 31.3% | 61.4% | 74.7% | 0.416 | 83 |
| crop mean only [hard] | 45.8% | 77.1% | 88.0% | 0.581 | 83 |
| cls50 crop50 [hard] | 45.8% | 81.9% | 85.5% | 0.577 | 83 |
| cls45 crop35 lab10 rgb10 [hard] | 43.4% | 83.1% | 85.5% | 0.564 | 83 |
| colour 30 (cls40 crop30 lab30) [hard] | 39.8% | 72.3% | 79.5% | 0.486 | 83 |
| colour 40 (cls35 crop25 lab40) [hard] | 39.8% | 67.5% | 75.9% | 0.461 | 83 |
| v4 + gate lab<0.35 → -0.3 [hard] | 43.4% | 69.9% | 80.7% | 0.514 | 83 |
| v4 + gate lab<0.50 → -0.3 [hard] | 41.0% | 61.4% | 77.1% | 0.479 | 83 |
| colour 30 + gate lab<0.35 → -0.3 [hard] | 39.8% | 67.5% | 79.5% | 0.474 | 83 |
