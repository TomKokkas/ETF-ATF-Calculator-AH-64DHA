# Figure 8 ETF — original geometry and approved label-gap computation

## Phase 3 — approved policy (supersedes pending-policy sections below)

The calculator now performs linear interpolation strictly inside the nine
reviewed FAT-label gaps, between each pair's original inner endpoints. This
is an application calculation choice, not an explicit SEI instruction or an
additional PDF path. All 18 stored source strokes, their PDF coordinates,
calibrated coordinates, and axis calibration remain unchanged.

`etfOnLine` checks an explicit allowlist of nine FAT/segment-ID pairs and their
original inner PDF endpoints. Exactly two source line segments must be present.
An unrecognized pair, changed endpoint reference, overlap, or out-of-coverage
input is not bridged. Actual endpoints are evaluated on the original strokes
before any gap calculation; the gap condition is strictly open.

Direct gap results have `basis: "label_gap_interpolation"`. For intermediate
FAT, the existing same-STR FAT interpolation remains unchanged; `lowerBasis`,
`upperBasis`, and `usesLabelGapInterpolation` expose any use of a label gap.
The three SEI rules and finite-input validation remain unchanged. Raw ETF is
still rounded to 0.001 by the calculator, independently from source geometry.

At FAT -5 / STR 0.925 the raw ETF is approximately 0.741668971, used as 0.742.
The published -16 / 0.98 case remains approximately 0.931083196, used as 0.931
and consistent with the published two-decimal 0.93 reading. No source point
has been adjusted to force either result.

Tests cover all nine gaps, exact endpoints and continuity on both sides,
independent inner-endpoint calculations, unapproved gaps/overlaps, no
extrapolation, FAT interpolation, SEI rules, and full calculator output.
The historical Figure 8 hash assertion in the Figure 7 suite is retained,
with only its expected implementation hash refreshed; its dependent file
snapshot in the Figure 8 suite is refreshed as well. Figure 7 functional
assertions and all Figure 4/5/7 code and data remain unchanged.

The remaining sections record the Phase 2 investigation and alternatives;
their descriptions of a pending/no-bridge policy are historical.

Development and independent verification only; not operational certification.

## Source and calibration

Primary source: `reference/SEI-671_Change3_8_8_2019 (701C AH-64D).pdf`,
printed page **0125 00-14**, Figure 8, drawing **1163380-01**, marked Change 2.
The example is in **0125 00-11, section 18.e**. General calculation rounding
is in **0125 00-5, section 18 NOTE**.

All **18 original straight strokes** are retained, two per FAT label:
**≤-5, 0, 5, 10, 15, 20, 25, 30, ≥35 degC**. No performance stroke is cubic.
Each source path has an ID, original absolute PDF endpoints and independently
calibrated [ETF, STR] endpoints. Source decimal translations are accumulated
as integer hundredths of a PDF point. No endpoints, inclinations or gaps are
changed; chart coordinates are not truncated to a fixed decimal count.

Calibration uses ordinary least-squares affine fits to **four ETF ticks
0.70–1.00** and **seven STR ticks 0.70–1.00**. The source ETF axis extends
to 1.10, but all performance strokes are inside the 0.70–1.00 region.
The maximum ETF tick residual is approximately **0.000027582**. Including
the 1.10 right-frame tick raises it to **0.000275616** because that frame
does not maintain the previous spacing exactly. Both fits are recorded for
audit, but the four-tick fit is used to retain the established calibration
region appropriate to the actual strokes. Maximum STR residual is about
**0.000014973**. None of these numbers certifies source accuracy.

Source hashes, all calibration pairs and method limitations are stored in
the JSON. Geometry, nine FAT labels and the three SEI rules are separate.

## Explicit SEI rules and numerical method

Finite STR and FAT are required before applying any rule. Figure 8 notes
explicitly prescribe FAT ≤-5 degC on the -5 line, FAT ≥35 degC on the 35 line,
and STR ≥1.0 giving ETF=1.0. Exact thresholds are inclusive. These FAT
substitutions and the ETF=1 result are separate from geometric endpoints:
the source common vertex is not artificially moved to (1,1).

Below STR 1, a single FAT reference line is evaluated only on an actual source
stroke. Between FAT labels, the established linear interpolation in FAT at
the same STR is retained, but both reference evaluations must be available.
Section 18.e does not prescribe that numerical interpolation algorithm;
it is explicitly an application choice. Actual FAT is retained between
the note thresholds, without an invented rounding step.

The main calculator still uses rounded STR (0.001), preserves raw ETF and
rounds ETF to 0.001 separately from display formatting. Figures 4/5/7 and
their arithmetic are unchanged.

## Label gaps: evidence and temporary handling

The source text places the FAT labels in the same narrow column occupied
by the interruptions. For example the -5 label is near PDF (151.62,573.90),
between endpoints (144.78,572.28) and (162.00,582.12). The other labels are
aligned around x=148–151, likewise inside their breaks. This strongly supports
annotation interruptions rather than separate performance regimes.

However, the two strokes are not exactly collinear, and neither section 18.e
nor the chart notes specifies reconstruction across the gaps. Thus exclusive
authorial intent and a unique numerical continuation cannot be certified.
No bridging method has been implemented. Final policy awaits user approval.

Approximate open STR gaps (runtime uses original full-precision endpoints):

| FAT degC | STR gap |
|---:|---:|
| -5 | 0.921654–0.927383 |
| 0 | 0.911733–0.915016 |
| 5 | 0.894091–0.898388 |
| 10 | 0.876275–0.881550 |
| 15 | 0.853638–0.859402 |
| 20 | 0.822757–0.829359 |
| 25 | 0.796941–0.803648 |
| 30 | 0.761867–0.768540 |
| 35 | 0.736855–0.743807 |

The temporary status is `unverified_label_gap`, with `etf: null`. Outside a
line's full extent the status is `unverified_coverage`; conflicting source
evaluations would be `unverified_ambiguous`. If either neighbouring FAT
reference is unavailable, interpolation returns `unverified_fat_interpolation`.
This is an explicit pending-policy response, not a permanent assertion that
the printed label interruptions invalidate the underlying performance chart.

The calculator checks status before publishing results, clears stale values
and requires verification against the approved SEI. No gap estimate is shown
as a final ETF. No geometric endpoint clamping or extrapolation is used.

## Separate proposal for approval — not implemented

Possible policies, retaining the 18 original strokes in every case:

1. Keep gaps unavailable. No numerical assumption; loses results inside
   annotation gaps and interpolations requiring such results.
2. Add a separately identified *computational* interpolation between the two
   inner endpoints, used only inside the gap. This preserves both original
   stroke equations outside the gap and continuity at both inner endpoints,
   but introduces a new slope and needs explicit approval.
3. Use a single equation based on outer endpoints, or a fitted equation.
   This is a reconstruction model, not actual PDF geometry; using it across
   the whole FAT line also changes points already covered by source strokes.
4. Extend either original stroke into the gap. The two extensions disagree
   slightly; this is extrapolation and is not implemented or recommended
   without separate justification.

At FAT -5, STR **0.925**, the options give approximately:

| Hypothetical method | ETF |
|---|---:|
| Outer-endpoint equation with new calibration | 0.741709848 |
| Inner-endpoint gap interpolation | 0.741668971 |
| Extension of lower-STR stroke | 0.741602925 |
| Extension of upper-STR stroke | 0.741694422 |

All four round to 0.742 in this example; current implementation returns no
ETF inside the gap. Their spread at the centres of the nine gaps is between
approximately 0.0000116 and 0.0001027. At some arbitrary STR values rounding
can differ: at -5/0.921744950, outer and inner equations give about 0.730502
and 0.730426, i.e. 0.731 versus 0.730. This particular STR is not on the
calculator's 0.001 input grid. A scan of the nine labelled FAT lines at
0.001 STR increments found no outer/inner rounding differences; it does not
prove equivalence for interpolated FAT or establish source accuracy.

If bridging is approved later, option 2 is the smallest local numerical
change because it leaves every covered original stroke unchanged. It must
remain labelled as an application reconstruction, never a new PDF path.

## Example, results and tests

For the published FAT -16/STR 0.98 example, the -5 line's actual upper stroke
gives ETF **0.931083196458**, versus the former **0.931091174647**. Both give
the published two-decimal **0.93**, and **0.931** at calculation precision.
The complete calculator's current example uses STR 0.977, so its ETF remains
**0.921**; do not replace that STR with 0.98 merely to match the graphic example.

```powershell
node scripts/calibrate-figure8.cjs
node --test tests/figure8.test.cjs
```

The calibration command verifies without writes; only explicit `--write`
regenerates Figure 8 JSON. Tests cover independent PDF-coordinate evaluation,
all strokes, all gaps, real endpoints, rules, non-finite inputs, FAT
interpolation, display/calculation separation, example and final-result
blocking. Hashes preserve the uncommitted Figure 7 code/data/docs/script/tests.

One historical assertion in `tests/figure7.test.cjs` requires the entire old
Figure 8 implementation to remain byte-identical. It is incompatible with
the newly approved Figure 8 work, rather than a Figure 7 behavioural failure.
The file remains unchanged pending explicit permission to retire only that
obsolete assertion. All other prior checks remain active; the new suite
independently checks that the Figure 4/5/7 code prefix and Figure 7 artifacts
are unchanged.
