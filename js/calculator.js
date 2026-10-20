let figure1Data = null;
let figure4Data = null;
let figure5Data = null;
let figure7Data = null;
let figure8Data = null;

// Verbose calculation logging is off by default; tests opt in via ETF_ATF_DEBUG.
function debugLog(...args) {
    if (globalThis.ETF_ATF_DEBUG === true) {
        console.log(...args);
    }
}


/*
 * Load chart data
 */
async function loadChartData() {
const [figure1Response, figure4Response, figure5Response, figure7Response, figure8Response] = await Promise.all([
    fetch("data/figure-1-tsf.json"),
    fetch("data/figure-4-tgtref.json"),
    fetch("data/figure-5-dtrq-dtgt.json"),
    fetch("data/figure-7-ttv.json"),
    fetch("data/figure-8-etf.json")
]);
    if (!figure1Response.ok) {
        throw new Error("Could not load Figure 1 data.");
    }

    if (!figure4Response.ok) {
        throw new Error("Could not load Figure 4 data.");
    }
    if (!figure5Response.ok) {
    throw new Error("Could not load Figure 5 data.");
    }

    if (!figure7Response.ok) {
        throw new Error("Could not load Figure 7 data.");
    }

    if (!figure8Response.ok) {
        throw new Error("Could not load Figure 8 data.");
    }

    figure1Data = await figure1Response.json();
    figure4Data = await figure4Response.json();
    figure5Data = await figure5Response.json();
    figure7Data = await figure7Response.json();
    figure8Data = await figure8Response.json();
    console.log("Figure 1 loaded:", figure1Data);
    console.log("Figure 4 loaded:", figure4Data);
    console.log("Figure 5 loaded:", figure5Data);
    console.log("Figure 7 loaded:", figure7Data);
    console.log("Figure 8 loaded:", figure8Data);
}


/*
 * Figure 1
 * Find TSF for entered KIAS.
 *
 * Exact integer KIAS values are stored in the JSON.
 * Decimal KIAS values are linearly interpolated.
 */
function getTSF(kias) {
    const data = figure1Data.data;

    if (kias < data[0].kias || kias > data[data.length - 1].kias) {
        throw new Error(
            `KIAS must be between ${data[0].kias} and ${data[data.length - 1].kias}.`
        );
    }

    const exact = data.find(point => point.kias === kias);

    if (exact) {
        return exact.tsf;
    }

    for (let i = 0; i < data.length - 1; i++) {
        const lower = data[i];
        const upper = data[i + 1];

        if (kias > lower.kias && kias < upper.kias) {
            return interpolateLinear(
                kias,
                lower.kias,
                lower.tsf,
                upper.kias,
                upper.tsf
            );
        }
    }

    throw new Error("Unable to calculate TSF.");
}


/*
 * SEI calculation rounding:
 * display/calculation values to 0.001.
 */
// Exact decimal arithmetic. Measured operands retain their original decimal
// text; Number operands use their shortest decimal spelling. Source geometry
// and the public round3 convention remain unchanged.
function decimalValue(value) {
    if (value && typeof value === "object" && typeof value.n === "bigint") return value;
    if ((typeof value !== "string" && typeof value !== "number") ||
        !Number.isFinite(Number(value))) throw new TypeError("Finite decimal required.");
    const text = typeof value === "number" && Object.is(value, -0) ? "-0" : String(value).trim();
    const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(text);
    if (!match) throw new TypeError("Valid decimal required.");
    const negative = match[1] === "-";
    const places = (match[2].split(".")[1] || "").length;
    const shift = Number(match[3] || 0) - places;
    // A zero needs no exponent allocation, even for extreme exponent spelling.
    let n = BigInt(match[2].replace(".", ""));
    if (n === 0n) return { n: 0n, d: 1n, negativeZero: negative };
    if (!Number.isSafeInteger(shift)) throw new RangeError("Decimal exponent is not representable.");
    if (negative) n = -n;
    return shift >= 0 ? { n: n * 10n ** BigInt(shift), d: 1n } :
        { n, d: 10n ** BigInt(-shift) };
}

function decimalOperation(operation, left, right) {
    const a = decimalValue(left), b = decimalValue(right);
    const aNegative = a.n < 0n || !!a.negativeZero;
    const bNegative = b.n < 0n || !!b.negativeZero;
    let n, d, negativeZero = false;
    if (operation === "add" || operation === "subtract") {
        n = a.n * b.d + (operation === "add" ? b.n : -b.n) * a.d;
        d = a.d * b.d;
        negativeZero = aNegative && (operation === "add" ? bNegative : !bNegative);
    } else if (operation === "multiply") {
        n = a.n * b.n; d = a.d * b.d;
        negativeZero = aNegative !== bNegative;
    } else if (operation === "divide") {
        if (b.n === 0n) throw new RangeError("Decimal division by zero.");
        n = a.n * b.d; d = a.d * b.n;
        if (d < 0n) { n = -n; d = -d; }
        negativeZero = aNegative !== bNegative;
    } else throw new Error("Unknown decimal operation.");
    return { n, d, negativeZero: n === 0n && negativeZero };
}

function decimalRound3(value) {
    const { n, d, negativeZero } = decimalValue(value);
    const negative = n < 0n || (n === 0n && negativeZero);
    const scaled = (n < 0n ? -n : n) * 1000n;
    let units = scaled / d;
    const twiceRemainder = 2n * (scaled % d);
    // Same approved policy as round3: negative exact ties toward +infinity.
    if (twiceRemainder > d || (twiceRemainder === d && !negative)) units++;
    return { n: negative ? -units : units, d: 1000n, negativeZero: negative && units === 0n };
}

function decimalNumber(value) {
    const a = decimalRound3(value);
    const result = Number(String(a.n) + "e-3");
    if (!Number.isFinite(result)) throw new RangeError("Decimal result is not a finite Number.");
    return a.negativeZero ? -0 : result;
}

function round3(value) {
    // Application convention: round the Number's shortest decimal spelling,
    // not its exact binary fraction. Negative ties retain the +infinity policy;
    // the SEI NOTE specifies positive examples, not negative tie handling.
    if (!Number.isFinite(value)) {
        throw new TypeError("round3 requires a finite number");
    }

    const negative = value < 0 || Object.is(value, -0);
    const [mantissa, exponent = "0"] =
        Math.abs(value).toString().split("e");
    const decimalPlaces = (mantissa.split(".")[1] || "").length;
    const digits = BigInt(mantissa.replace(".", ""));
    const shift = Number(exponent) - decimalPlaces + 3;
    let units;

    if (shift >= 0) {
        units = digits * 10n ** BigInt(shift);
    } else {
        const divisor = 10n ** BigInt(-shift);
        units = digits / divisor;
        const twiceRemainder = 2n * (digits % divisor);
        if (
            twiceRemainder > divisor ||
            (twiceRemainder === divisor && !negative)
        ) {
            units += 1n;
        }
    }

    const rounded = Number(`${units}e-3`);
    return negative ? -rounded : rounded;
}


function readNumber(id) {
    const element = document.getElementById(id);
    const value = Number(element.value);

    if (element.value.trim() === "" || !Number.isFinite(value)) {
        throw new Error(`Enter a finite numeric value for ${id.toUpperCase()}.`);
    }

    return value;
}


function validateInputs({ fat, pa, kias, trq, tgt, ng }) {
    for (const [name, value] of Object.entries({ fat, pa, kias, trq, tgt, ng })) {
        if (!Number.isFinite(value)) {
            throw new Error(`Enter a finite numeric value for ${name.toUpperCase()}.`);
        }
    }
    if (pa < 0 || pa > 10000) throw new Error("PA must be between 0 and 10000 ft.");
    // Selected calculator operating range, not the full FAT axis of the SEI.
    if (fat < -55 || fat > 55) throw new Error("FAT must be between -55 and 55 °C for this calculator.");
    if (!Number.isInteger(kias) || kias < 90 || kias > 160) throw new Error("KIAS must be an integer between 90 and 160.");
    if (trq <= 0 || trq > 100) throw new Error("Measured torque must be greater than 0 and no more than 100%.");
    // Positive TGT/NG are approved application input policies, not SEI
    // universal numerical limits. No unsupported upper limit is imposed.
    if (tgt <= 0) throw new Error("Measured TGT must be greater than 0 °C.");
    if (ng <= 0) throw new Error("NG must be greater than 0%.");
    if (kias !== 110 && pa < 2000) {
        throw new Error("Figure 1 TSF is verified only for PA 2000–10000 ft when KIAS is not exactly 110. No verified ETF is available for this input combination.");
    }
}


// Approved application reading steps, expressed in thousandths. These are
// not SEI arithmetic rules and never quantize measured inputs or source data.
const CHART_READING_UNITS = Object.freeze({ 1: 1n, 4: 2000n, 5: 5n, 7: 500n, 8: 10n });
function readChartValue(value, figure) {
    if (!Number.isFinite(value)) throw new TypeError("Chart reading requires a finite number.");
    const step = CHART_READING_UNITS[figure];
    if (step === undefined) throw new Error("Unknown chart reading step.");
    const negative = value < 0 || Object.is(value, -0);
    const [mantissa, exponent = "0"] = Math.abs(value).toString().split("e");
    const digits = BigInt(mantissa.replace(".", ""));
    const shift = Number(exponent) - (mantissa.split(".")[1] || "").length + 3;
    const numerator = shift >= 0 ? digits * 10n ** BigInt(shift) : digits;
    const denominator = step * (shift < 0 ? 10n ** BigInt(-shift) : 1n);
    let count = numerator / denominator;
    const twiceRemainder = 2n * (numerator % denominator);
    if (twiceRemainder > denominator || (twiceRemainder === denominator && !negative)) count += 1n;
    const rounded = Number(`${count * step}e-3`);
    return negative ? -rounded : rounded;
}


function setResult(id, value) {
    document.getElementById(id).textContent = value;
}


function clearResults() {
    setResult("result-tsf", "---");
    setResult("result-trqtsf", "---");
    setResult("result-tgtref", "---");
    setResult("result-delta-tgt", "---");
    setResult("result-delta-factor", "---");
    setResult("result-trqadj", "---");
    setResult("result-ttv", "---");
    setResult("result-str", "---");
    setResult("result-etf", "---");
}


/*
 * Current calculator stage:
 *
 * Figure 1 -> TSF
 * %TRQTSF = TRQ × TSF
 *
 * Figure 4 -> Target TGTREF
 * ΔTGT = Target TGTREF - measured TGT
 *
 * Figure 5 -> ΔTRQ / ΔTGT
 * TRQADJ = %TRQTSF + (ΔTRQ / ΔTGT × ΔTGT)
 *
 * Figure 7 -> TTV
 * STR = TRQADJ / TTV
 *
 * Figure 8 -> ETF
 */
function calculate() {
    try {
        if (!figure1Data || !figure4Data || !figure5Data || !figure7Data || !figure8Data) {
            throw new Error("Chart data has not loaded yet.");
        }

        const fat = readNumber("fat");
        const pa = readNumber("pa");
        const kias = readNumber("kias");
        const trq = readNumber("trq");
        const tgt = readNumber("tgt");

        /*
         * NG is read now because it is one of our
         * power-check inputs. It will be used later
         * where required by the remaining figures.
         */
        const ng = readNumber("ng");

        validateInputs({ fat, pa, kias, trq, tgt, ng });

        /*
         * FIGURE 1
         */
        // SEI §18.a NOTE: exactly 110 KIAS needs no Figure 1 lookup.
        const tsfRaw = kias === 110 ? 1 : getTSF(kias);
        const tsf = readChartValue(tsfRaw, 1);

        /*
         * %TRQTSF = TRQ × TSF
         */
        const trqDecimal = decimalValue(document.getElementById("trq").value);
        const tgtDecimal = decimalValue(document.getElementById("tgt").value);
        const trqTsfDecimal = decimalRound3(decimalOperation("multiply", trqDecimal, tsf));
        const trqTsf = decimalNumber(trqTsfDecimal);

        /*
         * FIGURE 4
         */
        const figure4Result = calculateFigure4TgtRef(
            figure4Data,
            fat,
            pa
        );

        if (figure4Result.status === "unverified_mixed_limit") {
            debugLog("Figure 4 diagnostic estimate (not for performance calculation):", figure4Result);
            throw new Error("Unverified Figure 4 interpolation: only one neighbouring PA curve has reached 866 °C. No final performance result is available. Verification against the approved SEI is required.");
        }
        const tgtRefRaw = figure4Result.tgtref;
        const tgtRefUsed = readChartValue(tgtRefRaw, 4);
        const tgtRefDisplay = tgtRefUsed.toFixed(0);
        const figure5Result = calculateFigure5DeltaFactor(
    figure5Data,
    pa
);

const deltaFactorRaw = figure5Result.factor;
if (figure5Result.status === "unverified_coverage") {
    throw new Error("No verified Figure 5 result: PA is outside the actual source-curve coverage. No final performance result is available. Verification against the approved SEI is required.");
}
const deltaFactor = readChartValue(deltaFactorRaw, 5);

        /*
         * ΔTGT = Target TGTREF - measured TGT
         */
        const deltaTgtDecimal = decimalRound3(decimalOperation("subtract", tgtRefUsed, tgtDecimal));
        const deltaTgt = decimalNumber(deltaTgtDecimal);
        const deltaTgtDisplay = Number.isInteger(deltaTgt) ? deltaTgt.toFixed(0) : deltaTgt.toFixed(3);
        // Preserve the existing rounding boundary: exact product plus exact
        // TRQTSF, then one rounding of the complete TRQADJ expression.
        const correctionDecimal = decimalOperation("multiply", deltaFactor, deltaTgtDecimal);
        const trqAdjDecimal = decimalRound3(decimalOperation("add", trqTsfDecimal, correctionDecimal));
        const trqAdj = decimalNumber(trqAdjDecimal);

        /*
         * FIGURE 7
         */
        const figure7Result = calculateFigure7TTV(
            figure7Data,
            fat,
            pa
        );

        if (figure7Result.status !== "available") {
            debugLog("Figure 7 coverage diagnostics (not a final performance result):", figure7Result);
            throw new Error("No verified Figure 7 TTV: the requested PA/FAT has missing or ambiguous source coverage, or is outside the selected TTV range. No STR or final performance result is available. Verification against the approved SEI is required.");
        }
        const ttvRaw = figure7Result.ttv;
        const ttv = readChartValue(ttvRaw, 7);

        /*
         * STR = TRQADJ / TTV
         */
        const strRaw = trqAdj / ttv;
        // strRaw is diagnostic only; it never feeds the performance calculation.
        const str = decimalNumber(decimalRound3(decimalOperation("divide", trqAdjDecimal, ttv)));

        /*
         * FIGURE 8
         *
         * STR enters Figure 8 at the SEI 0.001 rounding.
         * The SEI Figure 8 example uses STR 0.98, but the
         * SEI gives no rule for rounding STR to 0.01.
         */
        const figure8Result = calculateFigure8ETF(
            figure8Data,
            str,
            fat
        );

        if (figure8Result.status !== "available") {
            debugLog("Figure 8 source coverage diagnostics:", figure8Result);
            throw new Error("No verified Figure 8 ETF: STR lies outside a required source stroke or inside an unresolved FAT-label gap. No final performance result is available. Gap policy requires review and verification against the approved SEI.");
        }
        const etfRaw = figure8Result.etf;
        const etf = readChartValue(etfRaw, 8);

        /*
         * Display available results.
         */
        setResult("result-tsf", tsf.toFixed(3));

        setResult(
            "result-trqtsf",
            trqTsf.toFixed(3) + " %"
        );

        setResult(
            "result-tgtref",
            tgtRefDisplay + " °C"
        );

        setResult(
            "result-delta-tgt",
            deltaTgtDisplay + " °C"
        );

        /*
         * Remaining figures not implemented yet.
         */
        setResult(
    "result-delta-factor",
    deltaFactor.toFixed(3)
);

setResult(
    "result-trqadj",
    trqAdj.toFixed(3) + " %"
);
        setResult(
            "result-ttv",
            ttv.toFixed(3) + " %"
        );

        setResult("result-str", str.toFixed(3));
        setResult("result-etf", etf.toFixed(2));
        const etfProvenance = describeFigure8Provenance(figure8Result);

        /*
         * Debug information.
         * Useful while validating digitized charts.
         */
        const calculationResult = {
            fat,
            pa,
            kias,
            trq,
            tgt,
            ng,

            tsfRaw,
            tsf,
            trqTsf,

            figure4: {
                lowerPA: figure4Result.lowerPA,
                upperPA: figure4Result.upperPA,
                lowerTgtRef: figure4Result.lowerTgtRef,
                upperTgtRef: figure4Result.upperTgtRef,
                rawTgtRef: tgtRefRaw,
                usedTgtRef: tgtRefUsed,
                displayedTgtRef: tgtRefDisplay
            },

            deltaTgt,
            trqAdj,

            figure5: {
                rawFactor: deltaFactorRaw,
                usedFactor: deltaFactor,
                matchedPA: figure5Result.matchedPA
            },

            figure7: {
                lowerPA: figure7Result.lowerPA,
                upperPA: figure7Result.upperPA,
                lowerTtv: figure7Result.lowerTtv,
                upperTtv: figure7Result.upperTtv,
                rawTtv: ttvRaw,
                ttv
            },

            strRaw,
            str,

            figure8: {
                status: figure8Result.status,
                basis: figure8Result.basis,
                lowerBasis: figure8Result.lowerBasis,
                upperBasis: figure8Result.upperBasis,
                usesLabelGapInterpolation: figure8Result.usesLabelGapInterpolation,
                provenance: etfProvenance,
                chartFat: figure8Result.chartFat,
                lowerFat: figure8Result.lowerFat,
                upperFat: figure8Result.upperFat,
                lowerEtf: figure8Result.lowerEtf,
                upperEtf: figure8Result.upperEtf,
                rawEtf: etfRaw,
                etf
            }
        };
        debugLog("Calculation debug:", calculationResult);
        return calculationResult;

    } catch (error) {
        clearResults();

        console.error(error);
        alert(error.message);
    }
}


/*
 * Calculate button
 */
function describeFigure8Provenance(result) {
    const label = basis => basis === "source_stroke" ? "digitized line segment" :
        basis === "label_gap_interpolation" ? "label-gap interpolation (application method, not a source line)" :
        "origin unavailable";
    if (result.basis === "sei_str_rule") return "SEI rule: STR ≥ 1 gives ETF 1.";
    if (result.basis === "fat_interpolation") {
        return `Between FAT lines: ${result.lowerFat} °C — ${label(result.lowerBasis)}; ${result.upperFat} °C — ${label(result.upperBasis)}.`;
    }
    return `Figure 8: ${label(result.basis)}.`;
}

document
    .getElementById("calculate-btn")
    .addEventListener("click", calculate);


/*
 * Load JSON data when page starts.
 */
loadChartData()
    .then(() => {
        console.log("SEI chart data ready.");
    })
    .catch(error => {
        console.error(error);

        alert(
            "Chart data could not be loaded. " +
            "Run the calculator through a local web server."
        );
    });
