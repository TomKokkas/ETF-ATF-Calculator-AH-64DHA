let figure1Data = null;
let figure4Data = null;
let figure5Data = null;
let figure7Data = null;
let figure8Data = null;


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
function round3(value) {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
}


function readNumber(id) {
    const element = document.getElementById(id);
    const value = Number(element.value);

    if (element.value.trim() === "" || Number.isNaN(value)) {
        throw new Error(`Enter a valid value for ${id.toUpperCase()}.`);
    }

    return value;
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

        /*
         * FIGURE 1
         */
        const tsfRaw = getTSF(kias);
        const tsf = round3(tsfRaw);

        /*
         * %TRQTSF = TRQ × TSF
         */
        const trqTsf = round3(trq * tsf);

        /*
         * FIGURE 4
         */
        const figure4Result = calculateFigure4TgtRef(
            figure4Data,
            fat,
            pa
        );

        const tgtRefRaw = figure4Result.tgtref;
        const figure5Result = calculateFigure5DeltaFactor(
    figure5Data,
    pa
);

const deltaFactorRaw = figure5Result.factor;
const deltaFactor = round3(deltaFactorRaw);

        /*
         * Keep raw chart interpolation internally.
         * Display Target TGTREF to nearest whole °C
         * for the current verification stage.
         */
        const tgtRefDisplay = Math.round(tgtRefRaw);

        /*
         * ΔTGT = Target TGTREF - measured TGT
         */
        const deltaTgt = tgtRefDisplay - tgt;
        const trqAdj = round3(
    trqTsf + (deltaFactor * deltaTgt)
);

        /*
         * FIGURE 7
         */
        const figure7Result = calculateFigure7TTV(
            figure7Data,
            fat,
            pa
        );

        const ttvRaw = figure7Result.ttv;
        const ttv = round3(ttvRaw);

        /*
         * STR = TRQADJ / TTV
         */
        const strRaw = trqAdj / ttv;
        const str = round3(strRaw);

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

        const etfRaw = figure8Result.etf;
        const etf = round3(etfRaw);

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
            deltaTgt.toFixed(0) + " °C"
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
        setResult("result-etf", etf.toFixed(3));

        /*
         * Debug information.
         * Useful while validating digitized charts.
         */
        console.log("Calculation debug:", {
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
                displayedTgtRef: tgtRefDisplay
            },

            deltaTgt,

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
                chartFat: figure8Result.chartFat,
                lowerFat: figure8Result.lowerFat,
                upperFat: figure8Result.upperFat,
                lowerEtf: figure8Result.lowerEtf,
                upperEtf: figure8Result.upperEtf,
                rawEtf: etfRaw,
                etf
            }
        });

    } catch (error) {
        clearResults();

        console.error(error);
        alert(error.message);
    }
}


/*
 * Calculate button
 */
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