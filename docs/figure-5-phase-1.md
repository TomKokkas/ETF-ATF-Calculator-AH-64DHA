# Figure 5 — Delta Torque / Delta TGT Factor, Phase 1

Development and verification only: these results are not operationally certified.

## Source and preserved geometry

Primary source: `reference/SEI-671_Change3_8_8_2019 (701C AH-64D).pdf`,
printed page **0125 00-10**, Figure 5, drawing **1156935-00**. The printed
page is marked **Change 2**, separately from the PDF filename's Change 3.
The JSON records the source file SHA-256 and all original absolute PDF control
points. Seven cubic segments are preserved, without new curves, smoothing,
extension, endpoint relocation or truncation to a fixed decimal count.

The PDF path starts at (114.54, 707.10) and ends at (412.80, 550.44) PDF
points. Source decimal coordinates are accumulated as integer hundredths of
a PDF point before conversion to chart coordinates.

## Axis calibration and coverage

Independent ordinary least-squares affine fits use all 11 major PA grid lines
(0 to 10000 ft in 1000 ft intervals) and all 9 factor grid lines (0 to 0.4
in 0.05 intervals). These intervals are calibration references, not imposed
user-input steps. Coefficients, calibration pairs and maximum residuals are
stored in `digitization.calibration`.

Maximum residuals are approximately 0.912192 ft and 0.0000893449 factor.
They are fit residuals, not certified accuracy of the source chart. Stored
decimal places and solver tolerance likewise do not represent source accuracy.

The nominal PA range remains **0–10000 ft**. Actual calibrated path coverage
is approximately **28.186894608–10004.104714068 ft**, separately recorded as
`curve_coverage_pa_ft` and also derived from geometry by the evaluator.

- Nominally valid PA below the actual path start returns
  `status: "unverified_coverage"`, `factor: null`, `matchedPA: null`.
- Within both nominal and actual coverage, the source curve is evaluated.
- PA outside the nominal range is rejected, even when the short original
  path beyond 10000 ft exists. Non-finite inputs are rejected explicitly.
- No closest endpoint is substituted and no extrapolation is performed.

Blocking unsupported coverage is a conservative calculator policy, not a
new SEI operating requirement. The PDF axis beginning at zero is not evidence
that its first control point should be moved there.

## Numerical evaluation and calculation pipeline

The evaluator selects the containing monotonic PA segment and solves
`PA(t) = actual input PA` by bisection. A PA bracket of at most 1e-8 ft is
required within 64 iterations. Endpoints are evaluated directly; factor and
matched PA use the same parameter. No input PA rounding is introduced.

The previous 10001-sample search per segment produced plateaus and small
jumps. Its maximum nearest-sample factor error against the old continuous
JSON curve was approximately 0.000004749656 near PA 212.109281 ft. The new
solver agrees with an independent de Casteljau evaluation of the PDF path
and does not reproduce that sampling discontinuity.

SEI page **0125 00-5, section 18 NOTE** specifies rounding calculations to
0.001. The calculator retains `deltaFactorRaw`, uses `round3` for the factor
in arithmetic, and formats the display independently with `toFixed(3)`.
It rejects unverified Figure 5 coverage before factor rounding or subsequent
delta/TRQADJ calculations; the error handler clears stale displayed results
and requests verification against the approved SEI.

The existing Figure 4 raw/used/display handling and delta TGT calculations
are unchanged. No displayed factor, TGTREF or delta TGT is fed back into
subsequent calculations.

## Published example and remaining limitations

Page **0125 00-6, section 18.b.(3)** gives the 6000 ft Figure 5 lookup.
Page **0125 00-11, section 18.b.(4)** uses factor **0.17** in
`99 + 0.17 × (-8) = 97.640%`.

At 6000 ft the new raw factor is approximately **0.170137679442**, versus
the previous **0.170141074595**. The calculation/display value remains
**0.170** and agrees with the published factor example. The full current
calculator retains Figure 4 TGTREF 728.198 degC and delta TGT -7.802 degC,
so TRQADJ remains **97.674%**. Its difference from the published 97.640%
comes from delta TGT, not a different rounded Figure 5 factor. Geometry has
not been modified to force agreement with integer example values.

Original sub-28.187-ft coverage is not verified from the available path.
Physical source accuracy, small line-placement effects and residual
calibration uncertainty remain unverified. The Figure 4 mixed-limit policy
and other charts are outside this change.

## Reproduction and tests

```powershell
node scripts/calibrate-figure5.cjs
node --test tests/figure4.test.cjs tests/figure5.test.cjs
```

The calibration command verifies without writing. An explicit `--write`
regenerates only the Figure 5 JSON. The extractor checks this PDF's expected
source path and grid coordinates; a revised source requires review.

Tests cover source endpoints, all joins, requested PA values, independent
de Casteljau PDF evaluation, nominal versus actual coverage, monotonic small
input steps, blocking of downstream results, 0.001 arithmetic, display-only
formatting, the official example, and preservation of Figure 4 and AGENTS.md.
The old Figure 4-suite assertion that Figure 5 must match the pre-change
version was retired because this phase intentionally replaces Figure 5;
Figure 4's behaviour and integration tests remain active.
