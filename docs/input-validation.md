# Input validation and Figure 1 applicability

All six inputs are required and must be finite numbers. Central validation
runs before TSF lookup, rounding, or evaluation of any performance chart.
It compares original inputs, with no rounding, clamping or tolerance.

| Input | Accepted values |
|---|---|
| PA | 0 through 10000 ft, subject to chart coverage |
| FAT | -55 through +55 degC, selected calculator operating range |
| KIAS | Integers 90 through 160 only; no rounding or snapping |
| Measured torque | Greater than zero, no more than 100 percent |
| Measured TGT | Greater than zero degC, no arbitrary upper limit |
| NG | Greater than zero percent, no arbitrary upper limit |

Source: SEI-671, printed page 0125 00-2, Figure 1, applies at 2000 through
10000 ft. Page 0125 00-5, section 18.a NOTE, states that at 110 KIAS measured
torque equals TRQTSF. Accordingly exactly 110 KIAS uses TSF 1.000 without a
Figure 1 lookup. At any other speed PA must be at least 2000 ft before the
existing lookup can be used. There is no tolerance or snapping around 110.
The other charts' geometric coverage guards still apply below 2000 ft.

The measured torque upper bound is grounded in the power-check instructions
on pages 0125 00-1, -3 and -4. Strict positivity of measured torque, measured
TGT and NG is an approved application input policy, not a new universal SEI
numerical limit. The FAT interval is the selected calculator operating range,
not the full axes of every source chart. Limiter settings are not used as
invented global input bounds. NG is recorded but is not used in the present
ETF arithmetic chain. These validations cannot certify that the physical
power-check procedure and recording conditions were satisfied.

HTML provides required/min/max hints, step="1" only for KIAS, and step="any"
for all other numeric inputs. Central JavaScript validation uses
`Number.isInteger(kias)`: 94.0 is accepted as the Number 94; 94.1 is rejected.
Because HTML min is inclusive, zero on the three positive-only fields is
rejected by JavaScript. JavaScript remains authoritative for every field and
for the conditional PA/KIAS rule. Invalid submissions clear all previous
outputs and report the reason; no arithmetic is attempted.

The Figure 5 zero-altitude regression fixture now uses 110 KIAS so it reaches
the intended Figure 5 coverage guard. The calculator-prefix integrity snapshot
is refreshed to cover the full approved prefix, including round3 and validation;
the dependent Figure 7 test-file hash is refreshed in Figure 8. No Figure
geometry, interpolation, rounding function, TSF values or equations changed.

## Integer Figure 1 domain and nominal 160 KIAS endpoint

The integer-only input restriction is approved application policy; it is not
an SEI instruction to round measured airspeed. The existing TSF table and
lookup are retained. No Bezier solver or new source geometry is introduced.
Exactly 110 KIAS still bypasses the table and the PA applicability rule is
unchanged for other speeds. Decimal FAT, PA, torque, TGT and NG remain allowed.

Independent reading of the Figure 1 PDF centerlines agrees with all 70
stored integer readings from 90 through 159 KIAS at the 0.001 reading step.
The final vector endpoint maps to approximately 159.9305 KIAS, with raw TSF
0.971589965, read as 0.972. It lies 0.36 PDF points short of the right major
grid line; the performance stroke width is 2.16 points. Retaining TSF 0.972
at nominal 160 KIAS is explicitly approved endpoint-reading policy. It is
not a mathematically verified exact centerline intersection at 160 KIAS,
and neither the source endpoint nor the curve is moved or extrapolated.

The former decimal-KIAS interpolation issue is excluded from the permitted
input domain. The separate Major 2 issue of binary arithmetic before round3
is unchanged and outside this implementation.
