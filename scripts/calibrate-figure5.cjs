const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = 'reference/SEI-671_Change3_8_8_2019 (701C AH-64D).pdf';
const target = path.join(root, 'data/figure-5-dtrq-dtgt.json');

function extractFigure5() {
    const pdf = fs.readFileSync(path.join(root, source));
    const streams = [...pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(m => {
        try { return [zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')]; }
        catch { return []; }
    });
    const page = streams.find(s => s.includes('114.54 707.1 cm') && s.includes('113.7 468.6 cm'));
    assert.ok(page, 'Expected Figure 5 source vectors not found. Review the PDF revision.');
    const xTicks = [113.7,143.58,173.52,203.4,233.28,263.16,293.1,322.98,352.86,382.8,412.68];
    const yTicks = [468.6,498.36,528.24,558.12,587.94,617.82,647.7,677.52,707.4];
    for (const x of xTicks) assert.ok(page.includes(`1 0 0 1 ${x} `));
    for (const y of yTicks) assert.ok(page.includes(` ${y} cm`));
    function fit(ticks, start, step) {
        const meanX = ticks.reduce((a, b) => a + b) / ticks.length;
        const meanY = start + step * (ticks.length - 1) / 2;
        const scale = ticks.reduce((s, x, i) => s + (x - meanX) * (start + step * i - meanY), 0)
            / ticks.reduce((s, x) => s + (x - meanX) ** 2, 0);
        const offset = meanY - scale * meanX;
        return { scale, offset, ticks: ticks.map((pdf_coordinate, i) => ({ pdf_coordinate, value: start + step * i })),
            max_residual: Math.max(...ticks.map((x, i) => Math.abs(scale * x + offset - start - step * i))) };
    }
    const pa = fit(xTicks, 0, 1000), factor = fit(yTicks, 0, 0.05);
    const region = page.slice(page.indexOf('q 1 0 0 1 114.54 707.1 cm')).split('\nS\n')[0];
    const hundredths = value => {
        assert.match(value, /^-?\d*(?:\.\d{1,2})?$/);
        const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
        return (value.startsWith('-') ? -1 : 1) * (Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
    };
    const raw = [];
    let previous = [11454,70710];
    for (const m of region.matchAll(/^([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) c$/gm)) {
        const v = m.slice(1).map(hundredths);
        const segment = [previous, [11454 + v[0], 70710 + v[1]], [11454 + v[2], 70710 + v[3]], [11454 + v[4], 70710 + v[5]]];
        raw.push(segment); previous = segment[3];
    }
    assert.equal(raw.length, 7);
    const pdfSegments = raw.map(s => s.map(p => p.map(v => v / 100)));
    const segments = pdfSegments.map(s => s.map(([x, y]) => [pa.scale * x + pa.offset, factor.scale * y + factor.offset]));
    return { segments, pdfSegments, pa, factor, sha256: crypto.createHash('sha256').update(pdf).digest('hex') };
}

function buildDataset() {
    const old = JSON.parse(fs.readFileSync(target, 'utf8'));
    const sourceData = extractFigure5();
    return { ...old, segments: sourceData.segments,
        curve_coverage_pa_ft: { min: sourceData.segments[0][0][0], max: sourceData.segments.at(-1)[3][0] },
        digitization: {
            source_file: source, source_sha256: sourceData.sha256, printed_page: '0125 00-10', page_change_marking: 'Change 2',
            method: 'Independent ordinary least-squares affine calibration of 11 PA and 9 factor major grid-line centres. All 7 original cubic Bezier segments and control points are retained without smoothing or decimal-place truncation.',
            calibration: { pressure_altitude_ft: sourceData.pa, delta_trq_per_delta_tgt: sourceData.factor },
            pdf_segments: sourceData.pdfSegments,
            limitations: 'Nominal axis range is 0-10000 ft; the source path starts near 28.187 ft and ends near 10004.105 ft. No curve value is inferred below its actual start. Residuals and solver tolerance are not certified source accuracy.',
            previous_discrepancies: 'Previous first PA was moved to 0 ft. Other control-point differences against this calibration were under 1 ft and 0.000047 factor. Do not adjust data to force the published 0.17 example.'
        }
    };
}

if (require.main === module) {
    const result = buildDataset();
    if (process.argv.includes('--write')) fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
    else assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), result);
    console.log('Verified Figure 5: 7 source cubic segments, 11 PA / 9 factor calibration ticks.');
}
module.exports = { extractFigure5 };
