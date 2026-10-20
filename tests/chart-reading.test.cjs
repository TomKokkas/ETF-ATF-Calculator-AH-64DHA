const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function run(values={}) {
    const elements={},alerts=[];let debug;
    for(const [id,value]of Object.entries({fat:'-16',pa:'6000',kias:'130',trq:'100',tgt:'736',ng:'99',...values}))elements[id]={value};
    const c=vm.createContext({document:{getElementById(id){return elements[id]??={textContent:'stale',addEventListener(){}}}},fetch:()=>new Promise(()=>{}),alert:m=>alerts.push(m),ETF_ATF_DEBUG: true, console:{error(){},log(l,v){if(l==='Calculation debug:')debug=v}}});
    vm.runInContext(read('js/interpolation.js'),c);vm.runInContext(read('js/calculator.js'),c);
    for(const [v,f]of [['figure1Data','figure-1-tsf'],['figure4Data','figure-4-tgtref'],['figure5Data','figure-5-dtrq-dtgt'],['figure7Data','figure-7-ttv'],['figure8Data','figure-8-etf']])vm.runInContext(`${v}=${read('data/'+f+'.json')}`,c);
    vm.runInContext('calculate()',c);return {c,elements,alerts,debug};
}
test('all five reading steps obey exact halfway and near-halfway boundaries',()=>{
    const {c}=run();
    for(const [figure,low,half,high,below,above]of [
        [1,.990,.9905,.991,.9904999999999999,.9905000000000002],
        [4,816,817,818,816.9999999999999,817.0000000000001],
        [5,.170,.1725,.175,.17249999999999996,.17250000000000001],
        [7,98.5,98.75,99,98.74999999999999,98.75000000000001],
        [8,.92,.925,.93,.9249999999999999,.9250000000000002]
    ]) {
        assert.equal(c.readChartValue(below,figure),low);
        assert.equal(c.readChartValue(half,figure),high);
        assert.equal(c.readChartValue(above,figure),high);
        assert.equal(c.readChartValue(low,figure),low);
        assert.equal(c.readChartValue(high,figure),high);
        assert.equal(c.readChartValue(-half,figure),-low);
    }
});
test('reading quantization matches an independent exact integer-grid oracle',()=>{
    const {c}=run();
    // Decimal inputs n/10000 and step sizes expressed in ten-thousandths.
    // All oracle arithmetic is exact small integer Number arithmetic; no
    // BigInt, decimal parsing, or production rounding algorithm is reused.
    for(const [figure,denominator]of [[1,10],[4,20000],[5,50],[7,5000],[8,100]]) {
        for(let n=0;n<=50000;n+=13) {
            const q=Math.floor(n/denominator),rem=n%denominator;
            const expected=(q+(2*rem>=denominator?1:0))*denominator/10000;
            const negative=-(q+(2*rem>denominator?1:0))*denominator/10000;
            assert.equal(c.readChartValue(Number(`${n}e-4`),figure),expected);
            assert.equal(c.readChartValue(-Number(`${n}e-4`),figure),negative);
        }
    }
    for(const bad of [NaN,Infinity,-Infinity,null])assert.throws(()=>c.readChartValue(bad,4),/finite/);
    assert.throws(()=>c.readChartValue(1,99),/Unknown/);
});
test('official full-chain example uses human readings at every next stage',()=>{
    const r=run();assert.deepEqual(r.alerts,[]);
    const expected={'result-tgtref':'728 °C','result-delta-tgt':'-8 °C','result-delta-factor':'0.170','result-trqadj':'97.640 %','result-ttv':'100.000 %','result-str':'0.976','result-etf':'0.92'};
    for(const [id,value]of Object.entries(expected))assert.equal(r.elements[id].textContent,value);
    assert.equal(r.debug.figure4.usedTgtRef,728);assert.equal(r.debug.deltaTgt,-8);
    assert.equal(r.debug.str,.976);assert.equal(r.debug.figure8.etf,.92);
});
test('second scenario reproduces 102.260 using visible intermediate values',()=>{
    const r=run({pa:'6005',fat:'14',kias:'126',tgt:'800',ng:'98'});assert.deepEqual(r.alerts,[]);
    assert.equal(r.elements['result-trqtsf'].textContent,'99.200 %');
    assert.equal(r.elements['result-tgtref'].textContent,'818 °C');assert.equal(r.debug.deltaTgt,18);
    assert.equal(r.elements['result-trqadj'].textContent,'102.260 %');assert.equal(r.debug.str,1.023);assert.equal(r.elements['result-etf'].textContent,'1.00');
});
test('independent Figure 8 example keeps STR .98 and reads ETF .93',()=>{
    const {c}=run();const d=JSON.parse(read('data/figure-8-etf.json'));
    const raw=c.calculateFigure8ETF(d,.98,-16).etf;assert.equal(c.readChartValue(raw,8),.93);
});
test('non-example chart readings propagate through TTV division and ETF lookup',()=>{
    const r=run({pa:'9500',fat:'-20',tgt:'850',trq:'100'});assert.deepEqual(r.alerts,[]);
    assert.equal(r.debug.figure7.ttv,98.5);assert.notEqual(r.debug.figure7.rawTtv,98.5);
    assert.equal(r.debug.figure5.usedFactor,.14);assert.equal(r.debug.figure4.usedTgtRef,822);
    const expectedAdj=r.c.round3(99+.14*(822-850));
    assert.equal(r.debug.str,r.c.round3(expectedAdj/98.5));
    const data=JSON.parse(read('data/figure-8-etf.json'));
    const raw=r.c.calculateFigure8ETF(data,r.debug.str,-20).etf;
    assert.equal(r.debug.figure8.etf,r.c.readChartValue(raw,8));
});
