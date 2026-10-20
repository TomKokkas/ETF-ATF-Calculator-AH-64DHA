// Engine state surrounds the shared calculator; no chart logic is duplicated.
const ENGINE_INPUT_IDS = Object.freeze(["fat", "pa", "kias", "trq", "tgt", "ng"]);
const ENGINE_RESULT_IDS = Object.freeze([
    "tsf", "trqtsf", "tgtref", "delta-tgt", "delta-factor", "trqadj", "ttv", "str", "etf"
].map(name => "result-" + name));

function emptyEngine() {
    return { inputs: Object.fromEntries(ENGINE_INPUT_IDS.map(id => [id, ""])),
        results: null, calculation: null, etf: null, valid: false };
}

const engineState = { selected: 1, engines: { 1: emptyEngine(), 2: emptyEngine() }, atf: null };

// Exact decimal formatting, including positive halfway values such as .955.
// Never route the tie decision through Number.toFixed.
function formatAircraftDecimal(value, places = 2) {
    const a = decimalValue(value), scale = 10n ** BigInt(places);
    const negative = a.n < 0n || !!a.negativeZero;
    const numerator = (a.n < 0n ? -a.n : a.n) * scale;
    let units = numerator / a.d;
    const twiceRemainder = 2n * (numerator % a.d);
    if (twiceRemainder > a.d || (twiceRemainder === a.d && !negative)) units++;
    const digits = units.toString().padStart(places + 1, "0");
    return (negative ? "-" : "") + digits.slice(0, -places) + "." + digits.slice(-places);
}

function calculateAircraftFactor(first, second) {
    // Both ETF readings are retained exactly; the mean is not rounded to .01.
    const exact = decimalOperation("divide", decimalOperation("add", first, second), "2");
    return { exact, display: formatAircraftDecimal(exact),
        belowMinimum: exact.n * 10n < 9n * exact.d };
}

function renderAircraftSummary() {
    for (const number of [1, 2]) {
        const engine = engineState.engines[number];
        setResult("engine-" + number + "-etf", engine.valid ? formatAircraftDecimal(engine.etf) : "\u2014");
    }
    const first = engineState.engines[1], second = engineState.engines[2];
    engineState.atf = first.valid && second.valid ? calculateAircraftFactor(first.etf, second.etf) : null;
    const atf = engineState.atf, status = document.getElementById("atf-status");
    setResult("result-atf", atf ? atf.display : "\u2014");
    status.textContent = atf && atf.belowMinimum ? "ATF below minimum limit" : "";
    status.hidden = !atf || !atf.belowMinimum;
    status.dataset.state = !atf ? "incomplete" : atf.belowMinimum ? "below-minimum" : "meets-minimum";
    document.getElementById("result-atf").dataset.state = status.dataset.state;
}

function saveEngineInputs() {
    const engine = engineState.engines[engineState.selected];
    const inputs = Object.fromEntries(ENGINE_INPUT_IDS.map(id => [id, document.getElementById(id).value]));
    const changed = ENGINE_INPUT_IDS.some(id => inputs[id] !== engine.inputs[id]);
    engine.inputs = inputs;
    if (changed) {
        engine.valid = false;
        engine.etf = null;
        engine.results = null;
        engine.calculation = null;
        renderEngineResults();
    }
    renderAircraftSummary();
}

function selectEngine(number) {
    if (number !== 1 && number !== 2) throw new Error("Select Engine 1 or Engine 2.");
    saveEngineInputs();
    engineState.selected = number;
    const engine = engineState.engines[number];
    renderEngineTabs();
    for (const id of ENGINE_INPUT_IDS) document.getElementById(id).value = engine.inputs[id];
    renderEngineResults();
    renderAircraftSummary();
}

function calculateSelectedEngine() {
    saveEngineInputs();
    const engine = engineState.engines[engineState.selected];
    // Invalidate before evaluation so a failed recalculation cannot retain ETF.
    engine.valid = false;
    engine.etf = null;
    engine.results = null;
    engine.calculation = null;
    const result = calculate();
    if (result) {
        engine.calculation = result;
        engine.etf = decimalValue(result.figure8.etf);
        engine.results = Object.fromEntries(ENGINE_RESULT_IDS.map(id => [id, document.getElementById(id).textContent]));
        engine.valid = true;
    }
    renderEngineResults();
    renderAircraftSummary();
    return result;
}

for (const id of ENGINE_INPUT_IDS) {
    document.getElementById(id).addEventListener("input", saveEngineInputs);
    document.getElementById(id).addEventListener("change", saveEngineInputs);
}
function renderEngineResults() {
    const engine = engineState.engines[engineState.selected];
    for (const id of ENGINE_RESULT_IDS) setResult(id, engine.valid ? engine.results[id] : "\u2014");
}

function renderEngineTabs() {
    for (const number of [1, 2]) {
        const tab = document.getElementById("engine-tab-" + number);
        const selected = number === engineState.selected;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
    }
    document.getElementById("engine-panel").setAttribute("aria-labelledby", "engine-tab-" + engineState.selected);
}

for (const number of [1, 2]) {
    const tab = document.getElementById("engine-tab-" + number);
    tab.addEventListener("click", () => selectEngine(number));
    tab.addEventListener("keydown", event => {
        let target;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") target = number === 1 ? 2 : 1;
        else if (event.key === "Home") target = 1;
        else if (event.key === "End") target = 2;
        else return;
        event.preventDefault();
        selectEngine(target);
        document.getElementById("engine-tab-" + target).focus();
    });
}
const engineCalculateButton = document.getElementById("calculate-btn");
engineCalculateButton.removeEventListener("click", calculate);
engineCalculateButton.addEventListener("click", calculateSelectedEngine);
saveEngineInputs();

renderEngineTabs();
renderEngineResults();
