const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const data = JSON.parse(read('data/figure-4-tgtref.json'));
const code = read('js/interpolation.js');
const context = vm.createContext({});
vm.runInContext(code, context);
const evaluate = (pa, fat) => context.calculateFigure4TgtRef(data, fat, pa);
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('dataset reproduces the PDF vectors and all calibration ticks', () => {
    execFileSync(process.execPath, ['scripts/calibrate-figure4.cjs'], { cwd: root });
    assert.equal(data.curves.length, 11);
    assert.equal(data.curves.reduce((n, c) => n + c.segments.length, 0), 25);
});

test('solver recovers known points on every source segment, including joins', () => {
    for (const curve of data.curves) {
        for (const segment of curve.segments) {
            for (const t of [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1]) {
                const point = context.pointOnBezier(segment, t);
                // Source-classified hot-end limits are tested separately.
                if (point.fat >= context.hotEndOfCurve(curve).fat) continue;
                near(evaluate(curve.pa_ft, point.fat).tgtref, Math.min(point.tgtref, 866));
            }
        }
    }
});

test('3038 ft retains its exact interpolation weight and decimal FAT', () => {
    for (const fat of [-16, -15.8, 0, 20]) {
        const lower = evaluate(3000, fat).tgtref;
        const upper = evaluate(4000, fat).tgtref;
        const result = evaluate(3038, fat);
        assert.equal(result.lowerPA, 3000);
        assert.equal(result.upperPA, 4000);
        near(result.tgtref, lower + 0.038 * (upper - lower));
        assert.notEqual(result.tgtref, lower);
    }
});

test('exact PA evaluates only its own curve, even if a neighbour is unavailable', () => {
    const custom = JSON.parse(JSON.stringify(data));
    custom.curves.find(c => c.pa_ft === 5000).segments = [];
    const result = context.calculateFigure4TgtRef(custom, -16, 6000);
    assert.equal(result.lowerPA, 6000);
    assert.equal(result.upperPA, 6000);
    near(result.tgtref, evaluate(6000, -16).tgtref);
});

test('out-of-coverage FAT is rejected instead of substituting an endpoint', () => {
    for (const pa of [0, 1000, 6000, 10000]) {
        assert.throws(() => evaluate(pa, -60), /outside the digitized/);
    }
    for (const pa of [0, 1000]) assert.throws(() => evaluate(pa, 60), /outside the digitized/);
    assert.equal(evaluate(6000, 40).tgtref, 866);
    for (const [pa, fat] of [[-1, 0], [10001, 0], [NaN, 0], [6000, NaN], [6000, 61]]) {
        assert.throws(() => evaluate(pa, fat));
    }
});

test('published example discrepancy is recorded, never forced to 728', () => {
    const raw = evaluate(6000, -16).tgtref;
    near(raw, 728.1983047248461);
    assert.equal(Math.round(raw), 728);
    assert.notEqual(raw, 728);
});

test('866 applies only to source-confirmed limit endpoints, with no proximity tolerance', () => {
    for (const curve of data.curves) {
        const hot = context.hotEndOfCurve(curve);
        if (curve.hot_end_on_tgt_limit) {
            assert.equal(evaluate(curve.pa_ft, hot.fat).tgtref, 866);
            assert.equal(evaluate(curve.pa_ft, hot.fat + 0.01).tgtref, 866);
        } else {
            near(evaluate(curve.pa_ft, hot.fat).tgtref, hot.tgtref);
            assert.throws(() => evaluate(curve.pa_ft, hot.fat + 0.01), /No verified/);
        }
        const cold = Math.min(...curve.segments.flatMap(s => [s[0][1], s[3][1]]));
        assert.ok(Number.isFinite(evaluate(curve.pa_ft, cold).tgtref));
        assert.throws(() => evaluate(curve.pa_ft, cold - 0.01), /No verified/);
    }
    const unverified = JSON.parse(JSON.stringify(data.curves[6]));
    delete unverified.hot_end_on_tgt_limit;
    assert.throws(() => context.tgtRefOnCurve(unverified, 40), /No verified/);
});

test('mixed-limit interpolation is diagnostic only', () => {
    const lower = evaluate(3000, 44).tgtref;
    const upper = evaluate(4000, 44).tgtref;
    assert.ok(lower < 866);
    assert.equal(upper, 866);
    const result = evaluate(3038, 44);
    assert.equal(result.status, 'unverified_mixed_limit');
    assert.equal(result.tgtref, null);
    near(result.diagnosticTgtRef, lower + 0.038 * (upper - lower));
});

test('all nine adjacent pairs detect mixed limits without a FAT threshold table', () => {
    for (let i = 1; i < 10; i++) {
        const lower = data.curves[i], upper = data.curves[i + 1];
        const fat = (context.hotEndOfCurve(lower).fat + context.hotEndOfCurve(upper).fat) / 2;
        const pa = (lower.pa_ft + upper.pa_ft) / 2;
        const result = evaluate(pa, fat);
        assert.equal(result.status, 'unverified_mixed_limit', `pair ${lower.pa_ft}/${upper.pa_ft}`);
        assert.equal(result.tgtref, null);
        assert.equal(result.lowerLimitState, 'unlimited');
        assert.notEqual(result.upperLimitState, 'unlimited');
        near(result.diagnosticTgtRef, (result.lowerTgtRef + result.upperTgtRef) / 2);
        for (const curve of [lower, upper]) {
            assert.equal(evaluate(curve.pa_ft, fat).status, 'available');
        }
        const ordinary = evaluate(pa, -16);
        // -16 lies below every hot endpoint in these pairs.
        assert.equal(ordinary.status, 'available');
        assert.equal(ordinary.lowerLimitState, 'unlimited');
        assert.equal(ordinary.upperLimitState, 'unlimited');
        if (lower.hot_end_on_tgt_limit) {
            const both = evaluate(pa, context.hotEndOfCurve(lower).fat + 0.01);
            assert.equal(both.status, 'available');
            assert.equal(both.tgtref, 866);
        }
    }
});

test('numeric intersection and source termination remain distinct', () => {
    const crossing = data.curves.find(c => c.pa_ft === 4000);
    const hot = context.hotEndOfCurve(crossing);
    // A point still inside this curve is already above numeric 866.
    assert.equal(context.evaluateFigure4Curve(crossing, hot.fat - 0.01).limitState, 'mathematical_intersection');
    const terminating = data.curves.find(c => c.pa_ft === 6000);
    const end = context.hotEndOfCurve(terminating);
    assert.ok(end.tgtref < 866);
    assert.equal(context.evaluateFigure4Curve(terminating, end.fat - 0.01).limitState, 'unlimited');
    assert.equal(context.evaluateFigure4Curve(terminating, end.fat).limitState, 'source_termination');
    assert.equal(evaluate(3500, hot.fat - 0.01).status, 'unverified_mixed_limit');
});

function runCalculator(overrides = {}, calculatorCode = read('js/calculator.js'), expectBlocked = false) {
    const values = { fat: '-16', pa: '6000', kias: '130', trq: '100', tgt: '736', ng: '99', ...overrides };
    const elements = {};
    for (const [id, value] of Object.entries(values)) elements[id] = { value };
    let debug;
    let downstreamCalls = 0;
    const alerts = [];
    const browser = vm.createContext({
        document: { getElementById(id) { return elements[id] ??= { textContent: 'stale result', addEventListener() {} }; } },
        fetch: () => new Promise(() => {}),
        alert(message) { if (expectBlocked) alerts.push(message); else throw Error(message); },
        ETF_ATF_DEBUG: true, console: { log(label, details) { if (label === 'Calculation debug:') debug = details; }, error() {} }
    });
    vm.runInContext(code, browser);
    vm.runInContext(calculatorCode, browser);
    for (const [variable, file] of [
        ['figure1Data', 'data/figure-1-tsf.json'], ['figure4Data', 'data/figure-4-tgtref.json'],
        ['figure5Data', 'data/figure-5-dtrq-dtgt.json'], ['figure7Data', 'data/figure-7-ttv.json'],
        ['figure8Data', 'data/figure-8-etf.json']
    ]) vm.runInContext(`${variable} = ${read(file)};`, browser);
    if (expectBlocked) {
        for (const name of ['calculateFigure5DeltaFactor', 'calculateFigure7TTV', 'calculateFigure8ETF']) {
            browser[name] = () => { downstreamCalls++; throw Error('Unexpected downstream calculation'); };
        }
    }
    vm.runInContext('calculate()', browser);
    return { debug, elements, alerts, downstreamCalls };
}

test('unverified PA/FAT cannot produce or retain final performance results', () => {
    for (const [pa, fat] of [[3038, 44], [3500, 44], [6500, 25], [9500, -5]]) {
        const result = evaluate(pa, fat);
        assert.equal(result.status, 'unverified_mixed_limit');
        assert.equal(result.tgtref, null);
        assert.ok(Number.isFinite(result.diagnosticTgtRef));
        const run = runCalculator({ pa: String(pa), fat: String(fat) }, read('js/calculator.js'), true);
        assert.equal(run.downstreamCalls, 0);
        assert.equal(run.debug, undefined);
        assert.equal(run.alerts.length, 1);
        assert.match(run.alerts[0], /Unverified Figure 4.*approved SEI/);
        for (const id of ['result-tgtref', 'result-delta-tgt', 'result-trqadj', 'result-ttv', 'result-str', 'result-etf']) {
            assert.equal(run.elements[id].textContent, '---');
        }
    }
});

test('calculator uses approved chart readings and 0.001 arithmetic', () => {
    const { debug, elements } = runCalculator();
    assert.equal(debug.figure4.lowerPA, 6000);
    near(debug.figure4.rawTgtRef, 728.1983047248461);
    assert.equal(debug.figure4.usedTgtRef, 728);
    assert.equal(debug.figure4.displayedTgtRef, '728');
    assert.equal(elements['result-tgtref'].textContent, '728 °C');
    assert.equal(debug.deltaTgt, -8);
    assert.equal(elements['result-delta-tgt'].textContent, '-8 °C');
    assert.equal(elements['result-trqadj'].textContent, '97.640 %');
});

test('display formatting cannot feed back into any numeric or downstream result', () => {
    const formatted = read('js/calculator.js');
    const decimalDisplay = formatted
        .replace('tgtRefUsed.toFixed(0)', 'tgtRefUsed.toFixed(3)')
        .replace('Number.isInteger(deltaTgt) ? deltaTgt.toFixed(0) : deltaTgt.toFixed(3)', 'deltaTgt.toFixed(3)');
    const sentinelDisplay = formatted
        .replace('tgtRefUsed.toFixed(0)', '"999"')
        .replace('Number.isInteger(deltaTgt) ? deltaTgt.toFixed(0) : deltaTgt.toFixed(3)', '"999"');
    assert.notEqual(decimalDisplay, formatted);
    assert.notEqual(sentinelDisplay, formatted);
    for (const values of [{}, { pa: '3038', fat: '-15.8', tgt: '683' }, { fat: '40', tgt: '866' }]) {
        const actual = runCalculator(values, formatted);
        for (const alternative of [decimalDisplay, sentinelDisplay]) {
            const reference = runCalculator(values, alternative);
            const numericDebug = value => {
                const copy = JSON.parse(JSON.stringify(value));
                delete copy.figure4.displayedTgtRef;
                return copy;
            };
            assert.deepEqual(numericDebug(actual.debug), numericDebug(reference.debug));
            for (const id of ['result-trqadj', 'result-ttv', 'result-str', 'result-etf']) {
                assert.equal(actual.elements[id].textContent, reference.elements[id].textContent);
            }
        }
    }
});

// Figure 5 was intentionally recalibrated in its own Phase 1; its source
// fidelity and solver are covered by figure5.test.cjs. Figure 4 integration
// above continues to assert the same TGTREF, delta TGT and downstream results.
