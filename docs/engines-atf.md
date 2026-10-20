# Engine 1 / Engine 2 and aircraft torque factor

The two horizontal Engine 1 / Engine 2 tabs keep two independent in-memory records. Each retains the
original input strings (FAT, PA, KIAS, TRQ, TGT, NG), all displayed intermediate
results, the returned calculation/debug object, the ETF and a validity flag.
Switching restores those strings without Number conversion and restores the
results only when that engine still has a valid calculation. State lasts for
the current page session; refreshing the page starts a new power check.

Both engines use the same existing `calculate()` function. Its equations,
decimal arithmetic, rounding boundaries, chart reading steps, source geometry
and coverage checks are unchanged. The function now returns its existing debug
result (including TRQADJ) after success. The engine controller stores that same
result without evaluating the charts again. A failed calculation returns no
result and leaves the selected engine invalid.

Any input/change event that changes an engine's input text clears its previous
results and ETF. The other engine is preserved. Switching and calculating also
check for changed input text, covering programmatic changes without an event.
ATF is unavailable until both engines have valid ETF results.

ATF = (ETF1 + ETF2) / 2 uses the existing exact BigInt rational arithmetic.
The exact rational mean is retained in `engineState.atf.exact`; it is not
replaced by the two-decimal presentation. Decimal quotient/remainder rounding
produces the displayed ATF, including .93 and .98 giving exact .955, displayed
.96. No Number.toFixed tie decision is used. The minimum .90 specified for
this workflow by SEI-671 section 22 is compared against the exact mean. Thus
.895 displays .90 but is still clearly marked below minimum.

Regression tests cover independent engines, restored decimal text and results,
all six invalidating inputs, one-engine and failed-result cases, exact ATF
rounding and minimum comparisons, and approved A/B/C calculations on both
engines. The source integrity tests continue protecting the datasets,
interpolation and round3 implementation.

Run all tests with PowerShell:

```powershell
$testFiles = @(rg --files --no-ignore tests -g '*.test.cjs')
node --test $testFiles
node scripts/browser-engines.cjs
```

The browser script uses the installed Windows Chrome with an isolated temporary
profile and a local HTTP server, testing desktop 1280x900 and mobile viewport
390x844. It exercises actual calculations yielding ETF .93 and .98, the exact
.955 mean, switching, invalidation, coverage failures, input precision and
responsive layout. Mobile is browser emulation, not a physical-device test.

## Presentation

The tabs share the existing form and panel. The selected tab uses the current
palette with a distinct background/border; equal-width tabs remain side by
side on mobile. ARIA selection, panel labelling and arrow/Home/End keyboard
navigation follow the same engine selection function. Switching restores inputs
and results without another chart evaluation.

The aircraft summary shows only Engine 1 ETF, Engine 2 ETF and ATF. Missing
results use an em dash. There is no persistent minimum, instruction or exact
ATF value in the UI. Only a below-minimum exact ATF makes the displayed ATF
red and reveals the red message "ATF below minimum limit". The warning clears
when results become incomplete or meet the existing minimum. The .895 case
still displays .90 in red, because the exact comparison is unchanged.

No ETF colour threshold is added. SEI-671 section 19 (printed 0125 00-15)
contains installation/troubleshooting criteria involving .97, .85 and a .05
degradation; these are contextual criteria, not a newly adopted universal UI
limit. Figure 8 notes (0125 00-14) and its existing coverage/special rules are
unchanged. The ATF minimum comparison remains the existing section 22 rule.
