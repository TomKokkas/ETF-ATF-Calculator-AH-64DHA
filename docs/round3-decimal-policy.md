# Decimal rounding to 0.001

SEI-671, printed page 0125 00-5, section 18 NOTE requires calculations rounded
to the nearest 0.001 and gives positive examples with halfway values rounded
up. `round3` implements that behavior without an EPSILON tolerance.

The application interprets the shortest decimal spelling of the incoming
JavaScript Number (`Number.toString()`) as its rounding input. This is an
application numerical convention, not an additional SEI instruction. BigInt
quotient/remainder arithmetic decides the nearest thousandth exactly for that
decimal spelling, then the result is converted back to Number. Scientific
notation is supported. Previous floating-point arithmetic errors cannot be
recovered, and the returned Number is still a binary floating-point value.

Negative exact ties retain the existing application policy toward positive
infinity: -0.0625 becomes -0.062. The NOTE's positive examples do not establish
a signed tie rule; this choice preserves application compatibility. Negative
zero is preserved. Non-number and non-finite inputs throw a TypeError.

The precision policy A, all rounding call sites, operation order, chart
geometry and display formatting remain unchanged. This corrects 2.0035 to
2.004 and 4.0005 to 4.001; torque 64.85 times TSF 0.990 now gives 64.202.
Before the human-reading policy, the real chart example was TRQADJ 97.674,
STR 0.977, ETF 0.921. With the subsequently approved chart reading steps it is
TRQADJ 97.640, STR 0.976, ETF 0.92; see `human-chart-reading.md`. The round3
implementation and arithmetic rounding rule are unchanged.
Independent published-value arithmetic still reproduces TRQADJ 97.640, and
independent STR 0.98 / FAT -16 gives the published two-decimal ETF 0.93.

`tests/round3.test.cjs` uses an independent decimal-string oracle with
digit-wise carrying, without BigInt or the production quotient/remainder
algorithm. It covers positive and negative ties, both near-tie sides,
scientific notation, extreme finite Numbers, signed zero, invalid inputs,
and idempotence. Published examples remain in their separate suite.

Tests load the complete function between explicit adjacent top-level
declarations, validating that source in a VM; they do not truncate at a
nested closing brace or add a public production export. The Figure 7
calculator-prefix integrity assertion excludes only this approved function
region and continues comparing the rest byte-for-byte after newline
normalization. Its dependent test-file hash is refreshed in Figure 8.

## Major 2: exact decimal arithmetic stages

Production arithmetic now uses BigInt rational operands before rounding, rather
than rounding an already evaluated binary Number expression. The existing
round3 function is byte-preserved. Its positive ties and application policy
of negative ties toward positive infinity also govern decimalRound3.

Torque and measured TGT are parsed from their original validated decimal input
text, without quantizing measured inputs. Chart readings retain the approved
steps (TSF .001, TGTREF 2 C, factor .005, TTV .5%, ETF .01). Number chart
operands are interpreted using their shortest decimal spelling. This is an
application representation convention, not a new SEI instruction.

Exact rational values are retained for TRQTSF and delta TGT rounded to .001,
then for the factor product plus TRQTSF, with a single .001 rounding of the
complete TRQADJ expression at the original rounding boundary. STR is obtained
by exact division of that rounded TRQADJ by the TTV reading and rounding to
.001. There is no binary arithmetic between these rounding decisions.
Negative zero is retained, division by zero and non-finite inputs are rejected.
The existing Number strRaw remains diagnostic only; it never drives Figure 8.
Number adapters supply the existing presentation/debug fields and the rounded
STR input to the unchanged Figure 8 evaluator. Exact internal stage objects
are not replaced by those Number adapters. Extreme Number outputs still have
Number representability limits; this change does not certify source precision
or expand chart coverage. No ATF workflow is added; exact addition/division
helpers can support it when that workflow is implemented.

The corrected valid regression (PA 6000, FAT -16, KIAS 91, torque 99.5,
measured TGT 736.506) gives TRQTSF 100.396, TRQADJ 98.950, STR .990 and ETF
.97, versus the former 100.395, 98.949, .989 and .96. Approved scenarios A/B/C
remain respectively TRQADJ/STR/ETF 97.640/.976/.92, 102.260/1.023/1.00,
and 98.095/.981/.96. Independent STR .98 / FAT -16 still reads ETF .93.

The new arithmetic suite uses an independent safe-integer rational oracle
(no BigInt or production parsing) for 2020 comparisons, explicit decimal
anchors, halfway and near-halfway tests, long measured input text, signed
zero, invalid operands, full-chain regressions and source integrity hashes.
No source geometry, interpolation, reading step or display policy changes.
