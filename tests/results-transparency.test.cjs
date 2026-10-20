const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const secondary=['result-tgtref-calculated','result-delta-tgt-calculated','result-etf-provenance'];
function run(overrides={},calculator=read('js/calculator.js')) {
    const elements={},alerts=[],calls={};let debug,lastETF;
    for(const [id,value]of Object.entries({fat:'-16',pa:'6000',kias:'130',trq:'100',tgt:'736',ng:'99',...overrides}))elements[id]={value};
    const ctx=vm.createContext({document:{getElementById(id){return elements[id]??={textContent:'stale',addEventListener(){}}}},
        fetch:()=>new Promise(()=>{}),alert:m=>alerts.push(m),ETF_ATF_DEBUG: true, console:{error(){},log(l,v){if(l==='Calculation debug:')debug=v}}});
    vm.runInContext(read('js/interpolation.js'),ctx);vm.runInContext(calculator,ctx);
    for(const [v,f]of [['figure1Data','figure-1-tsf'],['figure4Data','figure-4-tgtref'],['figure5Data','figure-5-dtrq-dtgt'],['figure7Data','figure-7-ttv'],['figure8Data','figure-8-etf']])vm.runInContext(`${v}=${read('data/'+f+'.json')}`,ctx);
    for(const name of ['calculateFigure4TgtRef','calculateFigure5DeltaFactor','calculateFigure7TTV','calculateFigure8ETF']) {
        calls[name]=0;const original=ctx[name];ctx[name]=(...args)=>{calls[name]++;const result=original(...args);if(name==='calculateFigure8ETF')lastETF=result;return result};
    }
    const calculate=()=>{debug=undefined;vm.runInContext('calculate()',ctx);return debug};
    calculate();return {ctx,elements,alerts,calls,calculate,get debug(){return debug},get lastETF(){return lastETF}};
}

test('one primary value shows exactly the reading used, with a single evaluation',()=>{
    const r=run();assert.deepEqual(r.alerts,[]);
    assert.equal(r.elements['result-tgtref'].textContent,'728 °C');
    assert.equal(r.elements['result-delta-tgt'].textContent,'-8 °C');
    for(const count of Object.values(r.calls))assert.equal(count,1);
    assert.equal(r.debug.figure4.usedTgtRef,728);assert.equal(r.debug.deltaTgt,-8);
    assert.equal(r.elements['result-trqadj'].textContent,'97.640 %');assert.equal(r.debug.str,.976);assert.equal(r.debug.figure8.etf,.92);
});
test('provenance stays in debug only for source strokes and label gaps',()=>{
    for(const [overrides,basis,etf]of [[{},'source_stroke','0.92'],[{trq:'94.773'},'label_gap_interpolation','0.74']]) {
        const r=run(overrides);assert.deepEqual(r.alerts,[]);
        assert.equal(r.lastETF.basis,basis);assert.equal(r.debug.figure8.basis,basis);
        assert.equal(r.elements['result-etf'].textContent,etf);
        for(const id of secondary)assert.equal(r.elements[id],undefined);
    }
});
test('FAT interpolation retains both origins in debug without extra UI details',()=>{
    const r=run({fat:'-2.5',trq:'90',tgt:'747.17'});
    assert.deepEqual(r.alerts,[]);assert.equal(r.lastETF.basis,'fat_interpolation');
    for(const key of ['basis','lowerBasis','upperBasis','usesLabelGapInterpolation','lowerFat','upperFat'])assert.equal(r.debug.figure8[key],r.lastETF[key]);
    assert.equal(r.debug.figure8.lowerBasis,'label_gap_interpolation');assert.equal(r.debug.figure8.upperBasis,'source_stroke');
    assert.equal(r.calls.calculateFigure8ETF,1);
});
test('SEI STR rule still returns one and is recorded only in debug',()=>{
    const r=run({fat:'55'});assert.deepEqual(r.alerts,[]);
    assert.equal(r.debug.figure8.basis,'sei_str_rule');assert.equal(r.elements['result-etf'].textContent,'1.00');
});
test('fractional measured TGT produces an exact decimal delta display, without integer rounding',()=>{
    const r=run({tgt:'736.4'});assert.deepEqual(r.alerts,[]);
    assert.equal(r.debug.deltaTgt,-8.4);assert.equal(r.elements['result-delta-tgt'].textContent,'-8.400 °C');
});
test('validation and calculation failures clear all primary results',()=>{
    for(const overrides of [{trq:'100.0001'},{trq:'60'},{pa:'0',kias:'110'}]) {
        const r=run();assert.deepEqual(r.alerts,[]);
        for(const [id,value]of Object.entries(overrides))r.elements[id].value=value;
        assert.equal(r.calculate(),undefined);assert.equal(r.alerts.length,1);
        for(const id of ['tsf','trqtsf','tgtref','delta-tgt','delta-factor','trqadj','ttv','str','etf'])assert.equal(r.elements['result-'+id].textContent,'---');
        for(const id of secondary)assert.equal(r.elements[id],undefined);
    }
});
test('HTML contains no calculated values or provenance metadata',()=>{
    const html=read('index.html');
    for(const id of secondary)assert.equal(html.includes(id),false);
    assert.doesNotMatch(html,/Calculated:|source_stroke|label_gap_interpolation|Raw geometry/);
});
