# Figure 4 TGTREF — Phase 1 technical notes

## Primary source and calibration

Source: `reference/SEI-671_Change3_8_8_2019 (701C AH-64D).pdf`,
printed page **0125 00-9**, Figure 4, drawing **1156932-01**. The page
itself is marked **Change 2**. This marking is distinct from the PDF filename.

`scripts/calibrate-figure4.cjs` reads the PDF's compressed vector graphics,
preserving all 11 source paths and 25 cubic Bezier segments. Source translations
are accumulated in exact integer hundredths of a PDF point, then converted to
chart coordinates. No curve fitting, sampling, decimal-place truncation or
geometry simplification is applied to the Bezier paths.

Each axis is calibrated independently with an ordinary least-squares affine
fit to the centres of all major grid lines: 19 TGTREF marks (510 to 870 degC,
20 degC spacing) and 13 FAT marks (-60 to +60 degC, 10 degC spacing). The
second FAT mark is the source translation 358.62 + 28.98 = 387.60 PDF points.
The JSON records all calibration pairs, coefficients, residuals, absolute PDF
control points and the source PDF SHA-256. Major grid spacing is not a
prescription for rounding user inputs.

Maximum calibration residuals are approximately 0.029888 degC TGTREF and
0.011824 degC FAT. These quantify the affine fit to drawn grid lines, not the
physical accuracy of the chart. Stored decimals and solver tolerances are
likewise not claims of source accuracy.

Verify reproducibility without writing files:

```powershell
node scripts/calibrate-figure4.cjs
node --test tests/figure4.test.cjs
```

Only `node scripts/calibrate-figure4.cjs --write` regenerates the Figure 4 JSON.
The extraction deliberately checks this PDF's expected coordinates and path
counts; a different source revision requires review rather than silent reuse.

## Evaluation and calculation rounding

The Figure 4 solver selects a containing monotonic FAT segment and bisects
`FAT(t) = requested FAT`, evaluating TGTREF at the same parameter. The
TGTREF bracket must narrow to at most 1e-9 degC within 64 iterations. No
nearest sampled point is substituted. An exact stored PA selects only that
curve; other PAs retain linear interpolation between adjacent curves, using
the actual input (3038 ft has interpolation weight 0.038).

SEI printed page **0125 00-5**, section **18 NOTE**, specifies calculations
rounded to the nearest 0.001. Page **0125 00-6**, section **18.b.(2)**,
defines delta TGT as target TGTREF minus measured TGT. The calculator retains
`tgtRefRaw`, uses `tgtRefUsed = round3(tgtRefRaw)`, and formats
`tgtRefDisplay` separately. Delta TGT is `round3(tgtRefUsed - measuredTgt)`;
downstream calculations retain their existing 0.001 rounding. Neither PA nor
FAT is assigned an invented input increment by this change. Figure 5's
Bezier evaluation and dataset are unchanged.

For the page **0125 00-6**, section **18.b.(1)-(2)** example (6000 ft,
FAT -16 degC, measured TGT 736 degC), raw TGTREF is approximately
728.198304725 degC, used/displayed TGTREF is 728.198 degC and delta TGT is
-7.802 degC. The publication uses 728 degC and -8 degC. This discrepancy is
retained for verification, not eliminated by changing chart geometry or
forcing integer arithmetic. The example's Figure 3 reference differs from
the Figure 4 caption on the available source chart.

## FAT boundaries and remaining verification

The original paths end around FAT -55 degC on the cold side. SL/1000 ft end
around +55 degC without reaching the limit; higher curves terminate near
the 866 degC limit. Source endpoints are preserved without snapping.

Out-of-segment FAT no longer silently substitutes a nearest endpoint;
unsupported evaluations raise a descriptive error. This is application
behaviour, not an invented SEI operating procedure.

Page **0125 00-6**, section **18.b.(1) NOTE**, provides the 866 degC
no-intersection rule. Curves labelled 2 through 10 terminate on the Figure 4
DE TGT LIMIT TEMP line; SL and 1 do not. This source classification is recorded
explicitly per curve as `hot_end_on_tgt_limit`. The previous 1 degC proximity
tolerance has been removed, without introducing a replacement tolerance.
At/above a confirmed limit endpoint's FAT, within the chart-axis bounds, the
result is 866 degC. Below that endpoint, the source geometry is evaluated;
points are not moved to force an intersection. Tiny transitions at digitized
endpoints remain a limitation of interpreting drawn lines.

As explicitly required for Phase 1, interpolation between one limited and one
unlimited neighbouring curve was retained. For example, at FAT +44 degC, the
3000 ft curve is below the limit and the 4000 ft curve is limited; 3038 ft
retains the 0.038 interpolation weight between those results. This behaviour
is regression-tested but **remains pending verification against the SEI**;
the manual does not prescribe that numerical boundary interpolation method.
Phase 2 below now restricts that estimate to diagnostics.

The general input-rounding rules in AGENTS.md do not establish a verified
Figure 4 input increment. The explicit Phase 1 instruction takes precedence:
actual PA is retained; no arbitrary PA or FAT step is introduced. AGENTS.md
has not been modified.

## Phase 2 — unverified mixed-limit regions

`evaluateFigure4Curve` dynamically distinguishes three evaluation states:

- `unlimited`: the evaluated curve point is below numeric TGTREF 866 degC.
- `mathematical_intersection`: the evaluated geometry reaches/exceeds numeric
  866 degC, or a later source-terminated evaluation follows such an intersection.
- `source_termination`: the source-classified hot endpoint activates 866 degC
  without a mathematical intersection with numeric 866 in the stored path.

No fixed FAT thresholds or proximity tolerances are used. The drawn limit line
at PDF x=528.36 maps to approximately 865.800864 degC under the grid calibration;
it must not be confused with the numeric 866 intersection. The existing source
termination policy and calibration are unchanged.

For genuinely intermediate PA, exactly one limited neighbour causes
`status: "unverified_mixed_limit"`, `tgtref: null`, and a separately named
`diagnosticTgtRef`. The diagnostic retains the former linear interpolation
using the actual PA. `lowerLimitState` and `upperLimitState` identify its basis.
Exact stored PA, two unlimited neighbours, and two limited neighbours retain
their numeric behaviour with `status: "available"`; that status describes
availability under the existing implementation, not independent certification.

The calculator checks this status before rounding TGTREF or invoking Figure 5
and later calculations. For a mixed-limit result it logs the diagnostic to the
developer console, clears all displayed results (including stale results), and
shows an explicit message requiring verification against the approved SEI.
No diagnostic number is displayed as a final performance result.

This exclusion is a **conservative application policy**, explicitly requested
for Phase 2. SEI page 0125 00-6, section 18.b.(1) NOTE supplies the 866 degC rule,
but does not prescribe this software exclusion or a numerical algorithm for
mixed-limit interpolation. Neither inferred intermediate limit curves nor
extensions of existing paths have been introduced. Exact-curve endpoint jumps
and a validated mixed-limit interpolation method remain separate verification
issues. Figure 5, other chart data, and AGENTS.md are unchanged.

Tests cover all nine adjacent mixed-limit pairs, actual PA 3038/3500/6500/9500
ft, source versus mathematical limit activation, exact PA, ordinary regions,
both-limited regions, and prevention of downstream calculations and stale
final results. The source calibration reproducibility test also remains active.
