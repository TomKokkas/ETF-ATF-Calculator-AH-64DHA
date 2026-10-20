const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const base={fat:'-16',pa:'6000',kias:'130',trq:'100',tgt:'736',ng:'98'};
function harness() {
    const elements={},alerts=[];
    const element=id=>elements[id]??={value:base[id]??'',textContent:'\u2014',dataset:{},attributes:{},listeners:{},setAttribute(name,value){this.attributes[name]=value},focus(){this.focused=true},
        addEventListener(type,fn){(this.listeners[type]??=new Set()).add(fn)},
        removeEventListener(type,fn){this.listeners[type]?.delete(fn)},
        dispatch(type,details={}){for(const fn of this.listeners[type]??[])fn({target:this,preventDefault(){},...details})}};
    const c=vm.createContext({document:{getElementById:element},fetch:()=>new Promise(()=>{}),
        alert:m=>alerts.push(m),console:{error(){},log(){}}});
    vm.runInContext(read('js/interpolation.js'),c);vm.runInContext(read('js/calculator.js'),c);
    for(const [n,f]of [[1,'tsf'],[4,'tgtref'],[5,'dtrq-dtgt'],[7,'ttv'],[8,'etf']])
        vm.runInContext(`figure${n}Data=${read(`data/figure-${n}-${f}.json`)}`,c);
    vm.runInContext(read('js/engines.js'),c);
    const state=vm.runInContext('engineState',c);
    function fill(values){for(const [id,value]of Object.entries(values)){element(id).value=value;element(id).dispatch('input')}}
    return {c,state,element,alerts,fill,calculate(){element('calculate-btn').dispatch('click')},
        select(n){element('engine-tab-'+n).dispatch('click')}};
}

test('engine selector calls the single existing calculation core exactly once',()=>{
    const h=harness();let calls=0;const original=h.c.calculate;h.c.calculate=()=>{calls++;return original()};
    h.calculate();assert.equal(calls,1);assert.equal(h.state.engines[1].valid,true);
    assert.equal(h.state.engines[1].calculation.trqAdj,97.64);
    assert.equal(h.element('engine-1-etf').textContent,'0.92');
    assert.equal(h.element('result-atf').textContent,'\u2014');
});

test('switching restores independent exact input strings and all intermediate results',()=>{
    const h=harness();const first={...base,fat:'-15.800000000000001',trq:'99.5000000000001',ng:'98.00000000000001'};
    h.fill(first);h.calculate();assert.deepEqual(h.alerts,[]);
    const snapshot={...h.state.engines[1].results},calculation=h.state.engines[1].calculation;
    h.select(2);for(const id of Object.keys(base))assert.equal(h.element(id).value,'');
    h.fill({...base,pa:'6005',fat:'14',kias:'126',tgt:'800'});h.calculate();
    assert.equal(h.element('result-etf').textContent,'1.00');
    h.select(1);for(const [id,text]of Object.entries(first))assert.equal(h.element(id).value,text);
    for(const [id,text]of Object.entries(snapshot))assert.equal(h.element(id).textContent,text);
    assert.equal(h.state.engines[1].calculation,calculation);
    h.select(2);assert.equal(h.element('pa').value,'6005');assert.equal(h.element('result-etf').textContent,'1.00');
});

test('each of six changed inputs invalidates only its own engine and the ATF',()=>{
    for(const id of Object.keys(base)) {
        const h=harness();h.calculate();h.select(2);h.fill(base);h.calculate();
        assert.equal(h.element('result-atf').textContent,'0.92');
        const other=h.state.engines[1].calculation;
        h.fill({[id]:base[id]+'.0'});
        assert.equal(h.state.engines[2].valid,false);assert.equal(h.state.engines[2].etf,null);
        assert.equal(h.state.engines[1].calculation,other);assert.equal(h.state.engines[1].valid,true);
        assert.equal(h.element('engine-1-etf').textContent,'0.92');assert.equal(h.element('engine-2-etf').textContent,'\u2014');
        assert.equal(h.element('result-atf').textContent,'\u2014');assert.equal(h.state.atf,null);
        assert.equal(h.element('result-trqadj').textContent,'\u2014');
    }
});

test('switching detects changes even if a programmatic update omitted input event',()=>{
    const h=harness();h.calculate();h.element('trq').value='99.5';h.select(2);
    assert.equal(h.state.engines[1].valid,false);h.select(1);
    assert.equal(h.element('trq').value,'99.5');assert.equal(h.element('result-etf').textContent,'\u2014');
});

test('exact .93/.98 mean retains .955 and displays .96 without Number.toFixed tie',()=>{
    const h=harness(),factor=h.c.calculateAircraftFactor('.93','.98');
    assert.equal(factor.exact.n*1000n,955n*factor.exact.d);
    assert.equal(factor.display,'0.96');assert.equal(factor.belowMinimum,false);
    for(const [n,value]of [[1,'.93'],[2,'.98']])Object.assign(h.state.engines[n],{valid:true,etf:h.c.decimalValue(value)});
    h.c.renderAircraftSummary();assert.equal(h.element('result-atf').textContent,'0.96');
    assert.equal(h.state.atf.exact.n*1000n,955n*h.state.atf.exact.d);
});

test('minimum is compared against exact ATF, including a below-minimum value displayed .90',()=>{
    const h=harness();
    for(const [first,second,display,below]of [['.90','.90','0.90',false],['.89','.90','0.90',true],['.89','.89','0.89',true],['.90','.91','0.91',false]]) {
        for(const [n,v]of [[1,first],[2,second]])Object.assign(h.state.engines[n],{valid:true,etf:h.c.decimalValue(v)});
        h.c.renderAircraftSummary();assert.equal(h.element('result-atf').textContent,display);
        assert.equal(h.state.atf.belowMinimum,below);
        assert.equal(h.element('atf-status').dataset.state,below?'below-minimum':'meets-minimum');
    }
});

test('missing or invalid engine never produces ATF and failure preserves the other ETF',()=>{
    const h=harness();h.select(2);h.fill(base);h.calculate();h.select(1);
    assert.equal(h.element('result-atf').textContent,'\u2014');h.fill(base);h.calculate();
    h.fill({trq:'100.0001'});h.calculate();assert.equal(h.alerts.length,1);
    assert.equal(h.state.engines[1].valid,false);assert.equal(h.state.engines[2].valid,true);
    assert.equal(h.element('engine-2-etf').textContent,'0.92');assert.equal(h.element('result-atf').textContent,'\u2014');
    h.fill({...base,pa:'2000',fat:'55'});h.calculate();assert.equal(h.state.engines[1].valid,false);
    assert.equal(h.element('result-atf').textContent,'\u2014');
});

test('approved A/B/C scenarios use the same core on both engines',()=>{
    for(const [values,adj,str,etf]of [[base,'97.640 %','0.976','0.92'],
        [{...base,pa:'6005',fat:'14',kias:'126',tgt:'800'},'102.260 %','1.023','1.00'],
        [{...base,pa:'2978',fat:'12',kias:'134',tgt:'769'},'98.095 %','0.981','0.96']]) {
        const h=harness();for(const number of [1,2]){h.select(number);h.fill(values);h.calculate();
            assert.equal(h.element('result-trqadj').textContent,adj);assert.equal(h.element('result-str').textContent,str);assert.equal(h.element('result-etf').textContent,etf)}
        assert.deepEqual(h.alerts,[]);assert.equal(h.element('result-atf').textContent,etf);
    }
});

test('tabs are labelled, accessible and replace the dropdown above the shared form',()=>{
    const html=read('index.html');assert.ok(html.indexOf('id="engine-tab-1"')<html.indexOf('class="input-section"'));
    assert.doesNotMatch(html,/engine-select|Minimum ATF:|Calculate both engines/);
    assert.match(html,/role="tablist"/);assert.match(html,/id="atf-status" role="status" hidden/);
    const h=harness();assert.equal(h.element('engine-tab-1').attributes['aria-selected'],'true');
    h.select(2);assert.equal(h.element('engine-tab-1').attributes['aria-selected'],'false');
    assert.equal(h.element('engine-tab-2').attributes['aria-selected'],'true');
    assert.equal(h.element('engine-panel').attributes['aria-labelledby'],'engine-tab-2');
    h.element('engine-tab-2').dispatch('keydown',{key:'ArrowLeft'});
    assert.equal(h.state.selected,1);assert.equal(h.element('engine-tab-1').focused,true);
});

test('summary has only dashes when incomplete and hides all normal-state instructions',()=>{
    const h=harness();
    for(const id of ['engine-1-etf','engine-2-etf','result-atf'])assert.equal(h.element(id).textContent,'\u2014');
    assert.equal(h.element('atf-status').textContent,'');assert.equal(h.element('atf-status').hidden,true);
    h.calculate();assert.equal(h.element('atf-status').textContent,'');assert.equal(h.element('result-atf').textContent,'\u2014');
    h.select(2);h.fill(base);h.calculate();assert.equal(h.element('atf-status').hidden,true);
    assert.equal(h.element('atf-status').textContent,'');
});

test('below-minimum presentation hides numeric threshold and exact value; clears after recovery',()=>{
    const h=harness();
    for(const [n,v]of [[1,'.89'],[2,'.90']])Object.assign(h.state.engines[n],{valid:true,etf:h.c.decimalValue(v)});
    h.c.renderAircraftSummary();assert.equal(h.element('result-atf').textContent,'0.90');
    assert.equal(h.element('result-atf').dataset.state,'below-minimum');
    assert.equal(h.element('atf-status').textContent,'ATF below minimum limit');assert.equal(h.element('atf-status').hidden,false);
    assert.equal(h.state.atf.exact.n*1000n,895n*h.state.atf.exact.d);
    h.state.engines[1].etf=h.c.decimalValue('.90');h.c.renderAircraftSummary();
    assert.equal(h.element('atf-status').hidden,true);assert.equal(h.element('atf-status').textContent,'');
    assert.equal(h.element('result-atf').dataset.state,'meets-minimum');
    h.state.engines[2].valid=false;h.c.renderAircraftSummary();
    assert.equal(h.element('result-atf').textContent,'\u2014');assert.equal(h.element('atf-status').hidden,true);
});
