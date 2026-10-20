# Results transparency

Historical record: the UI policy below is superseded by
`human-chart-reading.md`. There is now one main value per result; secondary
Calculated/provenance indicators have been removed. Provenance stays in debug.

TGTREF and delta TGT retain their existing integer presentation. Secondary
`Calculated:` details show the actual values used in arithmetic, to three
decimal places. These details format `tgtRefUsed` and `deltaTgt`; they do not
evaluate a chart again or change calculation policy A.

ETF provenance is formatted from the same `figure8Result` already used by
the calculation. `source_stroke` is described as a digitized line segment.
`label_gap_interpolation` is explicitly described as an application method,
not a source line. FAT interpolation identifies both neighbouring FAT
values and the origin of each evaluation. The STR >= 1 rule has its own
description rather than claiming a source stroke.

Debug includes status, basis, lowerBasis, upperBasis,
usesLabelGapInterpolation, and the same explanation shown in the interface.
All secondary indicators are emptied whenever validation or calculation
fails. Existing primary results continue to clear to `---`.

The new regression suite verifies single chart evaluation per calculation,
unchanged numeric results, both origins, FAT interpolation, the STR rule,
presentation independence and clearing after failures. Existing integrity
assertions remain active; only the calculator-prefix snapshot affected by
the new clearing statements and its dependent test-file hash are refreshed.
No datasets, interpolation, round3, equations, or source geometry changed.
