# Figure 7 — source geometry, shared limit and verified coverage

Development/verification only; the numerical outputs are not operationally
certified performance results.

## Source and interpretation of SL-1

Primary source: `reference/SEI-671_Change3_8_8_2019 (701C AH-64D).pdf`,
printed page **0125 00-13**, Figure 7, drawing **1156938-01**, marked Change 2.
Instructions: **0125 00-11, sections 18.c–e**; general calculation rounding:
**0125 00-5, section 18 NOTE**.

The graphic labels Pressure Altitude in **1000 FT**, labels the individual
branches **2 through 10**, and groups the remaining branches under **SL-1**
at the common limit. Read in this chart context, SL is Sea Level and 1 is
1000 ft: the application uses the same labelled limit for PA 0–1000 ft.
This is the interpretation of the actual graphic; section 18.c does not
contain a separate prose definition of the abbreviation or explicitly define
a digital interpolation procedure. No separate SL or 1000-ft curve is stored.

## Geometry and calibration

The dataset stores nine cubic paths, containing all **24 original cubic
segments**, and nine separate straight paths, containing **15 original line
segments**. Original drawing order is preserved and each path has its source
PA label. All original PDF control points are retained. Source coordinates
are accumulated in integer hundredths of a PDF point, then independently
mapped to chart units. There is no three-decimal truncation.

The two long source strokes at the common limit are stored once under
`shared_limit.paths`, separate from all PA paths and from the SL-1 mapping.
They are not duplicated as artificial vertical segments within each PA curve.

Calibration is by independent ordinary least-squares affine fits to **11 TTV
major ticks (55–105%, spacing 5%)** and **13 FAT major ticks (-60 to +60 degC,
spacing 10 degC)**. Maximum residuals are approximately **0.00353532 TTV
percentage points** and **0.00735384 degC FAT**. Coefficients, all tick pairs,
source SHA-256 and absolute PDF points are included in the JSON. Residuals
and solver precision are not certified source accuracy.

Operating ranges are separately selected calculator policy: **FAT -55 to +55
degC, TTV 66–100%, PA 0–10000 ft**. They do not move, truncate, extend or
recalibrate source paths. In particular, there is no endpoint extension to
exactly -55 or +55 degC.

## Shared 100% Q TRANS LIMIT

The source label defines the semantic value **100%**. The central PDF stroke
at x=480.60 maps to about 100.015555% under the tick calibration; the second
long stroke is slightly slanted. Those geometric coordinates are preserved,
not silently snapped to numeric 100.

For each source-labelled branch 2000–9000 ft, a relationship to the shared
limit is stored, using the actual warm connector endpoint and, where present,
the cold connector endpoint. The 2000-ft branch has no separate warm
connector; its original cubic endpoint is retained as that boundary.
The relationship also respects the actual FAT extent of the common stroke.
These are coverage annotations interpreting the labelled limit, not added
geometric paths. No manually copied FAT threshold table is used.

Inside these labelled regions the evaluator returns **100%** with basis
`shared_100_limit`. This includes 6000 ft / -16 degC. Source branches on the
cold side at 8000/9000 ft are evaluated as drawn, rather than forced to 100%.
The 10000-ft branch has no shared-limit region.

## Evaluation and unverified regions

The 60-iteration FAT bisection is retained for cubics (with direction checked);
actual straight segments use linear evaluation. Both are restricted to the
segment's real FAT domain. No nearest-endpoint substitution is performed.

All matching source segments are inspected. Identical endpoint values on
genuinely joined segments are harmless; different values at the same FAT are
reported as ambiguous, without moving or merging their points. Conflicts
between a source endpoint and the labelled 100% relationship are likewise
left unresolved. No source-line-width tolerance is introduced.

Statuses:

- `available`: a single source value, an unambiguous shared-limit value, or
  interpolation between two available PA references.
- `unverified_coverage`: no supported source segment or shared limit.
- `unverified_ambiguous`: conflicting source values at the same FAT.
- `unverified_interpolation_coverage`: an intermediate PA requires an
  unavailable/ambiguous adjacent value.
- `outside_operating_ttv`: the source evaluation falls outside 66–100%.

No result other than `available` carries a numerical TTV. The calculator
checks the status before rounding TTV or calculating STR/ETF, clears stale
results, and requests verification against the approved SEI. Blocking such
results is conservative application policy, not an added SEI procedure.

Examples of unresolved **open** FAT intervals, approximate:

| PA ft | FAT interval degC | Cause |
|---:|---:|---|
| 0–7000 | -55 to -54.976485 | Shared line ends before selected cold boundary |
| 0–3000 | 54.970499 to 55 | Shared/branch hot ends before selected boundary |
| 3000 | 50.177340 to 50.192902 | Original path gap |
| 5000 | 40.466524 to 40.482086 | Original path gap |
| 7000 | 28.032321 to 28.047883 | Original path gap |
| 5000 | 34.973065 to 35.027098 | Source connector evaluates above selected 100% |
| 6000 | 29.977597 to 30.023573 | Same |
| 8000 | 9.933476 to 10.034097 | Same |
| 9000 | -3.014280 to -2.781568 | Same |

There are also isolated conflicting endpoints, for example 6000 ft at FAT
36.933903 and 9000 ft at FAT 7.599145. Original close-but-distinct endpoints
remain separate. The table illustrates the source-derived statuses; runtime
decisions use full precision geometry and coverage metadata, not these rounded
intervals. Intermediate PA can inherit an unavailable adjacent reference.

## PA interpolation and downstream arithmetic

Actual PA and FAT are retained, with no invented input step. Exact source
PA evaluates only that branch. Between labels, the existing linear PA
interpolation is used only if both reference evaluations are available.
For 1000–2000 ft, the 1000-ft reference is the shared SL-1 limit, not a new
curve. A curve/limit pair is **not automatically excluded**: 6500 ft / +25
degC and 9500 ft / -16 degC remain available. This interpolation is the
application's numerical reading method, not newly stored source geometry or
an independently specified SEI formula for intermediate curves.

The calculator retains raw TTV, rounds calculation TTV to 0.001, then uses
`STR = round3(TRQADJ / roundedTTV)`. Display strings never enter arithmetic.
TTV is a percentage and STR is dimensionless; no extra division by 100 is used.
Figure 4/5 algorithms, data and arithmetic are unchanged.

Section 18.c gives the 6000 ft / -16 degC example but no explicit numeric TTV.
The chart's labelled limit gives **TTV 100%**. With the current upstream
TRQADJ 97.674%, STR is **0.97674**, used as **0.977**. Section 18.e's separately
given STR 0.98 must not be used to infer a different TTV backwards.

## Reproduction and checks

```powershell
node scripts/calibrate-figure7.cjs
node --test tests/figure4.test.cjs tests/figure5.test.cjs tests/figure7.test.cjs
```

The calibration command verifies without writing. Only explicit `--write`
regenerates Figure 7 JSON. The extractor checks this source revision's paths
and calibration coordinates. Tests independently evaluate the extracted PDF
points via de Casteljau and cover original paths, real joins, gaps, ambiguous
endpoints, shared-limit regions, SL-1, selected ranges, intermediate PA/FAT,
blocking final STR/ETF and the official graph-reading example. Regression
hashes and the existing suites verify preservation of Figures 4/5 and AGENTS.md.
