const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/comfort.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
function clock() {
 const pending = new Set(); let unrefs = 0;
 const start = load('src/lib/ai-typing.js', { 'node:timers': {
  setTimeout: (callback, delay) => { const timer = { callback, delay, unref: () => unrefs++ }; pending.add(timer); return timer; },
  clearTimeout: timer => pending.delete(timer),
 } });
 return { start, pending, unrefs: () => unrefs, advance: async () => {
  const timer = pending.values().next().value; assert.ok(timer); assert.equal(timer.delay, 8000);
  pending.delete(timer); await timer.callback(); await flush();
 } };
}

test('typing starts immediately, stays visible through a slow answer and cancels its scheduled refresh on completion', async () => {
 const c = clock(); let calls = 0;
 const stop = c.start({ sendTyping: async () => calls++ }, async () => true);
 await flush(); assert.equal(calls, 1); assert.equal(c.pending.size, 1); assert.equal(c.unrefs(), 1);
 await c.advance(); await c.advance(); assert.equal(calls, 3); assert.equal(c.pending.size, 1);
 stop(); stop(); assert.equal(c.pending.size, 0); assert.equal(calls, 3);
});

test('staff takeover or ticket closure stops the indicator before another typing request', async () => {
 const c = clock(); let active = true, calls = 0;
 c.start({ sendTyping: async () => calls++ }, async () => active);
 await flush(); active = false; await c.advance(); assert.equal(calls, 1); assert.equal(c.pending.size, 0);
});

test('typing errors do not block an answer and an in-flight check cannot send after completion', async () => {
 const c = clock(); let calls = 0, release;
 const stop = c.start({ sendTyping: async () => { calls++; throw new Error('Missing permission'); } }, async () => true);
 await flush(); assert.equal(calls, 1); assert.equal(c.pending.size, 1); stop(); assert.equal(c.pending.size, 0);
 const delayed = c.start({ sendTyping: async () => calls++ }, () => new Promise(resolve => { release = resolve; }));
 delayed(); release(true); await flush(); assert.equal(calls, 1); assert.equal(c.pending.size, 0);
});

test('slow typing requests never overlap or create timers after cancellation; unsupported channels are harmless', async () => {
 const c = clock(); let calls = 0, release;
 const stop = c.start({ sendTyping: () => { calls++; return new Promise(resolve => { release = resolve; }); } }, async () => true);
 await flush(); assert.equal(calls, 1); assert.equal(c.pending.size, 0);
 stop(); release(); await flush(); assert.equal(c.pending.size, 0);
 c.start({}, async () => assert.fail('Unsupported channel'))(); await flush(); assert.equal(calls, 1);
});
