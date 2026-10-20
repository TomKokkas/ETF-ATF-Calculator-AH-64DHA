const {describe,test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const calculator=read('js/calculator.js');
const {loadRound3}=require('./helpers/round3.cjs');
const round3=loadRound3(calculator);

// Exercise production arithmetic with published chart readings supplied as
// fixtures. These are NOT digital-geometry or end-to-end accuracy tests.
function publishedArithmetic(trq='100') {
    const elements={},alerts=[];let debug;
    for(const [id,value]of Object.entries({fat:'-16',pa:'6000',kias:'130',trq,tgt:'736',ng:'99'}))elements[id]={value};
    const context=vm.createContext({
        document:{getElementById(id){return elements[id]??={textContent:'',addEventListener(){}}}},
        fetch:()=>new Promise(()=>{}),alert:x=>alerts.push(x),
        ETF_ATF_DEBUG: true, console:{error(){},log(label,value){if(label==='Calculation debug:')debug=value}}
    });
    vm.runInContext(calculator,context);
    vm.runInContext(`
        figure1Data={};figure4Data={};figure5Data={};figure7Data={};figure8Data={};
        getTSF=()=>0.990;
        calculateFigure4TgtRef=()=>({status:'available',tgtref:728});
        calculateFigure5DeltaFactor=()=>({status:'available',factor:0.17});
        // TTV 100 is a harness fixture, not a number printed in section 18.c.
        calculateFigure7TTV=()=>({status:'available',ttv:100});
        // ETF is deliberately outside the scope of this arithmetic fixture.
        calculateFigure8ETF=()=>({status:'available',etf:1});
        calculate();
    `,context);
    assert.deepEqual(alerts,[]);assert.ok(debug);
    return {debug,elements};
}

describe('SEI published-value arithmetic — no chart digitization',()=>{
    test('0125 00-5 section 18.a: 100 percent times TSF 0.990 gives 99 percent',()=>{
        const {debug}=publishedArithmetic();
        assert.equal(debug.tsf,.990);assert.equal(debug.trqTsf,99);
    });
    test('0125 00-6 section 18.b.(2): published 728 minus measured 736 gives -8',()=>{
        const {debug}=publishedArithmetic();
        assert.equal(debug.figure4.usedTgtRef,728);assert.equal(debug.deltaTgt,-8);
    });
    test('0125 00-11 section 18.b.(4): 99 plus 0.17 times -8 gives 97.640',()=>{
        const {elements}=publishedArithmetic();
        assert.equal(elements['result-trqadj'].textContent,'97.640 %');
    });
});

describe('Independent Figure 8 published lookup — digital geometry, not a chained STR',()=>{
    test('0125 00-11 section 18.e: independent STR 0.98 and FAT -16 read 0.93',()=>{
        const context=vm.createContext({});
        vm.runInContext(read('js/interpolation.js'),context);
        const data=JSON.parse(read('data/figure-8-etf.json'));
        const result=context.calculateFigure8ETF(data,.98,-16);
        assert.equal(result.status,'available');assert.equal(result.basis,'source_stroke');
        assert.equal(result.etf.toFixed(2),'0.93');
        assert.equal(round3(result.etf),.931);
        // Do not replace the real end-to-end STR with this independent input.
    });
});

// Full digital-geometry and real end-to-end tests stay in figure4/5/7/8.test.cjs.
// The approved chain retains STR .976 / ETF .92; no .93 assertion
// is imposed on PA 6000 / FAT -16 by these published-value fixtures.
describe('Production round3 audit — NOTE compliance and documented limitations',()=>{
    test('0125 00-5 NOTE: all quoted positive five-decimal range values',()=>{
        for(let i=1;i<=99;i++)assert.equal(round3(Number(`0.970${String(i).padStart(2,'0')}`)),i<50?.970:.971);
    });
    test('ordinary positive and negative values round to the nearest 0.001',()=>{
        for(const [input,expected]of [[7.80249,7.802],[7.80251,7.803],[-7.80249,-7.802],[-7.80251,-7.803],[0,0]])assert.equal(round3(input),expected);
    });
    test('exact binary halfway values currently tie toward positive infinity',()=>{
        // 0.0625 is exactly representable in binary: this isolates tie policy.
        assert.equal(round3(.0625),.063);assert.equal(round3(-.0625),-.062);
        assert.equal(round3(-.9705),-.970);
        assert.equal(Object.is(round3(-.0005),-0),true);
        // NOTE gives no explicit negative-halfway example; this is a
        // characterization, not certification of a required negative policy.
    });
    test('positive decimal halfway regressions round up without EPSILON',()=>{
        assert.equal(round3(2.0035),2.004);
        assert.equal(round3(4.0005),4.001);
    });
    test('production arithmetic: torque 64.85 times TSF .990 gives 64.202',()=>{
        assert.equal(publishedArithmetic('64.85').debug.trqTsf,64.202);
    });
});
