const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const code=read('js/calculator.js');
const arithmetic=vm.createContext({});
vm.runInContext(code.slice(code.indexOf('// Exact decimal arithmetic.'),code.indexOf('function round3(value) {')),arithmetic);
const op=(kind,a,b)=>arithmetic.decimalNumber(arithmetic.decimalRound3(arithmetic.decimalOperation(kind,a,b)));
function run(values={}) {
    const elements={},alerts=[];let debug;
    for(const [id,value]of Object.entries({fat:'-16',pa:'6000',kias:'130',trq:'100',tgt:'736',ng:'98',...values}))elements[id]={value};
    const c=vm.createContext({document:{getElementById(id){return elements[id]??={textContent:'stale',addEventListener(){}}}},fetch:()=>new Promise(()=>{}),alert:m=>alerts.push(m),ETF_ATF_DEBUG: true, console:{error(){},log(l,v){if(l==='Calculation debug:')debug=v}}});
    vm.runInContext(read('js/interpolation.js'),c);vm.runInContext(code,c);
    for(const [v,f]of [['figure1Data','figure-1-tsf'],['figure4Data','figure-4-tgtref'],['figure5Data','figure-5-dtrq-dtgt'],['figure7Data','figure-7-ttv'],['figure8Data','figure-8-etf']])vm.runInContext(v+'='+read('data/'+f+'.json'),c);
    vm.runInContext('calculate()',c);return {c,elements,alerts,debug};
}

test('decimal stages agree with independent safe-integer rational oracle',()=>{
    // Independent oracle: only exact small Number integers, no BigInt,
    // production decimal parsing or quotient/remainder rounding implementation.
    const oracle=(n,d)=>Math.floor(n*1000/d+.5)/1000;
    let cases=0;
    for(let a=-9950;a<=9950;a+=199)for(const b of [140,170,235,990,1009]) {
        assert.ok(Number.isSafeInteger(a*b*1000));
        assert.equal(op('multiply',String(a/100),String(b/1000)),oracle(a*b,100000));
        assert.equal(op('divide',String(a/100),String(b/1000)),oracle(a*10,b));
        assert.equal(op('add',String(a/100),String(b/1000)),oracle(a*10+b,1000));
        assert.equal(op('subtract',String(a/100),String(b/1000)),oracle(a*10-b,1000));
        cases+=4;
    }
    assert.equal(cases,2020);
});

test('halfway, near-halfway and already-correct arithmetic results',()=>{
    for(const [kind,a,b,expected]of [
        ['multiply','99.5','1.009',100.396],['multiply','-99.5','1.009',-100.395],
        ['multiply','99.4999999999999','1.009',100.395],['multiply','99.5000000000001','1.009',100.396],
        ['subtract','728','736.0025',-8.002],['subtract','728','736.0024999999999',-8.002],
        ['subtract','728','736.0025000000001',-8.003],
        ['multiply','.17','-8.05',-1.368],['divide','97.85','100',.979],
        ['multiply','64.85','.990',64.202],['multiply','64.8512345678901','.990',64.203],
        ['divide','1.91','2',.955],['multiply','1e-9','1.009',0],
        ['multiply','1e5','1.009',100900],['add','0.0005','0',.001],
        ['add','-0.0005','0',-0],['add','.0004999999999999','0',0],
        ['add','-.0005000000000001','0',-.001]
    ])assert.equal(op(kind,a,b),expected,kind+' '+a+' '+b);
    assert.ok(Object.is(op('multiply','-0','1'),-0));
    assert.ok(Object.is(op('divide','0','-2'),-0));
    for(const bad of [NaN,Infinity,-Infinity,'NaN','','0x10',null])assert.throws(()=>op('add',bad,1));
    assert.throws(()=>op('divide',1,0));
});

test('TRQADJ keeps exact multiply-add and the original rounding boundary',()=>{
    const correction=arithmetic.decimalOperation('multiply','.14','-17.975');
    const sum=arithmetic.decimalOperation('add','99',correction);
    assert.equal(arithmetic.decimalNumber(sum),96.484);
    // Stage rounding of correction is equivalent when TRQTSF is on .001 grid.
    assert.equal(op('add','99',arithmetic.decimalRound3(correction)),96.484);
});

test('approved full-chain scenarios A, B and C remain unchanged',()=>{
    for(const [values,adj,str,etf]of [
        [{},'97.640 %',.976,'0.92'],
        [{pa:'6005',fat:'14',kias:'126',tgt:'800'},'102.260 %',1.023,'1.00'],
        [{pa:'2978',fat:'12',kias:'134',tgt:'769'},'98.095 %',.981,'0.96']
    ]){const r=run(values);assert.deepEqual(r.alerts,[]);assert.equal(r.elements['result-trqadj'].textContent,adj);assert.equal(r.debug.str,str);assert.equal(r.elements['result-etf'].textContent,etf);}
    const {c}=run();const raw=c.calculateFigure8ETF(JSON.parse(read('data/figure-8-etf.json')),.98,-16).etf;
    assert.equal(c.readChartValue(raw,8),.93);
});

test('decimal correction propagates through TRQADJ, STR and ETF',()=>{
    const r=run({kias:'91',trq:'99.5',tgt:'736.506'});assert.deepEqual(r.alerts,[]);
    for(const [id,expected]of [['result-trqtsf','100.396 %'],['result-trqadj','98.950 %'],['result-str','0.990'],['result-etf','0.97']])assert.equal(r.elements[id].textContent,expected);
});

test('measured decimal text survives Number parsing and inputs are not quantized',()=>{
    assert.equal(Number('736.0025000000001'),Number('736.0025'));
    const tie=run({tgt:'736.0025'}),below=run({tgt:'736.0024999999999'}),above=run({tgt:'736.0025000000001'});
    for(const r of [tie,below,above])assert.deepEqual(r.alerts,[]);
    assert.equal(tie.debug.deltaTgt,-8.002);assert.equal(below.debug.deltaTgt,-8.002);assert.equal(above.debug.deltaTgt,-8.003);
    const measured=run({trq:'99.5012345678901'});assert.deepEqual(measured.alerts,[]);
    assert.equal(measured.elements['result-trqtsf'].textContent,'98.506 %');
});

test('original round3, all chart datasets and interpolation are unchanged',()=>{
    const crypto=require('node:crypto'),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
    assert.equal(hash(require('./helpers/round3.cjs').round3Source(code).replace(/\r\n/g,'\n')),'3e7955872d55c0a11527e321e966e95aa6aebbeb181b306b80a09b8f960fb684');
    for(const [p,h]of [
        ['js/interpolation.js','20dbcc7675a15ae36431ee5c01585115f63ddf8f0838d2f419e921a9441be119'],
        ['data/figure-1-tsf.json','b6723560e1ef78c001701f7cfccc013ef7932042dc87f620ffc201326d5f2165'],
        ['data/figure-4-tgtref.json','8e9dd0b7a06bd194027bac69a0420caaf95da23fed691a0966aa588f24826289'],
        ['data/figure-5-dtrq-dtgt.json','0b479a91cf4acbd668a871388503dd0a7fa7a27d408e45fa308fdadc1278a623'],
        ['data/figure-7-ttv.json','1015449ac6c20d50f3960d352740535e4f59a2002ecaf424b368ec679e5f7dd6'],
        ['data/figure-8-etf.json','537daf6c921b32ac7082f5128b0df43b4186efd5400e8fc50c4a74009ec1ae98']
    ])assert.equal(hash(fs.readFileSync(path.join(root,p))),h,p);
});
