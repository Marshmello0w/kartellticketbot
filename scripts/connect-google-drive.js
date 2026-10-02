#!/usr/bin/env node
// Standalone desktop setup: only Node.js is required, no bot secrets are needed.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

function launchBrowser(url) {
	const child = process.platform === 'win32'
		? spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
			stdio: 'ignore',
			windowsHide: true,
		})
		: spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' });
	child.on('error', () => {});
}
async function connect({
	clientFile, outputFile, openBrowser = launchBrowser, request = fetch, log = console.log,
}) {
	const installed = JSON.parse(fs.readFileSync(clientFile, 'utf8')).installed;
	if (!installed?.client_id || !installed.client_secret) throw new Error('Desktop OAuth credentials required');
	if (fs.existsSync(outputFile)) throw new Error('Output file already exists');
	const state = crypto.randomBytes(32).toString('base64url');
	const verifier = crypto.randomBytes(48).toString('base64url');
	const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
	const server = http.createServer();
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const redirectUri = 'http://127.0.0.1:' + server.address().port + '/callback';
	let timer;
	const callback = new Promise((resolve, reject) => {
		timer = setTimeout(() => reject(new Error('Login timeout')), 600000);
		server.on('request', (req, res) => {
			const url = new URL(req.url, redirectUri);
			if (url.pathname !== '/callback' || req.method !== 'GET') {
				res.writeHead(404);
				res.end();
				return;
			}
			const incoming = Buffer.from(url.searchParams.get('state') || '');
			const expected = Buffer.from(state);
			if (incoming.length !== expected.length || !crypto.timingSafeEqual(incoming, expected)) {
				res.writeHead(400);
				res.end('Invalid login state');
				return;
			}
			if (url.searchParams.has('error') || !url.searchParams.get('code')) {
				res.writeHead(400);
				res.end('Anmeldung abgebrochen.');
				reject(new Error('Login cancelled'));
				return;
			}
			res.writeHead(200, {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-store',
			});
			res.end('Google-Anmeldung abgeschlossen. Du kannst dieses Fenster schließen und zum Einrichtungsprogramm zurückkehren.');
			resolve(url.searchParams.get('code'));
		});
	});
	try {
		const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
		url.search = new URLSearchParams({
			client_id: installed.client_id,
			redirect_uri: redirectUri,
			response_type: 'code',
			scope: 'https://www.googleapis.com/auth/drive.file',
			access_type: 'offline',
			prompt: 'consent',
			state,
			code_challenge: challenge,
			code_challenge_method: 'S256',
		}).toString();
		log('Melde dich im Browser mit dem Google-Konto für das private Ticketarchiv an.');
		log('Falls sich kein Browser öffnet, öffne diese Adresse:\n' + url.href);
		await openBrowser(url.href);
		const code = await callback;
		const response = await request('https://oauth2.googleapis.com/token', {
			method: 'POST',
			signal: AbortSignal.timeout(30000),
			body: new URLSearchParams({
				client_id: installed.client_id,
				client_secret: installed.client_secret,
				redirect_uri: redirectUri,
				grant_type: 'authorization_code',
				code,
				code_verifier: verifier,
			}),
		});
		if (!response.ok) throw new Error('Token exchange failed');
		const tokens = await response.json();
		if (!tokens.refresh_token || !tokens.access_token) throw new Error('Offline authorization required');
		const root = await request('https://www.googleapis.com/drive/v3/files?fields=id', {
			method: 'POST',
			signal: AbortSignal.timeout(30000),
			headers: {
				Authorization: 'Bearer ' + tokens.access_token,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				name: 'Kartell Ticketarchive',
				mimeType: 'application/vnd.google-apps.folder',
				appProperties: { ticketArchiveRoot: '1' },
			}),
		});
		if (!root.ok) throw new Error('Folder creation failed');
		const { id } = await root.json();
		await fs.promises.mkdir(path.dirname(path.resolve(outputFile)), {
			recursive: true,
			mode: 0o700,
		});
		await fs.promises.writeFile(outputFile, JSON.stringify({
			clientId: installed.client_id,
			clientSecret: installed.client_secret,
			refreshToken: tokens.refresh_token,
			rootFolderId: id,
		}, null, 2), {
			mode: 0o600,
			flag: 'wx',
		});
		log('Verbindung eingerichtet. Zugangsdaten wurden ausschließlich in der angegebenen Ausgabedatei gespeichert.');
		log('Auf dem Bot-Host GOOGLE_DRIVE_AUTH_FILE auf diese Datei setzen und danach den Bot neu starten.');
	} finally {
		clearTimeout(timer);
		server.close();
		server.closeAllConnections();
	}
}
if (require.main === module) {
	const args = process.argv.slice(2);
	const clientFile = args[args.indexOf('--client') + 1];
	const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : './user/google-drive.json';
	if (!args.includes('--client') || !clientFile) {
		console.log('Einrichtung: node connect-google-drive.js --client desktop-oauth.json --output google-drive.json');
		process.exitCode = 1;
	} else {
		connect({
			clientFile,
			outputFile,
		}).catch(() => {
			console.error('Die Einrichtung wurde nicht abgeschlossen. Prüfe Desktop-Zugangsdaten, Drive-API und Anmeldung. Eine vorhandene Ausgabedatei wird nicht überschrieben.');
			process.exitCode = 1;
		});
	}
}
module.exports = { connect };
