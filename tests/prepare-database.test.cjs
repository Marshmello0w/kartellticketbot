const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/prepare-database.js'), 'utf8');
function load(execFileSync) {
 const module = { exports: {} };
 vm.runInNewContext(source, {
  module, __dirname: path.join(__dirname, '../src/lib'), process,
  require: name => name === 'child_process' ? { execFileSync } : require(name),
 });
 return module.exports;
}
test('startup waits for database preparation using the local Node executable', () => {
 let call;
 load((...args) => { call = args; })();
 assert.equal(call[0], process.execPath);
 assert.equal(call[1][0], path.resolve(__dirname, '../scripts/postinstall.js'));
 assert.equal(call[2].cwd, path.resolve(__dirname, '..'));
 assert.equal(call[2].stdio, 'inherit');
});
test('failed migration/client generation stops startup', () => {
 const failure = new Error('migration failed');
 assert.throws(load(() => { throw failure; }), error => error === failure);
});
