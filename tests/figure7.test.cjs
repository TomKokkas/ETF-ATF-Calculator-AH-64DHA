const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {extractFigure7}=require('../scripts/calibrate-figure7.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const data=JSON.parse(read('data/figure-7-ttv.json')),code=read('js/interpolation.js');
const ctx=vm.createContext({});vm.runInContext(code,ctx);
const evaluate=(pa,fat,d=data)=>ctx.calculateFigure7TTV(d,fat,pa);
const near=(a,b,e=1e-10)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
function point(p,t) {
    let values=p.map(p=>p.slice());
    while(values.length>1) values=values.slice(1).map((v,i)=>v.map((x,j)=>(1-t)*values[i][j]+t*x));
    return values[0];
}

test('source reproduction preserves 24 cubics, 15 lines, 2 shared lines and all original points',()=>{
    execFileSync(process.execPath,['scripts/calibrate-figure7.cjs'],{cwd:root});
    const source=extractFigure7(),raw=[...source.cubicPaths,...source.linePaths];
    assert.equal(data.paths.filter(p=>p.id.startsWith('cubic')).length,9);
    assert.equal(data.paths.flatMap(p=>p.segments).filter(s=>s.type==='bezier').length,24);
    assert.equal(data.paths.flatMap(p=>p.segments).filter(s=>s.type==='line').length,15);
    assert.equal(data.shared_limit.paths.flatMap(p=>p.segments).length,2);
    assert.ok(data.paths.every(p=>p.pa_ft>=2000));
    data.paths.forEach((p,i)=>assert.deepEqual(p.segments,raw[i].segments));
    assert.deepEqual(data.shared_limit.paths,source.limitPaths);
    assert.equal(source.ttv.ticks.length,11);assert.equal(source.fat.ticks.length,13);
});

test('bisection and real straight segments agree with independent PDF de Casteljau evaluation',()=>{
    const source=extractFigure7(),raw=[...source.cubicPaths,...source.linePaths];
    for(let i=0;i<data.paths.length;i++) for(let j=0;j<data.paths[i].segments.length;j++) {
        const s=data.paths[i].segments[j],r=raw[i].segments[j];
        for(const t of [0,0.01,0.25,0.5,0.75,0.99,1]) {
            const p=point(r.pdf_points,t);
            const fat=source.fat.scale*p[1]+source.fat.offset;
            const expected=source.ttv.scale*p[0]+source.ttv.offset;
            // Endpoint arithmetic order can differ at 1 ulp: direct endpoints
            // use the exact calibrated source FAT rather than an input tolerance.
            const input=t===0?s.points[0][1]:t===1?s.points.at(-1)[1]:fat;
            near(ctx.ttvOnSegment(s,input),expected);
        }
    }
});

test('SL-1 is one labelled shared limit, not two invented PA curves',()=>{
    assert.equal(data.shared_limit.sl_1.label,'SL-1');
    assert.match(data.shared_limit.sl_1.evidence,/1000 FT/);
    for(const pa of [0,1,500,1000]) {
        const r=evaluate(pa,-16);
        assert.equal(r.status,'available');assert.equal(r.ttv,100);
        assert.equal(r.basis,'shared_100_limit');
    }
    assert.equal(evaluate(0,55).status,'unverified_coverage');
    assert.equal(evaluate(1000,-55).status,'unverified_coverage');
});

test('all eight source-supported 100% regions are available; boundaries are not snapped',()=>{
    for(const region of data.shared_limit.pa_regions) {
        const r=evaluate(region.pa_ft,(region.fat_min+region.fat_max)/2);
        assert.equal(r.status,'available');assert.equal(r.ttv,100);
        assert.equal(r.basis,'shared_100_limit');
        const boundary=evaluate(region.pa_ft,region.fat_max);
        assert.equal(boundary.ttv,null);assert.equal(boundary.status,'unverified_ambiguous');
    }
    const at=pa=>data.paths.find(p=>p.pa_ft===pa&&p.id.startsWith('cubic'));
    // This pair of original paths really shares a point: no merge is needed.
    const join=at(4000).segments.at(-1).points.at(-1);
    assert.equal(evaluate(4000,join[1]).status,'available');
    near(evaluate(4000,join[1]).ttv,join[0]);
});

test('original gaps and conflicting endpoints remain unverified',()=>{
    for(const [pa,fat] of [[3000,50.185],[5000,40.475],[7000,28.04],[2000,55]]) {
        const r=evaluate(pa,fat);assert.equal(r.status,'unverified_coverage');assert.equal(r.ttv,null);
    }
    for(const pa of [6000,8000,9000]) {
        const p=data.paths.find(p=>p.pa_ft===pa&&p.id.startsWith('cubic')).segments.at(-1).points.at(-1);
        const r=evaluate(pa,p[1]);assert.equal(r.status,'unverified_ambiguous');assert.equal(r.ttv,null);
    }
    assert.equal(evaluate(3500,50.185).status,'unverified_interpolation_coverage');
});

test('operating ranges are separate from source axes and never silently clamp FAT/TTV',()=>{
    assert.equal(data.source_axes.ttv_percent.min,55);assert.equal(data.operating_range.ttv_percent.min,66);
    for(const [pa,fat]of [[-1,0],[10001,0],[6000,-55.001],[6000,55.001],[NaN,0],[6000,NaN]]) assert.throws(()=>evaluate(pa,fat));
    const strict=JSON.parse(JSON.stringify(data));strict.operating_range.ttv_percent.min=99;
    const below=evaluate(6000,40,strict);assert.equal(below.status,'outside_operating_ttv');assert.equal(below.ttv,null);
    strict.operating_range.ttv_percent.max=99.5;
    assert.equal(evaluate(6000,-16,strict).ttv,null);
    // Real connector points just above numeric 100 are not clipped to 100.
    const p=data.paths.find(p=>p.id==='straight-6').segments[0];
    const fat=p.points[0][1]+0.001;
    const r=evaluate(6000,fat);assert.equal(r.status,'outside_operating_ttv');assert.equal(r.ttv,null);
});

test('actual intermediate PA/FAT and mixed curve/limit interpolation are retained where covered',()=>{
    for(const [pa,fat] of [[3038,50],[6500,25],[9500,-16]]) {
        const r=evaluate(pa,fat);assert.equal(r.status,'available');
        near(r.ttv,r.lowerTtv+(pa-r.lowerPA)/(r.upperPA-r.lowerPA)*(r.upperTtv-r.lowerTtv));
        assert.notEqual(r.ttv,r.lowerTtv);
    }
    assert.equal(evaluate(6500,25).lowerBasis,'shared_100_limit');
    assert.equal(evaluate(9500,-16).upperBasis,'source_path');
    assert.notEqual(evaluate(10000,-15.8).ttv,evaluate(10000,-16).ttv);
});

function run(overrides={}) {
    const elements={};for(const [id,value]of Object.entries({pa:'6000',fat:'-16',kias:'130',trq:'100',tgt:'736',ng:'99',...overrides})) elements[id]={value};
    const alerts=[];let debug,etfCalls=0;
    const browser=vm.createContext({document:{getElementById(id){return elements[id]??={textContent:'stale',addEventListener(){}}}},fetch:()=>new Promise(()=>{}),alert:m=>alerts.push(m),ETF_ATF_DEBUG: true, console:{error(){},log(l,v){if(l==='Calculation debug:')debug=v}}});
    vm.runInContext(code,browser);vm.runInContext(read('js/calculator.js'),browser);
    for(const [v,f]of [['figure1Data','figure-1-tsf'],['figure4Data','figure-4-tgtref'],['figure5Data','figure-5-dtrq-dtgt'],['figure7Data','figure-7-ttv'],['figure8Data','figure-8-etf']]) vm.runInContext(`${v}=${read('data/'+f+'.json')}`,browser);
    const original=browser.calculateFigure8ETF;browser.calculateFigure8ETF=(...args)=>{etfCalls++;return original(...args)};
    vm.runInContext('calculate()',browser);return {elements,alerts,debug,etfCalls};
}

test('published graph-reading example gives 100%, STR uses 0.001 arithmetic not display values',()=>{
    const r=run();assert.deepEqual(r.alerts,[]);
    assert.equal(r.debug.figure7.rawTtv,100);assert.equal(r.debug.figure7.ttv,100);
    assert.equal(r.debug.deltaTgt, -8);near(r.debug.strRaw,97.640/100);assert.equal(r.debug.str, .976);
    assert.equal(r.elements['result-ttv'].textContent,'100.000 %');assert.equal(r.etfCalls,1);
});

test('unsupported Figure 7 coverage clears all results and prevents STR/ETF',()=>{
    for(const values of [{pa:'2000',fat:'55'},{pa:'3000',fat:'50.185'},{pa:'7000',fat:'28.04'}]) {
        const r=run(values);assert.equal(r.alerts.length,1);assert.match(r.alerts[0],/No verified Figure 7 TTV/);
        assert.equal(r.etfCalls,0);assert.equal(r.debug,undefined);
        for(const id of ['result-ttv','result-str','result-etf','result-trqadj']) assert.equal(r.elements[id].textContent,'---');
    }
});

test('Figures 4/5, Figure 8 and AGENTS.md are unchanged',()=>{
    const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
    const normalized=code.replace(/\r\n/g,'\n');
    assert.equal(hash(normalized.slice(0,normalized.indexOf('/*\n * FIGURE 7'))),'13d2b40a8b9082c879d6c648dff7541886dad88390cbb7eb697b0633b3a931f4');
    assert.equal(hash(normalized.slice(normalized.indexOf('/*\n * FIGURE 8'))),'a397ed9440af67aca28d3fcf41f4756ae267fb4acd2148483d7fed41a2d48cc8');
    for(const [p,h]of [['AGENTS.md','bf506b29c17481025ce63a878701acb56cc5d57405992d4729c0411c5d26f696'],['data/figure-4-tgtref.json','8e9dd0b7a06bd194027bac69a0420caaf95da23fed691a0966aa588f24826289'],['data/figure-5-dtrq-dtgt.json','0b479a91cf4acbd668a871388503dd0a7fa7a27d408e45fa308fdadc1278a623']]) assert.equal(hash(fs.readFileSync(path.join(root,p))),h);
    // Snapshot includes the approved round3, central validation and TSF rule.
    // The complete prefix (including all arithmetic) remains integrity-protected.
    const actual=read('js/calculator.js').replace(/\r\n/g,'\n');
    assert.equal(hash(actual.slice(0,actual.indexOf('const figure7Result'))),'1361bf2ff6492aacdbb6a24ad09af8fe6084941e1e04f8cf1161f3cf30443426');
});
