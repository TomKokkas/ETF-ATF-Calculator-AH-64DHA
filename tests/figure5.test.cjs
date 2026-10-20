const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { extractFigure5 } = require('../scripts/calibrate-figure5.cjs');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const data = JSON.parse(read('data/figure-5-dtrq-dtgt.json'));
const code = read('js/interpolation.js');
const ctx = vm.createContext({});
vm.runInContext(code, ctx);
const evaluate = x => ctx.calculateFigure5DeltaFactor(data, x);
const near = (x, y, eps = 1e-10) => assert.ok(Math.abs(x - y) <= eps, `${x} != ${y}`);
const source = extractFigure5();
// Independent de Casteljau evaluation in PDF coordinates, not the production
// Bernstein evaluator or a table of expected rounded factors.
function casteljau(points, t) {
    let values = points.map(p => p.slice());
    while (values.length > 1) values = values.slice(1).map((p, i) => p.map((v, j) => values[i][j] * (1 - t) + v * t));
    return values[0];
}
function pdfFactor(pa) {
    const x = (pa - source.pa.offset) / source.pa.scale;
    const s = source.pdfSegments.find(s => x >= s[0][0] && x <= s[3][0]);
    assert.ok(s);
    let a = 0, b = 1;
    for (let i = 0; i < 60; i++) {
        const t = (a + b) / 2;
        if (casteljau(s, t)[0] < x) a = t; else b = t;
    }
    return source.factor.scale * casteljau(s, (a + b) / 2)[1] + source.factor.offset;
}

test('Figure 5 preserves all seven original paths and reproducible calibration', () => {
    execFileSync(process.execPath, ['scripts/calibrate-figure5.cjs'], { cwd: root });
    assert.equal(data.segments.length, 7);
    assert.deepEqual(source.pdfSegments[0][0], [114.54,707.1]);
    assert.deepEqual(source.pdfSegments.at(-1)[3], [412.8,550.44]);
    assert.deepEqual(data.digitization.pdf_segments, source.pdfSegments);
    near(data.curve_coverage_pa_ft.min, 28.186894608118564, 1e-8);
    near(data.curve_coverage_pa_ft.max, 10004.104714068464, 1e-8);
    assert.equal(source.pa.ticks.length, 11);
    assert.equal(source.factor.ticks.length, 9);
});

test('requested PAs agree with independent PDF evaluation, without input rounding', () => {
    for (const pa of [1000,3000,3038,3050,5000,6000,9000,10000]) {
        const r = evaluate(pa);
        assert.equal(r.status, 'available');
        near(r.matchedPA, pa, 1e-8);
        near(r.factor, pdfFactor(pa));
    }
    assert.notEqual(evaluate(3038).factor, evaluate(3000).factor);
});

test('coverage is distinct from nominal axes; endpoints are not extrapolated', () => {
    const start = data.segments[0][0];
    for (const pa of [0, start[0] / 2, start[0] - 1e-6]) {
        const r = evaluate(pa);
        assert.equal(r.status, 'unverified_coverage');
        assert.equal(r.factor, null);
        assert.equal(r.matchedPA, null);
    }
    near(evaluate(start[0]).factor, start[1]);
    near(evaluate(start[0]).matchedPA, start[0]);
    // The original end is preserved, but remains outside the nominal input range.
    near(casteljau(data.segments.at(-1), 1)[1], data.segments.at(-1)[3][1]);
    for (const pa of [-1,10001,data.curve_coverage_pa_ft.max,NaN,Infinity]) assert.throws(() => evaluate(pa));
});

test('all joins remain intact and numerically continuous', () => {
    for (let i = 1; i < data.segments.length; i++) {
        const p = data.segments[i][0];
        assert.deepEqual(p, data.segments[i - 1][3]);
        near(evaluate(p[0]).factor, p[1]);
        const left = evaluate(p[0] - 1e-5).factor, right = evaluate(p[0] + 1e-5).factor;
        assert.ok(left > p[1] && right < p[1]);
        assert.ok(left - right < 2e-9);
    }
});

test('no nearest-sample plateaus or jump at the former worst-case boundary', () => {
    let previous = Infinity;
    for (let i = -10; i <= 10; i++) {
        const pa = 212.10928137785 + i * 0.001;
        const r = evaluate(pa);
        assert.ok(r.factor < previous);
        near(r.factor, pdfFactor(pa));
        previous = r.factor;
    }
});

function calculate(pa = '6000', calculatorCode = read('js/calculator.js')) {
    const elements = {};
    for (const [id, value] of Object.entries({ pa, fat: '-16', tgt: '736', trq: '100', kias: pa === '0' ? '110' : '130', ng: '99' })) elements[id] = { value };
    let debug, laterCalls = 0;
    const alerts = [];
    const browser = vm.createContext({
        document: { getElementById(id) { return elements[id] ??= { textContent: 'stale', addEventListener() {} }; } },
        fetch: () => new Promise(() => {}), alert: m => alerts.push(m),
        ETF_ATF_DEBUG: true, console: { error() {}, log(label, value) { if (label === 'Calculation debug:') debug = value; } }
    });
    vm.runInContext(code, browser);
    vm.runInContext(calculatorCode, browser);
    for (const [v, p] of [['figure1Data','figure-1-tsf'],['figure4Data','figure-4-tgtref'],['figure5Data','figure-5-dtrq-dtgt'],['figure7Data','figure-7-ttv'],['figure8Data','figure-8-etf']]) vm.runInContext(`${v}=${read('data/' + p + '.json')};`, browser);
    if (pa === '0') for (const name of ['calculateFigure7TTV', 'calculateFigure8ETF']) browser[name] = () => { laterCalls++; throw Error('Unexpected downstream call'); };
    vm.runInContext('calculate()', browser);
    return { debug, elements, alerts, laterCalls };
}

test('published 0.17 example uses 0.170 and correct unformatted delta in TRQADJ', () => {
    near(evaluate(6000).factor, 0.17013767944219452);
    const r = calculate();
    assert.deepEqual(r.alerts, []);
    assert.equal(r.elements['result-delta-factor'].textContent, '0.170');
    assert.equal(r.debug.deltaTgt, -8);
    assert.equal(r.elements['result-trqadj'].textContent, '97.640 %');
    assert.equal(r.elements['result-tgtref'].textContent, '728 °C');
    assert.equal(r.elements['result-delta-tgt'].textContent, '-8 °C');
    const alternative = calculate('6000', read('js/calculator.js').replace('deltaFactor.toFixed(3)', '"999"'));
    assert.equal(alternative.elements['result-delta-factor'].textContent, '999');
    for (const id of ['result-trqadj','result-str','result-etf']) assert.equal(alternative.elements[id].textContent, r.elements[id].textContent);
});

test('unverified coverage blocks all final results and later chart calls', () => {
    const r = calculate('0');
    assert.equal(r.laterCalls, 0);
    assert.equal(r.debug, undefined);
    assert.equal(r.alerts.length, 1);
    assert.match(r.alerts[0], /No verified Figure 5 result.*approved SEI/);
    for (const id of ['result-tgtref','result-delta-factor','result-trqadj','result-str','result-etf']) assert.equal(r.elements[id].textContent, '---');
});

test('Figure 4 algorithm and data and AGENTS.md are byte-preserved', () => {
    const hash = value => crypto.createHash('sha256').update(value).digest('hex');
    const normalized = code.replace(/\r\n/g, '\n');
    assert.equal(hash(normalized.slice(0, normalized.indexOf('/*\n * FIGURE 5'))), '45c376a6b0c5ae639e08cc713866cec5c8fe224b4cf74791a5773b78d20eef5b');
    for (const [p, expected] of [
        ['data/figure-4-tgtref.json','8e9dd0b7a06bd194027bac69a0420caaf95da23fed691a0966aa588f24826289'],
        ['AGENTS.md','bf506b29c17481025ce63a878701acb56cc5d57405992d4729c0411c5d26f696']
    ]) assert.equal(hash(fs.readFileSync(path.join(root, p))), expected);
});
