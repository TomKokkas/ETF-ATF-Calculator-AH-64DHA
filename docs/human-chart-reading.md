# Approved human chart reading precision

This policy supersedes the former three-decimal chart-reading and secondary
display policies in the historical Figure phase reports. It is approved
application policy, not an explicit set of SEI numerical requirements.

| Figure | Output | Reading step | Source basis |
|---|---|---|---|
| 1 | TSF | 0.001 | Printed 0125 00-2: labelled 0.005, minor grid 0.001 |
| 4 | TGTREF | 2 degC | Printed 0125 00-9: labelled 20 degC, minor grid 2 degC |
| 5 | Factor | 0.005 | Printed 0125 00-10: labelled 0.05, minor grid 0.005 |
| 7 | TTV | 0.5 percent | Printed 0125 00-13: labelled 5 percent, minor grid 0.5 |
| 8 | ETF | 0.01 | Printed 0125 00-14: labelled 0.10, minor grid 0.02; published 0.93 supports a half-division estimate |

The existing chart evaluation supplies the line-centre value. `readChartValue`
then rounds its decimal Number representation to the selected step, using
integer quotient/remainder arithmetic without EPSILON or a tolerance. Exact
ties go toward positive infinity, retaining the application's sign policy.
The geometry, source coordinates, datasets and interpolation are unchanged.
Reading increments describe output quantization, not certified chart accuracy.

Each approved reading becomes the input to the next numerical stage. The
unchanged `round3` applies to arithmetic results (TRQTSF, delta TGT, TRQADJ and
STR). STR is not reduced to 0.01 before Figure 8. Measured inputs are not
quantized. Exactly 110 KIAS still uses TSF 1 without a Figure 1 lookup; all
applicability, coverage, limit and Figure 8 rule checks remain in place.
Unavailable source evaluations are never converted into readings.

Only one main value is shown per result. TGTREF is an integer multiple of two;
delta TGT is shown as an integer when exact, otherwise to three decimal places
so fractional measured TGT remains auditable. Factor is shown to three decimals,
ETF to two. No Calculated lines, raw values or provenance metadata appear in
the interface. Raw and provenance information remains in debug only.

| Scenario | TGTREF | Delta TGT | Factor | TRQADJ | TTV | STR | ETF |
|---|---|---|---|---|---|---|---|
| PA 6000, FAT -16, KIAS 130, TRQ 100, TGT 736 | 728 | -8 | 0.170 | 97.640 | 100 | 0.976 | 0.92 |
| PA 6005, FAT 14, KIAS 126, TRQ 100, TGT 800 | 818 | 18 | 0.170 | 102.260 | 100 | 1.023 | 1.00 |

Independent STR 0.98 / FAT -16 reads ETF 0.93. It is not substituted into the
first scenario. New step boundaries intentionally introduce quantization
steps; no curve smoothing, clamping, extension or input snapping is applied.

The regression suites retain all geometry/coverage and validation checks,
update only affected numerical/display expectations, and compare reading
rounding with an independent exact small-integer-grid oracle. The complete
calculator-prefix integrity snapshot and its dependent test-file hash are
refreshed for the approved reading-policy changes; no integrity guard is removed.
