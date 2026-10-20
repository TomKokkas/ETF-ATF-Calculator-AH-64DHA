const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const base={fat:'-16',pa:'6000',kias:'130',trq:'100',tgt:'736',ng:'99'};
const numeric=Object.fromEntries(Object.entries(base).map(([k,v])=>[k,Number(v)]));
function browser(overrides={}) {
    const elements={},alerts=[],calls={};let debug;
    for(const [id,value]of Object.entries({...base,...overrides}))elements[id]={value};
    const ctx=vm.createContext({document:{getElementById(id){return elements[id]??={textContent:'stale',addEventListener(){}}}},
        fetch:()=>new Promise(()=>{}),alert:m=>alerts.push(m),ETF_ATF_DEBUG: true, console:{error(){},log(label,r){if(label==='Calculation debug:')debug=r}}});
    vm.runInContext(read('js/interpolation.js'),ctx);vm.runInContext(read('js/calculator.js'),ctx);
    for(const [v,f]of [['figure1Data','figure-1-tsf'],['figure4Data','figure-4-tgtref'],['figure5Data','figure-5-dtrq-dtgt'],['figure7Data','figure-7-ttv'],['figure8Data','figure-8-etf']])vm.runInContext(`${v}=${read('data/'+f+'.json')}`,ctx);
    for(const name of ['getTSF','round3','calculateFigure4TgtRef','calculateFigure5DeltaFactor','calculateFigure7TTV','calculateFigure8ETF']) {
        calls[name]=0;const original=ctx[name];ctx[name]=(...args)=>{calls[name]++;return original(...args)};
    }
    return {ctx,elements,alerts,calls,calculate(){debug=undefined;vm.runInContext('calculate()',ctx);return debug}};
}
function rejected(overrides,pattern) {
    const b=browser(overrides);assert.equal(b.calculate(),undefined);assert.equal(b.alerts.length,1);
    if(pattern)assert.match(b.alerts[0],pattern);
    for(const n of Object.values(b.calls))assert.equal(n,0,'Invalid inputs must fail before any numeric evaluation');
    for(const id of ['tsf','trqtsf','tgtref','delta-tgt','delta-factor','trqadj','ttv','str','etf'])assert.equal(b.elements['result-'+id].textContent,'---');
}

test('every input rejects blank, whitespace, nonnumeric, nonfinite and overflow values before evaluation',()=>{
    for(const field of Object.keys(base))for(const value of ['', '  ','abc','NaN','Infinity','-Infinity','1e309'])rejected({[field]:value},/finite numeric value/);
});
test('central validator independently rejects non-number and nonfinite values for every field',()=>{
    const b=browser();for(const field of Object.keys(base))for(const value of [NaN,Infinity,-Infinity,null,undefined,'1'])assert.throws(()=>b.ctx.validateInputs({...numeric,[field]:value}),/finite numeric value/);
});
test('PA, FAT, KIAS and torque accept exact supported bounds and reject just outside',()=>{
    const b=browser();
    for(const values of [{pa:0,kias:110},{pa:10000},{fat:-55},{fat:55},{kias:90},{kias:160},{trq:100},{trq:Number.MIN_VALUE}])assert.doesNotThrow(()=>b.ctx.validateInputs({...numeric,...values}));
    for(const values of [{pa:'-0.0001'},{pa:'10000.0001'},{fat:'-55.0001'},{fat:'55.0001'},{kias:'89.9999'},{kias:'160.0001'},{trq:'0'},{trq:'-0.0001'},{trq:'100.0001'}])rejected(values);
});
test('nonpositive torque, measured TGT and NG fail; no artificial TGT/NG upper bound',()=>{
    for(const field of ['trq','tgt','ng'])for(const value of ['0','-0','-1'])rejected({[field]:value},/greater than 0/);
    const b=browser();assert.doesNotThrow(()=>b.ctx.validateInputs({...numeric,tgt:Number.MAX_VALUE,ng:Number.MAX_VALUE}));
});
test('exactly 110 KIAS bypasses lookup below 2000 ft; near values never snap',()=>{
    const b=browser({pa:'1000',kias:'110',tgt:'600'}),r=b.calculate();assert.deepEqual(b.alerts,[]);
    assert.equal(b.calls.getTSF,0);assert.equal(r.tsf,1);assert.equal(r.trqTsf,100);
    assert.equal(b.elements['result-etf'].textContent,'1.00');
    for(const kias of ['109.999','110.001'])rejected({pa:'1000',kias},/KIAS must be an integer/);
    for(const kias of ['90','109','111','130','160'])rejected({pa:'1000',kias},/Figure 1 TSF/);
});
test('Figure 1 altitude threshold is inclusive and tested before rounding',()=>{
    rejected({pa:'1999.999',kias:'130'},/Figure 1 TSF/);
    const b=browser();for(const kias of [109,110,111])for(const pa of [2000,10000])assert.doesNotThrow(()=>b.ctx.validateInputs({...numeric,kias,pa}));
    for(const kias of ['109.999','110.001'])rejected({kias},/KIAS must be an integer/);
});
test('110 KIAS preserves remaining coverage guards, including Figure 5 at PA zero',()=>{
    const b=browser({pa:'0',kias:'110'});assert.equal(b.calculate(),undefined);
    assert.match(b.alerts[0],/No verified Figure 5/);assert.equal(b.calls.getTSF,0);
    assert.equal(b.calls.calculateFigure7TTV,0);assert.equal(b.calls.calculateFigure8ETF,0);
    assert.equal(b.elements['result-etf'].textContent,'---');
});
test('decimal torque and FAT remain exact inputs and reach unchanged arithmetic',()=>{
    const b=browser({trq:'64.85',fat:'-15.8',tgt:'500'}),r=b.calculate();assert.deepEqual(b.alerts,[]);
    assert.equal(r.trq,64.85);assert.equal(r.fat,-15.8);assert.equal(r.trqTsf,64.202);
});
test('all displayed results clear after a previously successful calculation becomes invalid',()=>{
    const b=browser();assert.ok(b.calculate());assert.equal(b.elements['result-etf'].textContent,'0.92');
    b.elements.trq.value='100.0001';assert.equal(b.calculate(),undefined);
    for(const id of ['tsf','trqtsf','tgtref','delta-tgt','delta-factor','trqadj','ttv','str','etf'])assert.equal(b.elements['result-'+id].textContent,'---');
});
test('official digital chain retains policy A and NG has no numeric contribution',()=>{
    const b=browser(),r=b.calculate();assert.deepEqual(b.alerts,[]);
    assert.equal(r.figure4.usedTgtRef, 728);assert.equal(r.deltaTgt, -8);
    assert.equal(b.elements['result-trqadj'].textContent,'97.640 %');assert.equal(r.str,.976);assert.equal(r.figure8.etf,.92);
    const alternate=browser({ng:'120'});assert.ok(alternate.calculate());assert.equal(alternate.elements['result-etf'].textContent,'0.92');
});
test('HTML constraints preserve validation without static NG remarks',()=>{
    const html=read('index.html');
    for(const [id,min,max]of [['fat','-55','55'],['pa','0','10000'],['kias','90','160'],['trq','0','100'],['tgt','0',null],['ng','0',null]]) {
        const tag=html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0];
        assert.match(tag,/\brequired\b/);assert.ok(tag.includes(`step="${id==='kias'?'1':'any'}"`));assert.ok(tag.includes(`min="${min}"`));
        if(max)assert.ok(tag.includes(`max="${max}"`));else assert.doesNotMatch(tag,/\bmax=/);
    }
    assert.doesNotMatch(html,/NG is recorded but is not used|Torque, measured TGT and NG must be greater than zero|aria-describedby="(?:ng-note|positive-input-note)/);
});

test('integer KIAS nodes use the existing TSF table and 110 bypasses lookup',()=>{
    for(const [kias,tsf]of [[90,1.009],[94,1.007],[95,1.007],[110,1],[159,.972],[160,.972]]) {
        const b=browser({kias:String(kias)}),r=b.calculate();assert.deepEqual(b.alerts,[]);
        assert.equal(r.kias,kias);assert.equal(r.tsf,tsf);
        assert.equal(b.elements['result-tsf'].textContent,tsf.toFixed(3));
        assert.equal(b.calls.getTSF,kias===110?0:1);
        // 160 uses the approved nominal endpoint reading, not an assertion
        // of an exact PDF centerline intersection at that calibrated KIAS.
    }
});

test('fractional KIAS is rejected without snapping; numeric 94.0 is accepted',()=>{
    for(const kias of ['94.1','89','161','94.00000000000001'])rejected({kias},/KIAS must be an integer/);
    const b=browser({kias:'94.0'}),r=b.calculate();assert.deepEqual(b.alerts,[]);
    assert.equal(r.kias,94);assert.equal(r.tsf,1.007);assert.equal(b.elements.kias.value,'94.0');
});

test('fractional KIAS clears every old result after a successful calculation',()=>{
    const b=browser({kias:'94'});assert.ok(b.calculate());
    b.elements.kias.value='94.1';assert.equal(b.calculate(),undefined);
    assert.match(b.alerts[0],/KIAS must be an integer/);
    for(const id of ['tsf','trqtsf','tgtref','delta-tgt','delta-factor','trqadj','ttv','str','etf'])assert.equal(b.elements['result-'+id].textContent,'---');
});
