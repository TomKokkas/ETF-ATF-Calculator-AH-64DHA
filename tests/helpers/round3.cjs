const assert=require('node:assert/strict');
const vm=require('node:vm');

// Explicit adjacent top-level declarations delimit the complete function,
// including nested blocks. Fail closed if this source layout changes.
function round3Source(code) {
    const start=code.indexOf('function round3(value) {');
    const end=code.indexOf('function readNumber(',start);
    assert.ok(start>=0&&end>start,'Expected round3/readNumber boundaries');
    assert.equal(code.indexOf('function round3(value) {',start+1),-1);
    const source=code.slice(start,end);
    const context=vm.createContext({});
    vm.runInContext(source,context);
    assert.equal(typeof context.round3,'function');
    return source;
}
function loadRound3(code) {
    const context=vm.createContext({});
    vm.runInContext(round3Source(code),context);
    return value=>context.round3(value);
}
module.exports={round3Source,loadRound3};
