const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = 'reference/SEI-671_Change3_8_8_2019 (701C AH-64D).pdf';
const target = path.join(root, 'data/figure-7-ttv.json');

function extractFigure7() {
    const pdf = fs.readFileSync(path.join(root, source));
    const streams = [...pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(m => {
        try { return [zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')]; }
        catch { return []; }
    });
    const page = streams.find(s => s.includes('455.64 687.18 cm') && s.includes('474.12 262.98 cm'));
    assert.ok(page, 'Figure 7 source vectors not found. Review source revision.');
    assert.ok(page.includes('<0036002f>'), 'Expected SL label not found.');
    // Integer hundredths preserve the source decimal graphics operations.
    const units = value => {
        assert.match(value, /^-?\d*(?:\.\d{1,2})?$/);
        const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
        return (value.startsWith('-') ? -1 : 1) * (Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
    };
    function parse(region, prefix) {
        let x = 0, y = 0, current, previous;
        const paths = [];
        for (const line of region.split('\n')) {
            let m = line.match(/(?:q|S) 1 0 0 1 ([\d.-]+) ([\d.-]+) cm 0 0 m/);
            if (m) {
                x += units(m[1]); y += units(m[2]); previous = [x,y];
                current = { id: `${prefix}-${paths.length + 1}`, segments: [] }; paths.push(current);
            }
            m = line.match(/^([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) c$/);
            if (m) {
                const v = m.slice(1).map(units);
                const p = [previous,[x+v[0],y+v[1]],[x+v[2],y+v[3]],[x+v[4],y+v[5]]];
                current.segments.push({ type: 'bezier', pdf_points: p.map(p => p.map(v => v / 100)) }); previous = p[3];
            }
            m = line.match(/^([\d.-]+) ([\d.-]+) l$/);
            if (m) {
                const p = [previous,[x+units(m[1]),y+units(m[2])]];
                current.segments.push({ type: 'line', pdf_points: p.map(p => p.map(v => v / 100)) }); previous = p[1];
            }
        }
        return paths;
    }
    const cubicStart = page.indexOf('q 1 0 0 1 455.64 687.18 cm');
    const lineStart = page.indexOf('q 1 0 0 1 474.12 262.98 cm');
    const cubicPaths = parse(page.slice(cubicStart, page.indexOf('S\nQ\n0 j', cubicStart)), 'cubic');
    const linePaths = parse(page.slice(lineStart, page.indexOf('S\nQ\n1 G', lineStart)), 'straight');
    const limitA = page.indexOf('q 1 0 0 1 480.6 687.18 cm');
    const limitB = page.indexOf('q 1 0 0 1 480.6 263.28 cm');
    const limitPaths = [
        ...parse(page.slice(limitA, page.indexOf('S\nQ', limitA)), 'limit-a'),
        ...parse(page.slice(limitB, page.indexOf('S\nQ', limitB)), 'limit-b')
    ];
    assert.equal(cubicPaths.length, 9);
    assert.equal(cubicPaths.flatMap(p => p.segments).length, 24);
    assert.equal(linePaths.flatMap(p => p.segments).length, 15);
    assert.equal(limitPaths.length, 2);
    const xTicks = [133.32,171.9,210.48,249.06,287.64,326.22,364.74,403.32,441.9,480.48,519.06];
    const yTicks = [243.9,282.48,321,359.58,398.16,436.68,475.26,513.78,552.36,590.88,629.46,668.04,706.56];
    for (const x of xTicks.slice(0,-1)) assert.ok(page.includes(`1 0 0 1 ${x} `));
    assert.ok(page.includes('385.74 0 l')); // right frame: 133.32 + 385.74
    for (const y of yTicks) assert.ok(page.includes(` ${y} cm`));
    function fit(ticks, start, step) {
        const mean = ticks.reduce((a,b) => a+b) / ticks.length, meanValue = start + step * (ticks.length-1) / 2;
        const scale = ticks.reduce((s,x,i) => s+(x-mean)*(start+i*step-meanValue),0) / ticks.reduce((s,x) => s+(x-mean)**2,0);
        const offset = meanValue-scale*mean;
        return { scale, offset, ticks: ticks.map((pdf_coordinate,i) => ({pdf_coordinate,value:start+i*step})),
            max_residual: Math.max(...ticks.map((x,i) => Math.abs(scale*x+offset-start-i*step))) };
    }
    const ttv = fit(xTicks,55,5), fat = fit(yTicks,-60,10);
    for (const p of [...cubicPaths,...linePaths,...limitPaths]) for (const s of p.segments) {
        s.points = s.pdf_points.map(([x,y]) => [ttv.scale*x+ttv.offset,fat.scale*y+fat.offset]);
    }
    return { cubicPaths,linePaths,limitPaths,ttv,fat,sha256:crypto.createHash('sha256').update(pdf).digest('hex') };
}

function buildDataset() {
    const s = extractFigure7();
    // Mapping follows PA labels in Figure 7; PDF drawing order is not PA order.
    const cubicPA = [2000,3000,5000,4000,6000,7000,8000,9000,10000];
    const straightPA = [8000,9000,9000,8000,7000,6000,5000,4000,3000];
    s.cubicPaths.forEach((p,i) => p.pa_ft=cubicPA[i]);
    s.linePaths.forEach((p,i) => p.pa_ft=straightPA[i]);
    const bounds = paths => {
        const values = paths.flatMap(p => p.segments.flatMap(s => [s.points[0][1],s.points.at(-1)[1]]));
        return { min:Math.min(...values),max:Math.max(...values) };
    };
    const common = bounds(s.limitPaths);
    const regions = [];
    for (let pa=2000;pa<=9000;pa+=1000) {
        const hotPath = pa===2000 ? s.cubicPaths[0] : s.linePaths.find((p,i) => p.pa_ft===pa && (pa<8000 || i>=2));
        const hotBoundary = pa===2000 ? hotPath.segments.at(-1).points.at(-1)[1] : hotPath.segments[0].points[0][1];
        const tail = pa>=8000 ? s.linePaths.find((p,i) => i<2 && p.pa_ft===pa) : null;
        const coldBoundary = tail ? tail.segments.at(-1).points.at(-1)[1] : common.min;
        regions.push({ pa_ft:pa, fat_min:Math.max(common.min,coldBoundary), fat_max:Math.min(common.max,hotBoundary),
            warm_boundary_path:hotPath.id,cold_boundary_path:tail?.id ?? 'shared-limit',
            basis:'Figure 7 continuation along the labelled 100% Q TRANS LIMIT between the source branch endpoints; no connector geometry is added.' });
    }
    return {
        figure:7,name:'Determining Target Torque Value (TTV)',source:'SEI-671 Change 3',engine:['T701C','T701D/CC','T701D/DC'],
        conditions:{kias:110,np_percent:101},
        operating_range:{ fat_c:{min:-55,max:55},ttv_percent:{min:66,max:100},pressure_altitude_ft:{min:0,max:10000} },
        source_axes:{ttv_percent:{min:55,max:105},fat_c:{min:-60,max:60}},
        paths:[...s.cubicPaths,...s.linePaths],
        shared_limit:{ label:'100% Q TRANS LIMIT',value_percent:100,paths:s.limitPaths,
            sl_1:{ label:'SL-1',pa_min:0,pa_max:1000,fat_min:common.min,fat_max:common.max,
                evidence:'Figure 7 labels Pressure Altitude in 1000 FT, lists 2 through 10 separately, and uses the combined label SL-1 on the common limit. SL denotes Sea Level; 1 is 1000 ft. This is chart-context interpretation, not a separate explanatory sentence in section 18.c.' },
            pa_regions:regions },
        digitization:{source_file:source,source_sha256:s.sha256,printed_page:'0125 00-13',page_change_marking:'Change 2',drawing:'1156938-01',
            calibration:{ttv_percent:s.ttv,fat_c:s.fat},
            method:'Independent least-squares affine calibration using 11 TTV and 13 FAT major grid lines. 24 original cubics, 15 separate straight segments and 2 shared-limit lines retain all original control points. Source translations use exact integer hundredths of PDF points; no decimal-place truncation or artificial joins.',
            limitations:'Operating ranges are calculator policy, not PDF axis extents. Source gaps/overlaps and boundary conflicts remain unresolved. Shared limit relationships interpret chart labels; they are not new geometric paths. Numerical precision is not certified SEI accuracy.'}
    };
}
if (require.main===module) {
    const result=buildDataset();
    if(process.argv.includes('--write')) fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');
    else assert.deepEqual(JSON.parse(fs.readFileSync(target,'utf8')),result);
    console.log('Verified Figure 7: 24 cubics, 15 straight segments, 2 shared-limit lines; 11/13 calibration ticks.');
}
module.exports={extractFigure7,buildDataset};
