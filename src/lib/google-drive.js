const fs = require('node:fs');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

class DriveError extends Error {
	constructor(code, retryAfter = 0) {
		super('Google Drive: ' + code);
		this.code = code;
		this.retryAfter = retryAfter;
	}
}
class GoogleDrive {
	constructor(config, request = fetch) {
		this.config = config;
		this.fetch = request;
		this.token = null;
		this.expires = 0;
	}
	async accessToken() {
		if (this.token && this.expires > Date.now() + 60000) return this.token;
		if (!this.refreshing) {
			this.refreshing = (async () => {
				const response = await this.fetch('https://oauth2.googleapis.com/token', {
					method: 'POST',
					signal: AbortSignal.timeout(30000),
					body: new URLSearchParams({
						client_id: this.config.clientId,
						client_secret: this.config.clientSecret,
						refresh_token: this.config.refreshToken,
						grant_type: 'refresh_token',
					}),
				});
				if (!response.ok) throw new DriveError('AUTH');
				const token = await response.json();
				if (!token.access_token) throw new DriveError('AUTH');
				this.token = token.access_token;
				this.expires = Date.now() + (Number(token.expires_in) || 3600) * 1000;
				return this.token;
			})().finally(() => {
				this.refreshing = null;
			});
		}
		return this.refreshing;
	}
	async request(url, options = {}) {
		// Drive uses HTTP 308 for unfinished uploads. Expose that response without
		// following redirects or forwarding tokens to another destination.
		const destination = new URL(url);
		if (destination.protocol !== 'https:' || destination.hostname !== 'www.googleapis.com') throw new DriveError('UNSAFE_URL');
		const response = await this.fetch(url, {
			...options,
			redirect: 'manual',
			signal: options.signal || AbortSignal.timeout(60000),
			headers: {
				...options.headers,
				Authorization: 'Bearer ' + await this.accessToken(),
			},
		});
		if (response.status === 401) {
			this.token = null;
			throw new DriveError('AUTH');
		}
		if (![200, 201, 204, 308, 404, 409].includes(response.status)) {
			let reason;
			try {
				reason = (await response.json()).error?.errors?.[0]?.reason;
			} catch { /* Only the safe error code is exposed. */ }
			throw new DriveError(reason === 'storageQuotaExceeded' ? 'QUOTA' : response.status === 429 || ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason) ? 'RATE_LIMIT' : response.status === 403 ? 'PERMISSION' : 'UPLOAD', (Number(response.headers.get('retry-after')) || 0) * 1000);
		}
		return response;
	}
	async id() {
		const response = await this.request('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive');
		return (await response.json()).ids[0];
	}
	async metadata(id) {
		const response = await this.request('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=id,name,parents,mimeType,trashed,appProperties,size,capabilities(canAddChildren,canDownload),permissions(type,role)');
		if (response.status === 404) return null;
		return response.json();
	}
	async validateRoot() {
		const root = await this.metadata(this.config.rootFolderId);
		if (!root || root.trashed || root.mimeType !== 'application/vnd.google-apps.folder' || !root.capabilities?.canAddChildren) throw new DriveError('FOLDER');
		if (root.appProperties?.ticketArchiveRoot !== '1') throw new DriveError('FOLDER');
		if ((root.permissions || []).some(p => p.role !== 'owner')) throw new DriveError('NOT_PRIVATE');
		return root;
	}
	async folder(id, name, parent, ticketId) {
		const existing = await this.metadata(id);
		if (existing) {
			if (existing.trashed || !existing.parents?.includes(parent) || existing.appProperties?.ticketArchive !== ticketId) throw new DriveError('FOLDER');
			if ((existing.permissions || []).some(p => p.role !== 'owner')) throw new DriveError('NOT_PRIVATE');
			return;
		}
		const response = await this.request('https://www.googleapis.com/drive/v3/files?fields=id', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				id,
				name,
				parents: [parent],
				mimeType: 'application/vnd.google-apps.folder',
				appProperties: { ticketArchive: ticketId },
			}),
		});
		if (response.status === 409) return this.folder(id, name, parent, ticketId);
	}
	async upload({
		fileId, parent, localPath, name, mime, ticketId, assetId, session,
	}, saveProgress) {
		const existing = await this.metadata(fileId);
		const size = (await fs.promises.stat(localPath)).size;
		if (existing && !existing.trashed) {
			if (!existing.parents?.includes(parent) || existing.appProperties?.ticketArchive !== ticketId || existing.appProperties?.asset !== assetId || Number(existing.size) !== size) throw new DriveError('FILE_CONFLICT');
			if ((existing.permissions || []).some(p => p.role !== 'owner')) throw new DriveError('NOT_PRIVATE');
			return;
		}
		if (!session) {
			const response = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Upload-Content-Type': mime,
					'X-Upload-Content-Length': String(size),
				},
				body: JSON.stringify({
					id: fileId,
					name,
					parents: [parent],
					mimeType: mime,
					appProperties: {
						ticketArchive: ticketId,
						asset: assetId,
					},
				}),
			});
			if (response.status === 409) throw new DriveError('FILE_CONFLICT');
			session = response.headers.get('location');
			if (!session) throw new DriveError('UPLOAD');
			await saveProgress(session, 0);
		}
		let probe = await this.request(session, {
			method: 'PUT',
			headers: {
				'Content-Length': '0',
				'Content-Range': 'bytes */' + size,
			},
		});
		if (probe.status === 404) {
			await saveProgress(null, 0);
			throw new DriveError('SESSION_EXPIRED');
		}
		if ([200, 201].includes(probe.status)) return;
		let offset = Number(probe.headers.get('range')?.match(/-(\d+)$/)?.[1] ?? -1) + 1;
		while (offset < size || size === 0) {
			const end = Math.min(size, offset + 8 * 1024 * 1024) - 1;
			const body = size ? fs.createReadStream(localPath, {
				start: offset,
				end,
			}) : Buffer.alloc(0);
			probe = await this.request(session, {
				method: 'PUT',
				body,
				duplex: 'half',
				headers: {
					'Content-Length': String(Math.max(0, end - offset + 1)),
					'Content-Range': size ? 'bytes ' + offset + '-' + end + '/' + size : 'bytes */0',
				},
			});
			if ([200, 201].includes(probe.status)) {
				await saveProgress(null, size);
				return;
			}
			if (probe.status === 404) {
				await saveProgress(null, 0);
				throw new DriveError('SESSION_EXPIRED');
			}
			const next = Number(probe.headers.get('range')?.match(/-(\d+)$/)?.[1] ?? -1) + 1;
			if (next <= offset) throw new DriveError('UPLOAD');
			offset = next;
			await saveProgress(session, offset);
		}
	}
	async download(id, destination) {
		const response = await this.request('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media', { signal: AbortSignal.timeout(300000) });
		if (response.status === 404) throw new DriveError('MISSING');
		if (response.status !== 200) throw new DriveError('DOWNLOAD');
		const temporary = destination + '.part';
		try {
			await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary, { mode: 0o600 }));
			await fs.promises.rename(temporary, destination);
		} catch (error) {
			await fs.promises.unlink(temporary).catch(() => {});
			throw error;
		}
	}
	async remove(id, ticketId) {
		const file = await this.metadata(id);
		if (!file) return;
		if (file.appProperties?.ticketArchive !== ticketId) throw new DriveError('DELETE_REFUSED');
		if (file.mimeType === 'application/vnd.google-apps.folder') {
			const query = new URLSearchParams({
				q: '\'' + id.replace(/['\\]/g, '\\$&') + '\' in parents',
				fields: 'files(id,appProperties),nextPageToken',
				pageSize: '100',
			});
			let page;
			do {
				if (page) query.set('pageToken', page);
				const response = await this.request('https://www.googleapis.com/drive/v3/files?' + query);
				const children = await response.json();
				// A manually moved foreign file must never be deleted with the folder.
				if ((children.files || []).some(child => child.appProperties?.ticketArchive !== ticketId)) throw new DriveError('DELETE_REFUSED');
				for (const child of children.files || []) await this.remove(child.id, ticketId);
				page = children.nextPageToken;
			} while (page);
		}
		const response = await this.request('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id), { method: 'DELETE' });
		if (![204, 404].includes(response.status)) throw new DriveError('DELETE');
	}
}

function getDrive(client) {
	if (client.driveAdapter) return client.driveAdapter;
	const authFile = process.env.GOOGLE_DRIVE_AUTH_FILE;
	if (!authFile) throw new DriveError('NOT_CONFIGURED');
	let config;
	try {
		config = JSON.parse(fs.readFileSync(authFile, 'utf8'));
	} catch {
		throw new DriveError('NOT_CONFIGURED');
	}
	if (!['clientId', 'clientSecret', 'refreshToken', 'rootFolderId'].every(key => typeof config[key] === 'string' && config[key].length)) throw new DriveError('NOT_CONFIGURED');
	if (!client.googleDrive || ['clientId', 'clientSecret', 'refreshToken', 'rootFolderId'].some(key => client.googleDrive.config[key] !== config[key])) client.googleDrive = new GoogleDrive(config);
	return client.googleDrive;
}
module.exports = {
	DriveError,
	GoogleDrive,
	getDrive,
};
