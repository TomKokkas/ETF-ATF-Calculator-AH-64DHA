const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {extractFigure8}=require('../scripts/calibrate-figure8.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const data=JSON.parse(read('data/figure-8-etf.json')),code=read('js/interpolation.js');
const ctx=vm.createContext({});vm.runInContext(code,ctx);
const evaluate=(fat,str)=>ctx.calculateFigure8ETF(data,str,fat);
const near=(a,b,e=1e-11)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);

test('18 original PDF strokes and nine labels reproduce without merged geometry',()=>{
    execFileSync(process.execPath,['scripts/calibrate-figure8.cjs'],{cwd:root});
    const source=extractFigure8();
    assert.equal(data.paths.length,18);assert.equal(data.fat_labels.length,9);
    assert.deepEqual(data.paths,source.paths);
    assert.deepEqual(source.paths[0].pdf_points,[[144.78,572.28],[118.68,557.28]]);
    assert.equal(source.etf.ticks.length,4);assert.equal(source.str.ticks.length,7);
    assert.ok(source.etf.max_residual<source.fullAxisSensitivity.max_residual);
    for(const label of data.fat_labels)assert.equal(data.paths.filter(p=>p.fat_c===label.fat_c).length,2);
});

test('linear evaluation matches independent PDF-coordinate evaluation on every stroke',()=>{
    const source=extractFigure8();
    for(const p of source.paths)for(const t of [0,.01,.25,.5,.75,.99,1]) {
        const [a,b]=p.pdf_points;
        const expected=source.etf.scale*(a[0]+t*(b[0]-a[0]))+source.etf.offset;
        const str=t===0?p.points[0][1]:t===1?p.points[1][1]:source.str.scale*(a[1]+t*(b[1]-a[1]))+source.str.offset;
        const r=ctx.etfOnLine(data,p.fat_c,str);
        assert.equal(r.status,'available');near(r.etf,expected);
    }
});

test('all nine approved gaps interpolate inner endpoints, preserving exact endpoints and continuity',()=>{
    for(const label of data.fat_labels) {
        const pieces=data.paths.filter(p=>p.fat_c===label.fat_c).map(p=>p.points.map(p=>p[1]).sort((a,b)=>a-b)).sort((a,b)=>a[0]-b[0]);
        const str=(pieces[0][1]+pieces[1][0])/2;
        const r=evaluate(label.fat_c,str);
        assert.equal(r.status,'available');assert.equal(r.basis,'label_gap_interpolation');
        assert.equal(data.label_gap_policy,'inner_endpoint_interpolation');
        const points=data.paths.filter(p=>p.fat_c===label.fat_c).flatMap(p=>p.points);
        const a=points.find(p=>p[1]===pieces[0][1]),b=points.find(p=>p[1]===pieces[1][0]);
        near(r.etf,(a[0]+b[0])/2);
        for(const t of [.000001,.1,.9,.999999])near(evaluate(label.fat_c,a[1]+t*(b[1]-a[1])).etf,a[0]+t*(b[0]-a[0]));
        for(const p of [a,b]) {
            const endpoint=evaluate(label.fat_c,p[1]);assert.equal(endpoint.basis,'source_stroke');assert.equal(endpoint.etf,p[0]);
            near(evaluate(label.fat_c,p[1]-1e-10).etf,p[0],1e-8);
            near(evaluate(label.fat_c,p[1]+1e-10).etf,p[0],1e-8);
        }
    }
});

test('true lower endpoints are available; values below coverage are not clamped or extended',()=>{
    for(const label of data.fat_labels) {
        const points=data.paths.filter(p=>p.fat_c===label.fat_c).flatMap(p=>p.points);
        const low=points.reduce((a,b)=>a[1]<b[1]?a:b);
        near(evaluate(label.fat_c,low[1]).etf,low[0]);
        const outside=evaluate(label.fat_c,low[1]-1e-8);
        assert.equal(outside.status,'unverified_coverage');assert.equal(outside.etf,null);
    }
});

test('finite validation precedes all three explicit SEI rules',()=>{
    for(const fat of [NaN,Infinity,-Infinity])for(const str of [.98,1,1.1])assert.throws(()=>evaluate(fat,str),/finite/);
    for(const str of [NaN,Infinity,-Infinity])for(const fat of [-16,35,100])assert.throws(()=>evaluate(fat,str),/finite/);
});

test('inclusive FAT limits use -5 and 35; inclusive STR rule returns exactly one',()=>{
    for(const fat of [-1000,-16,-5])near(evaluate(fat,.98).etf,evaluate(-5,.98).etf);
    for(const fat of [35,35.001,1000])near(evaluate(fat,.98).etf,evaluate(35,.98).etf);
    for(const fat of [-1000,-5,2.5,35,1000])for(const str of [1,1.001,2]) {
        const r=evaluate(fat,str);assert.equal(r.etf,1);assert.equal(r.basis,'sei_str_rule');
    }
    assert.ok(evaluate(-5,.999999).etf<1);
});

test('existing FAT interpolation is retained only when both real reference strokes cover STR',()=>{
    const a=evaluate(0,.98).etf,b=evaluate(5,.98).etf;
    near(evaluate(2.5,.98).etf,(a+b)/2);
    near(evaluate(0.001,.98).etf,a+.001/5*(b-a));
    const gap=evaluate(-2.5,.925);assert.equal(gap.status,'available');assert.equal(gap.basis,'fat_interpolation');
    assert.equal(gap.lowerBasis,'label_gap_interpolation');assert.equal(gap.upperBasis,'source_stroke');
    assert.equal(gap.usesLabelGapInterpolation,true);near(gap.etf,(evaluate(-5,.925).etf+evaluate(0,.925).etf)/2);
    const edge=evaluate(-.1,.905);assert.equal(edge.etf,null);
    assert.equal(edge.lowerStatus,'unverified_coverage');
});

test('published -16/0.98 example agrees at published two-decimal reading and calculation 0.001',()=>{
    const r=evaluate(-16,.98);near(r.etf,.9310831964580408);
    assert.equal(r.etf.toFixed(2),'0.93');
    const round3=require('./helpers/round3.cjs').loadRound3(read('js/calculator.js'));
    assert.equal(round3(r.etf),.931);
});

function run(trq='100',calculator=read('js/calculator.js')) {
    const elements={};for(const [id,value]of Object.entries({fat:'-16',pa:'6000',kias:'130',trq,tgt:'736',ng:'99'}))elements[id]={value};
    const alerts=[];let debug;
    const browser=vm.createContext({document:{getElementById(id){return elements[id]??={textContent:'stale',addEventListener(){}}}},fetch:()=>new Promise(()=>{}),alert:m=>alerts.push(m),ETF_ATF_DEBUG: true, console:{error(){},log(l,v){if(l==='Calculation debug:')debug=v}}});
    vm.runInContext(code,browser);vm.runInContext(calculator,browser);
    for(const [v,p]of [['figure1Data','figure-1-tsf'],['figure4Data','figure-4-tgtref'],['figure5Data','figure-5-dtrq-dtgt'],['figure7Data','figure-7-ttv'],['figure8Data','figure-8-etf']])vm.runInContext(`${v}=${read('data/'+p+'.json')}`,browser);
    vm.runInContext('calculate()',browser);return {elements,alerts,debug};
}

test('whole calculator preserves upstream arithmetic and rounds raw ETF independently for display',()=>{
    const r=run();assert.deepEqual(r.alerts,[]);
    assert.equal(r.debug.figure4.usedTgtRef, 728);assert.equal(r.debug.deltaTgt, -8);
    assert.equal(r.debug.figure7.ttv,100);assert.equal(r.debug.str, .976);
    assert.equal(r.elements['result-trqadj'].textContent,'97.640 %');assert.equal(r.elements['result-etf'].textContent,'0.92');
    near(r.debug.figure8.rawEtf,.9173094674305006);
});

test('approved label gap produces rounded ETF in the calculator',()=>{
    const r=run('94.773');assert.deepEqual(r.alerts,[]);
    assert.equal(r.debug.str,.925);assert.equal(r.elements['result-etf'].textContent,'0.74');
});

test('unapproved gaps, altered endpoint references and overlaps are never bridged',()=>{
    const clone=()=>JSON.parse(JSON.stringify(data));
    const low=data.paths[0],high=data.paths[1],str=(low.points[0][1]+high.points[1][1])/2;
    let d=clone();d.paths[0].pdf_points[0][0]+=.01;
    assert.equal(ctx.calculateFigure8ETF(d,str,-5).etf,null);
    d=clone();d.paths[0].id='unreviewed';assert.equal(ctx.calculateFigure8ETF(d,str,-5).etf,null);
    d=clone();d.paths.push({...d.paths[0],id:'extra'});assert.equal(ctx.calculateFigure8ETF(d,str,-5).etf,null);
    d=clone();d.paths[1].points[1]=[.8,low.points[0][1]-.001];
    assert.equal(ctx.calculateFigure8ETF(d,low.points[0][1]-.0005,-5).status,'unverified_ambiguous');
});

test('unsupported coverage still stops final results',()=>{
    const r=run('60');assert.equal(r.alerts.length,1);assert.match(r.alerts[0],/No verified Figure 8 ETF/);
    assert.equal(r.debug,undefined);
    for(const id of ['result-ttv','result-str','result-etf','result-trqadj'])assert.equal(r.elements[id].textContent,'---');
});

test('Figures 4/5/7 and the uncommitted Figure 7 artifacts remain unchanged',()=>{
    const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
    const normalized=code.replace(/\r\n/g,'\n');
    assert.equal(hash(normalized.slice(0,normalized.indexOf('/*\n * FIGURE 8'))),'25dffc20a1a75f11c535f99ad686da052c82f25dafea965c9378f32c200da71b');
    for(const [p,h]of [
        ['data/figure-7-ttv.json','1015449ac6c20d50f3960d352740535e4f59a2002ecaf424b368ec679e5f7dd6'],
        ['docs/figure-7-phase-1.md','e9c71521de0703055305a6c5e3d22fbdedf5c4d5304bcf837dc130af280f374d'],
        ['scripts/calibrate-figure7.cjs','72b8b3c405d6e096e248f673aa629a18bd507b74d2ecbbb8e6162e4912f3e8a2'],
        ['tests/figure7.test.cjs','055e1393489ebdab5926a4f9baad271cc802a78259bd134b8a3c8376f41fdf41']
    ])assert.equal(hash(fs.readFileSync(path.join(root,p))),h);
});
