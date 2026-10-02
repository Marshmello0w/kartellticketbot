const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { GoogleDrive } = require('../src/lib/google-drive');

const session = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test-session';
const chunkSize = 8 * 1024 * 1024;

async function fixture(t, handler) {
 const parent = path.resolve(__dirname, '../..');
 const directory = fs.mkdtempSync(path.join(parent, 'drive-http-test-'));
 const localPath = path.join(directory, 'image.png');
 const bytes = Buffer.alloc(chunkSize + 17, 42);
 fs.writeFileSync(localPath, bytes);
 t.after(() => {
  assert.ok(directory.startsWith(parent + path.sep + 'drive-http-test-'));
  fs.rmSync(directory, {recursive: true, force: true});
 });
 const server = http.createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch(() => {res.writeHead(500);res.end();});
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 t.after(() => new Promise(resolve => {server.close(resolve);server.closeAllConnections();}));
 const origin = 'http://127.0.0.1:' + server.address().port;
 const request = async (url, options) => {
  if (url.includes('oauth2.googleapis.com')) return Response.json({access_token: 'test-token', expires_in: 3600});
  if (!url.includes('/upload/')) return new Response(null, {status: 404});
  const target = new URL(url);
  // Keep the real fetch implementation: a mocked Response hides redirect errors.
  return fetch(origin + target.pathname + target.search, options);
 };
 const drive = () => new GoogleDrive({clientId: 'test-client', clientSecret: 'test-secret', refreshToken: 'test-refresh'}, request);
 const upload = {fileId: 'test-file', parent: 'test-folder', localPath, name: 'image.png', mime: 'image/png', ticketId: 'test-ticket', assetId: 'test-asset'};
 return {drive, upload, bytes};
}

function resumableServer() {
 const requests = [], uploaded = [], received = {size: 0};
 const handler = async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  requests.push({method: req.method, range: req.headers['content-range'], authorization: req.headers.authorization});
  if (req.method === 'POST') {
   res.writeHead(200, {Location: session});
  } else if (!body.length) {
   // Google's resumable status includes a Location header on HTTP 308.
   res.writeHead(308, {Location: session, ...(received.size ? {Range: 'bytes=0-' + (received.size - 1)} : {})});
  } else {
   uploaded.push(body);received.size += body.length;
   if (body.length === chunkSize) res.writeHead(308, {Location: session, Range: 'bytes=0-' + (received.size - 1)});
   else res.writeHead(200);
  }
  res.end();
 };
 return {handler, requests, uploaded};
}

test('real fetch accepts Google HTTP 308 with Location for status and incomplete chunks', async t => {
 const service = resumableServer(), f = await fixture(t, service.handler), progress = [];
 await f.drive().upload(f.upload, async (url, size) => progress.push([url, size]));
 assert.deepEqual(service.requests.map(r => r.range), [undefined, 'bytes */' + f.bytes.length, 'bytes 0-' + (chunkSize - 1) + '/' + f.bytes.length, 'bytes ' + chunkSize + '-' + (f.bytes.length - 1) + '/' + f.bytes.length]);
 assert.ok(service.requests.every(r => r.authorization === 'Bearer test-token'));
 assert.deepEqual(Buffer.concat(service.uploaded), f.bytes);
 assert.deepEqual(progress, [[session, 0], [session, chunkSize], [null, f.bytes.length]]);
});

test('real fetch resumes a persisted session on a new client without duplicating bytes', async t => {
 const service = resumableServer(), f = await fixture(t, service.handler);
 let savedSession;
 await assert.rejects(f.drive().upload(f.upload, async (url, size) => {
  savedSession = url;
  if (size === chunkSize) throw new Error('Simulated restart');
 }), /Simulated restart/);
 const progress = [];
 await f.drive().upload({...f.upload, session: savedSession}, async (url, size) => progress.push([url, size]));
 assert.equal(service.requests.filter(r => r.method === 'POST').length, 1);
 assert.equal(service.requests.filter(r => r.range === 'bytes */' + f.bytes.length).length, 2);
 assert.deepEqual(Buffer.concat(service.uploaded), f.bytes);
 assert.deepEqual(progress, [[null, f.bytes.length]]);
});

test('real fetch never follows upload redirects or forwards authorization to their destination', async t => {
 let destinationHits = 0;
 const f = await fixture(t, async (req, res) => {
  if (req.url === '/unexpected-destination') {destinationHits++;res.writeHead(200);}
  else res.writeHead(302, {Location: '/unexpected-destination'});
  res.end();
 });
 await assert.rejects(f.drive().upload(f.upload, async () => {}), error => error.code === 'UPLOAD');
 assert.equal(destinationHits, 0);
});
