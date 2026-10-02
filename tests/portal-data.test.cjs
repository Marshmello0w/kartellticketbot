const test = require('node:test');
const assert = require('node:assert/strict');

test('portal error display preserves Discord IDs and numeric-looking strings exactly', async () => {
 const { flatten } = await import('../portal/src/lib/util/data.js');
 for (const guild of ['1549159747897524315', '123456789012345678', '00123']) {
  assert.deepEqual(flatten({ guild }), [['guild', guild]]);
 }
});

test('portal error display expands nested API errors without masking them with a null crash', async () => {
 const { flatten } = await import('../portal/src/lib/util/data.js');
 assert.deepEqual(flatten({ message: JSON.stringify({ error: 'Forbidden', guild: '1549159747897524315', details: null }) }), [
  ['message', [['error', 'Forbidden'], ['guild', '1549159747897524315'], ['details', 'null']]],
 ]);
 assert.deepEqual(flatten({ absent: undefined, details: null, status: 403 }), [['absent', 'undefined'], ['details', 'null'], ['status', '403']]);
});
