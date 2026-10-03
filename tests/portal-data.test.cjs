const test = require('node:test');
const assert = require('node:assert/strict');

test('portal error display preserves Discord IDs and numeric-looking strings exactly', async () => {
 const { flatten } = await import('../portal/src/lib/util/data.js');
 for (const guild of ['1549159747897524315', '123456789012345678', '00123']) {
  assert.deepEqual(flatten({ guild }), [['guild', guild]]);
 }
});

test('Drive status reports download causes, unknown errors and persisted retry deadlines', async () => {
 const { driveErrorLabel, driveRetryLabel } = await import('../portal/src/lib/drive-status.js');
 assert.match(driveErrorLabel('DOWNLOAD'), /heruntergeladen/);
 assert.match(driveErrorLabel('SIZE_MISMATCH'), /Dateigröße/);
 assert.match(driveErrorLabel('SOURCE'), /Discord/);
 assert.match(driveErrorLabel('FILE_CONFLICT'), /Drive-Datei/);
 assert.match(driveErrorLabel('NEW_ERROR'), /NEW_ERROR/);
 const now=Date.parse('2026-10-03T10:00:00Z');
 assert.match(driveRetryLabel({nextAttemptAt:new Date(now+60000).toISOString(),attempts:12},now), /Nächster Versuch:.*Fehlversuche: 12/);
 assert.match(driveRetryLabel({nextAttemptAt:new Date(now-60000).toISOString()},now), /fällig/);
 assert.equal(driveRetryLabel({state:'missing'}),'Datei nicht gesichert');
 assert.equal(driveRetryLabel({nextAttemptAt:'invalid'}),'');
});

test('portal error display expands nested API errors without masking them with a null crash', async () => {
 const { flatten } = await import('../portal/src/lib/util/data.js');
 assert.deepEqual(flatten({ message: JSON.stringify({ error: 'Forbidden', guild: '1549159747897524315', details: null }) }), [
  ['message', [['error', 'Forbidden'], ['guild', '1549159747897524315'], ['details', 'null']]],
 ]);
 assert.deepEqual(flatten({ absent: undefined, details: null, status: 403 }), [['absent', 'undefined'], ['details', 'null'], ['status', '403']]);
});
