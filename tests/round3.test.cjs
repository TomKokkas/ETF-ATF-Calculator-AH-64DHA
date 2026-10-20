const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {loadRound3}=require('./helpers/round3.cjs');
const round3=loadRound3(fs.readFileSync(path.join(__dirname,'../js/calculator.js'),'utf8'));

// Independent decimal oracle: expand a decimal string and perform digit-wise
// schoolbook rounding/carry. No BigInt, binary multiplication, or production
// quotient/remainder algorithm is used here.
function decimalOracle(text) {
    const negative=text.startsWith('-');
    const [mantissa,exponent='0']=text.replace(/^[-+]/,'').toLowerCase().split('e');
    const [whole,fraction='']=mantissa.split('.');
    const digits=whole+fraction,point=whole.length+Number(exponent);
    const expanded=point<=0?'0.'+'0'.repeat(-point)+digits:
        point>=digits.length?digits+'0'.repeat(point-digits.length)+'.':
        digits.slice(0,point)+'.'+digits.slice(point);
    const [integer,decimals='']=expanded.split('.');
    const tail=decimals.slice(3);
    const retained=(integer+decimals.slice(0,3).padEnd(3,'0')).split('');
    const greaterHalf=tail[0]>'5'||(tail[0]==='5'&&/[1-9]/.test(tail.slice(1)));
    const exactHalf=tail[0]==='5'&&!/[1-9]/.test(tail.slice(1));
    if(greaterHalf||(exactHalf&&!negative)) {
        let i=retained.length-1;
        while(i>=0&&retained[i]==='9'){retained[i]='0';i--;}
        if(i<0)retained.unshift('1');else retained[i]=String(Number(retained[i])+1);
    }
    const result=retained.join('').padStart(4,'0');
    return Number((negative?'-':'')+result.slice(0,-3)+'.'+result.slice(-3));
}

test('independent decimal oracle has explicit anchor expectations',()=>{
    for(const [text,expected]of [['2.0035',2.004],['-0.0625',-.062],['-2.0035000000000003',-2.004],['4.9995',5],['-4.9995',-4.999],['1e-7',0]])assert.equal(decimalOracle(text),expected);
});

test('positive/negative halfway and both near-halfway sides match the decimal oracle',()=>{
    const values=[.0625,-.0625,.97049,.9705,.97099,2.0035,4.0005,
        2.0034999999999994,2.0035000000000003,-2.0034999999999994,
        -2.0035,-2.0035000000000003,.0004999999999999999,
        .0005000000000000001,-.0004999999999999999,-.0005000000000000001];
    for(const value of values)assert.equal(round3(value),decimalOracle(String(value)),String(value));
});

test('200000 positive halfway values and 10000 negative counterparts match the oracle',()=>{
    for(let k=0;k<200000;k++) {
        const text=`${Math.floor(k/1000)}.${String(k%1000).padStart(3,'0')}5`;
        assert.equal(round3(Number(text)),decimalOracle(text),text);
        if(k<10000)assert.equal(round3(-Number(text)),decimalOracle('-'+text),'-'+text);
    }
});

test('very small, large, scientific notation and carry cases match the oracle',()=>{
    for(const value of [Number.MIN_VALUE,-Number.MIN_VALUE,1e-7,-1e-7,5e-4,-5e-4,
        9.9995,-9.9995,1000.0005,-1000.0005,123456.7895,1e21,-1e21,
        Number.MAX_VALUE,-Number.MAX_VALUE])assert.equal(round3(value),decimalOracle(String(value)),String(value));
});

test('signed zero is preserved, including negative values rounded to zero',()=>{
    for(const value of [-0,-.0001,-.0005,-Number.MIN_VALUE])assert.equal(Object.is(round3(value),-0),true);
    for(const value of [0,.0001,Number.MIN_VALUE])assert.equal(Object.is(round3(value),0),true);
});

test('non-finite and non-number inputs are rejected explicitly',()=>{
    for(const value of [NaN,Infinity,-Infinity,'0.9705',null,undefined])assert.throws(()=>round3(value),/finite number/);
});

test('rounded results are idempotent across signs and scales',()=>{
    for(const value of [-123456.7895,-2.0035000000000003,-.0005,0,.9705,2.0035,1e21]) {
        const rounded=round3(value);assert.equal(round3(rounded),rounded);
    }
});
