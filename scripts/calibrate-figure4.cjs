// Reproduce Figure 4 calibration from the local PDF; no network or PDF changes.
// Default: verify the JSON. Use --write explicitly to regenerate it.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = 'reference/SEI-671_Change3_8_8_2019 (701C AH-64D).pdf';
const target = path.join(root, 'data/figure-4-tgtref.json');
const pdf = fs.readFileSync(path.join(root, source));
const contents = [...pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .flatMap(match => {
        try { return [zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1')]; }
        catch { return []; }
    });
const page = contents.find(text => text.includes('528.36 506.52 cm') && text.includes('128.58 358.62 cm'));
assert.ok(page, 'Expected Figure 4 vector content not found; review the source PDF.');
// Major grid-line centre coordinates, read from Figure 4 graphics operators.
const xTicks = [128.58,151.02,173.52,196.02,218.46,240.96,263.4,285.9,308.34,330.84,353.28,375.78,398.22,420.72,443.22,465.66,488.1,510.6,533.1];
const yTicks = [358.62,387.6,416.58,445.56,474.54,503.58,532.56,561.54,590.58,619.56,648.54,677.52,706.56];
for (const x of xTicks) assert.ok(page.includes(`1 0 0 1 ${x} `));
for (const y of yTicks) assert.ok(page.includes(` ${y} cm`) || y === 387.6);
assert.ok(page.includes('0 28.98 cm'), 'The second FAT major line is translated from 358.62 by 28.98.');
function fit(ticks, first, step) {
    const meanX = ticks.reduce((sum, x) => sum + x, 0) / ticks.length;
    const meanY = first + step * (ticks.length - 1) / 2;
    const scale = ticks.reduce((sum, x, i) => sum + (x - meanX) * (first + step * i - meanY), 0)
        / ticks.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
    const offset = meanY - scale * meanX;
    return { scale, offset, ticks: ticks.map((pdf_coordinate, i) => ({ pdf_coordinate, value: first + step * i })),
        max_residual_c: Math.max(...ticks.map((x, i) => Math.abs(scale * x + offset - first - step * i))) };
}
const tgt = fit(xTicks, 510, 20), fat = fit(yTicks, -60, 10);
const region = page.slice(page.indexOf('q 1 0 0 1 528.36 506.52 cm'), page.indexOf('0 j .36 w'));
const curves = [];
let x = 0, y = 0, segments, previous;
// Coordinates in this source use hundredths of a PDF point. Accumulate integer
// source units to preserve exact decimal translations, not rounded chart units.
const units = value => {
    assert.match(value, /^-?\d*(?:\.\d{1,2})?$/);
    const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
    return (value.startsWith('-') ? -1 : 1) * (Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
};
for (const line of region.split('\n')) {
    let match = line.match(/(?:q|S) 1 0 0 1 ([\d.-]+) ([\d.-]+) cm 0 0 m/);
    if (match) {
        x += units(match[1]); y += units(match[2]);
        segments = []; curves.push(segments); previous = [x, y];
    }
    match = line.match(/^([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) c$/);
    if (match) {
        const values = match.slice(1).map(units);
        const segment = [previous, [x + values[0], y + values[1]], [x + values[2], y + values[3]], [x + values[4], y + values[5]]];
        segments.push(segment); previous = segment[3];
    }
}
assert.equal(curves.length, 11);
assert.equal(curves.reduce((sum, curve) => sum + curve.length, 0), 25);
const original = JSON.parse(fs.readFileSync(target, 'utf8'));
const result = { ...original, digitization: {
    source_file: source, source_sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
    printed_page: '0125 00-9', figure: 4, page_change_marking: 'Change 2',
    method: 'Independent ordinary least-squares affine fits to 19 TGTREF and 13 FAT major grid-line centres. Chart coordinates are [TGTREF degC, FAT degC]. Original cubic paths and all control points are retained; no decimal-place truncation is applied.',
    calibration: { tgtref_c: tgt, fat_c: fat },
    source_geometry: 'pdf_segments contain absolute [x,y] coordinates in PDF points, including all control points; these are source coordinates, not sampled chart values.',
    limit_provenance: 'Figure 4, printed page 0125 00-9: curves labelled 2 through 10 terminate at the DE TGT LIMIT TEMP line; SL and 1 terminate near FAT +55 instead. hot_end_on_tgt_limit records that source classification, not a numerical proximity tolerance. The 866 degC rule is in printed page 0125 00-6, section 18.b.(1) NOTE.',
    limitations: 'Calibration residuals and numerical solver tolerance are not source accuracy. The published example uses 728 degC; do not alter the curve to force agreement. Interpolation with only one limited neighbouring PA curve remains pending verification.'
}, curves: curves.reverse().map((segments, i) => ({
    pa_ft: i * 1000,
    hot_end_on_tgt_limit: i >= 2,
    segments: segments.map(segment => segment.map(([x, y]) => [tgt.scale * (x / 100) + tgt.offset, fat.scale * (y / 100) + fat.offset])),
    pdf_segments: segments.map(segment => segment.map(point => point.map(value => value / 100)))
})) };
if (process.argv.includes('--write')) fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
else assert.deepEqual(original, result, 'Figure 4 JSON differs from reproducible PDF calibration.');
console.log('Verified Figure 4: 11 curves, 25 cubic segments, 19/13 calibration ticks.');
