const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
	Readable, Transform,
} = require('node:stream');
const { pipeline } = require('node:stream/promises');
const archiver = require('archiver');
const {
	getDrive, DriveError,
} = require('./google-drive');
const {
	avatarUrl, discordAssetKey,
} = require('./transcript-html');
const encrypt = value => require('./crypto').encrypt(value);
const decrypt = value => require('./crypto').decrypt(value);

const RETENTION = 90 * 86400000;
const assetJobs = new Map();
const sourceJobs = new Map();
const archiveJobs = new Map();
const ticks = new WeakSet();
const sweepCursors = new WeakMap();
const readers = new Map();
const downloadJobs = new Map();
function concurrencyLimit(maximum) {
	let running = 0;
	const waiting = [];
	return async () => {
		if (running >= maximum) await new Promise(resolve => waiting.push(resolve));
		else running++;
		return () => {
			const next = waiting.shift();
			if (next) next();
			else running--;
		};
	};
}
const assetSlot = concurrencyLimit(2);
const sourceSlot = concurrencyLimit(2);
const delay = attempts => attempts === 1 ? 60000 : attempts === 2 ? 300000 : 900000;
const hash = value => createHash('sha256').update(value).digest('hex');
const codes = new Set(['AUTH', 'QUOTA', 'PERMISSION', 'RATE_LIMIT', 'UPLOAD', 'DOWNLOAD', 'SIZE_MISMATCH', 'DOWNLOAD_LIMIT', 'SOURCE', 'MISSING', 'FOLDER', 'NOT_PRIVATE', 'NOT_CONFIGURED', 'SESSION_EXPIRED', 'FILE_CONFLICT', 'DELETE', 'DELETE_REFUSED', 'UNSAFE_URL', 'EXPIRED', 'DISK', 'TICKET_REMOVED']);
const codeOf = error => codes.has(error?.code) ? error.code : ['ENOSPC', 'EACCES', 'EPERM'].includes(error?.code) ? 'DISK' : 'UPLOAD';
const filename = value => {
	// eslint-disable-next-line no-control-regex -- Reject control characters in file names.
	let name = String(value || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+|[. ]+$/g, '').slice(0, 120) || 'file';
	if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) name = '_' + name;
	return name;
};
function spool(archiveId, relative = '') {
	if (!/^\d{17,20}$/.test(archiveId)) throw new DriveError('UNSAFE_URL');
	const root = path.resolve('./user/drive-spool', archiveId);
	const target = path.resolve(root, relative);
	if (target !== root && !target.startsWith(root + path.sep)) throw new DriveError('UNSAFE_URL');
	return target;
}
async function prepare(archiveId) {
	await fs.promises.mkdir(spool(archiveId), {
		recursive: true,
		mode: 0o700,
	});
}
function sourceUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' && !url.port && !url.username && !url.password &&
			['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) &&
			/^\/(attachments\/|avatars\/|guilds\/\d+\/users\/\d+\/avatars\/|embed\/avatars\/|emojis\/)/.test(url.pathname) ? url.href : null;
	} catch {
		return null;
	}
}
function originalSourceUrl(value) {
	const allowed = sourceUrl(value);
	if (!allowed) return null;
	const url = new URL(allowed);
	if (url.pathname.startsWith('/attachments/')) {
		url.hostname = 'cdn.discordapp.com';
		for (const parameter of ['width', 'height', 'format', 'quality', 'size']) url.searchParams.delete(parameter);
	}
	return url.href;
}
async function ensureArchive(client, ticket) {
	if (!client.prisma.driveArchive || !ticket.guild?.driveArchiveEnabled || !ticket.guild.archive || process.env.OVERRIDE_ARCHIVE === 'false') return null;
	let archive = await client.prisma.driveArchive.findUnique({ where: { id: ticket.id } });
	if (archive || !ticket.open) return archive;
	let rootFolderId = 'unconfigured';
	try {
		rootFolderId = getDrive(client).config.rootFolderId;
	} catch { /* Only the safe error code is exposed. */ }
	archive = await client.prisma.driveArchive.upsert({
		where: { id: ticket.id },
		update: {},
		create: {
			id: ticket.id,
			guildId: ticket.guildId,
			number: ticket.number,
			rootFolderId,
		},
	});
	return archive;
}
function contentAssets(content, messageId) {
	const assets = (content.attachments || []).filter(a => a.id && sourceUrl(a.url)).map(a => ({
		key: 'attachment:' + a.id,
		isAttachment: true,
		url: originalSourceUrl(a.url),
		messageId,
		name: a.name || a.filename || 'file',
		mime: a.contentType || a.content_type || 'application/octet-stream',
		size: a.size || 0,
	}));
	const avatar = avatarUrl(content.author);
	if (sourceUrl(avatar)) {
		assets.push({
			key: discordAssetKey(avatar),
			url: avatar,
			messageId,
			name: 'avatar.png',
			mime: 'image/png',
		});
	}
	const text = [content.content, ...(content.embeds || []).flatMap(original => {
		const e = original.data || original;
		for (const url of [e.image?.url, e.thumbnail?.url, e.author?.icon_url, e.footer?.icon_url]) {
			// A preview of an attachment must not replace its original file URL.
			if (sourceUrl(url) && !assets.some(a => a.key === discordAssetKey(url))) {
				assets.push({
					key: discordAssetKey(url),
					url: originalSourceUrl(url),
					messageId,
					name: 'embed.png',
					mime: 'image/png',
				});
			}
		}
		return [e.title, e.description, ...(e.fields || []).flatMap(f => [f.name, f.value])];
	})].join('\n');
	for (const match of text.matchAll(/<(a?):[A-Za-z0-9_]+:(\d+)>/g)) {
		const url = 'https://cdn.discordapp.com/emojis/' + match[2] + '.' + (match[1] ? 'gif' : 'png');
		assets.push({
			key: 'emoji:' + match[2],
			url,
			messageId,
			name: 'emoji.' + (match[1] ? 'gif' : 'png'),
			mime: match[1] ? 'image/gif' : 'image/png',
		});
	}
	for (const row of content.components || []) {
		for (const original of row.components || row.data?.components || []) {
			const emoji = (original.data || original).emoji;
			if (emoji?.id && /^\d+$/.test(emoji.id)) {
				const url = 'https://cdn.discordapp.com/emojis/' + emoji.id + '.' + (emoji.animated ? 'gif' : 'png');
				assets.push({
					key: 'emoji:' + emoji.id,
					url,
					messageId,
					name: 'emoji.' + (emoji.animated ? 'gif' : 'png'),
					mime: emoji.animated ? 'image/gif' : 'image/png',
				});
			}
		}
	}
	return assets;
}
async function captureContent(client, ticket, content, messageId) {
	const archive = await ensureArchive(client, ticket);
	if (!archive || ['deleting', 'deleted', 'ready'].includes(archive.state) || archive.expiresAt && archive.expiresAt <= new Date()) return;
	for (const input of contentAssets(content, messageId)) {
		const id = hash(ticket.id + ':' + input.key);
		const name = filename(input.name);
		const existing = await client.prisma.driveAsset.findUnique({ where: { id } });
		// Other messages can embed the same attachment: retain its original source and metadata.
		if (existing?.assetKey.startsWith('attachment:') && existing.size > 0 && !input.isAttachment) continue;
		const refreshed = existing?.state === 'missing' && decrypt(existing.sourceUrl) !== input.url;
		const row = await client.prisma.driveAsset.upsert({
			where: { id },
			update: {
				sourceUrl: encrypt(input.url),
				...(input.isAttachment && !existing?.localReady && existing?.state !== 'ready' ? {
					size: input.size || 0,
					mime: input.mime,
					fileName: name,
				} : {}),
				...(refreshed ? {
					state: 'pending',
					errorCode: null,
					attempts: 0,
					nextAttemptAt: null,
				} : {}),
				...(input.isAttachment ? { messageId: input.messageId } : {}),
			},
			create: {
				id,
				archiveId: archive.id,
				assetKey: input.key,
				sourceUrl: encrypt(input.url),
				messageId: input.messageId,
				fileName: name,
				relativePath: 'files/' + id + '-' + name,
				mime: input.mime,
				size: input.size || 0,
			},
		});
		if (row.state === 'pending') processAsset(client, id).catch(() => {});
	}
}
async function markClosed(client, ticket) {
	const archive = await client.prisma.driveArchive?.findUnique({ where: { id: ticket.id } });
	if (!archive || ['deleting', 'deleted'].includes(archive.state)) return;
	if (!archive.closedAt) {
		await client.prisma.driveArchive.update({
			where: { id: ticket.id },
			data: {
				closedAt: ticket.closedAt,
				expiresAt: new Date(ticket.closedAt.getTime() + RETENTION),
				transcriptChannelId: ticket.guild.transcriptChannel,
				nextAttemptAt: null,
			},
		});
	}
	processArchive(client, ticket.id).catch(() => client.log.warn('Drive archive completion pending for ticket %s', ticket.id));
}
async function downloadSource(client, asset, target) {
	const archiveId = asset.archiveId;
	let url = originalSourceUrl(decrypt(asset.sourceUrl));
	if (!url) throw new DriveError('UNSAFE_URL');
	// Repair existing tasks using the original attachment in the archived message.
	if (asset.assetKey.startsWith('attachment:') && asset.messageId && ['DOWNLOAD', 'SIZE_MISMATCH'].includes(asset.errorCode)) {
		const message = await client.prisma.archivedMessage.findUnique({
			where: { id: asset.messageId },
			select: { content: true },
		});
		if (message) {
			const content = JSON.parse(decrypt(message.content));
			const attachment = content.attachments?.find(item => 'attachment:' + item.id === asset.assetKey);
			url = originalSourceUrl(attachment?.url) || url;
		}
	}
	if (url !== decrypt(asset.sourceUrl)) {
		await client.prisma.driveAsset.update({
			where: { id: asset.id },
			data: { sourceUrl: encrypt(url) },
		});
	}
	let response;
	for (let attempt = 0; attempt < 2; attempt++) {
		response = await (client.archiveFetch || fetch)(url, {
			redirect: 'error',
			signal: AbortSignal.timeout(300000),
		});
		if (![403, 404].includes(response.status)) break;
		if (!attempt && asset.assetKey.startsWith('attachment:') && asset.messageId) {
			try {
				const channel = await client.channels.fetch(archiveId);
				const message = await channel.messages.fetch({
					message: asset.messageId,
					force: true,
					cache: false,
				});
				const attachment = message.attachments.get(asset.assetKey.slice(11));
				if (!attachment || !sourceUrl(attachment.url)) throw new DriveError('MISSING');
				url = originalSourceUrl(attachment.url);
				await client.prisma.driveAsset.update({
					where: { id: asset.id },
					data: { sourceUrl: encrypt(url) },
				});
				continue;
			} catch (error) {
				if (error.code === 'MISSING' || [10003, 10008].includes(error.code)) throw new DriveError('MISSING');
				throw new DriveError('SOURCE');
			}
		}
		if (response.status === 404 || asset.attempts >= 2) throw new DriveError('MISSING');
		throw new DriveError('SOURCE');
	}
	if (!response.ok) throw new DriveError('SOURCE', (Number(response.headers.get('retry-after')) || 0) * 1000);
	let bytes = 0;
	// Bound unexpected responses using the Discord attachment's declared size.
	const maximum = asset.size > 0 ? asset.size : 16 * 1024 * 1024;
	const counter = new Transform({
		transform(chunk, encoding, done) {
			bytes += chunk.length;
			done(bytes > maximum ? new DriveError(asset.size > 0 ? 'SIZE_MISMATCH' : 'DOWNLOAD_LIMIT') : null, chunk);
		},
	});
	const temporary = target + '.part';
	try {
		await pipeline(Readable.fromWeb(response.body), counter, fs.createWriteStream(temporary, { mode: 0o600 }));
		if (asset.assetKey.startsWith('attachment:') && asset.size && bytes !== asset.size) throw new DriveError('SIZE_MISMATCH');
		await fs.promises.rename(temporary, target);
	} catch (error) {
		await fs.promises.unlink(temporary).catch(() => {});
		throw error;
	}
	return bytes;
}
function stageAsset(client, id) {
	if (sourceJobs.has(id)) return sourceJobs.get(id);
	const job = (async () => {
		const release = await sourceSlot();
		try {
			return await stageAssetNow(client, id);
		} finally {
			release();
		}
	})().finally(() => sourceJobs.delete(id));
	sourceJobs.set(id, job);
	return job;
}
async function stageAssetNow(client, id) {
	const asset = await client.prisma.driveAsset.findUnique({
		where: { id },
		include: { archive: true },
	});
	if (!asset || ['deleting', 'deleted'].includes(asset.archive.state) || asset.archive.expiresAt && asset.archive.expiresAt <= new Date()) return false;
	if (asset.state === 'ready') return true;
	if (asset.state !== 'pending') return false;
	const target = spool(asset.archiveId, asset.relativePath);
	if (asset.localReady && fs.existsSync(target)) return true;
	if (asset.nextAttemptAt && asset.nextAttemptAt > new Date()) return false;
	const claim = await client.prisma.driveAsset.updateMany({
		where: {
			id,
			state: 'pending',
			AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] }, { OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] }],
		},
		data: { leaseUntil: new Date(Date.now() + 600000) },
	});
	if (!claim.count) return false;
	try {
		await prepare(asset.archiveId);
		await fs.promises.mkdir(path.dirname(target), {
			recursive: true,
			mode: 0o700,
		});
		const size = await downloadSource(client, asset, target);
		await client.prisma.driveAsset.update({
			where: { id },
			data: {
				localReady: true,
				size,
			},
		});
		return true;
	} catch (error) {
		const attempts = asset.attempts + 1;
		const code = codeOf(error) === 'UPLOAD' ? 'SOURCE' : codeOf(error);
		const unavailable = code === 'MISSING' || code === 'UNSAFE_URL' || ['SIZE_MISMATCH', 'DOWNLOAD_LIMIT'].includes(code) && attempts >= 3;
		await client.prisma.driveAsset.update({
			where: { id },
			data: {
				state: unavailable ? 'missing' : 'pending',
				errorCode: code,
				attempts,
				nextAttemptAt: unavailable ? null : new Date(Date.now() + Math.max(delay(attempts), error.retryAfter || 0)),
			},
		});
		client.log.warn('Drive attachment %s (ticket #%d, %s): %s; attempts: %d', id, asset.archive.number, asset.fileName, code, attempts);
		return false;
	} finally {
		await client.prisma.driveAsset.update({
			where: { id },
			data: { leaseUntil: null },
		});
	}
}
async function stageTicketAssets(client, ticketId) {
	if (!client.prisma.driveAsset) return;
	let cursor;
	while (true) {
		const assets = await client.prisma.driveAsset.findMany({
			where: {
				archiveId: ticketId,
				state: 'pending',
			},
			select: { id: true },
			orderBy: { id: 'asc' },
			take: 100,
			...(cursor ? {
				cursor: { id: cursor },
				skip: 1,
			} : {}),
		});
		await Promise.allSettled(assets.map(asset => stageAsset(client, asset.id)));
		if (assets.length < 100) break;
		cursor = assets.at(-1).id;
	}
}
function processAsset(client, id) {
	if (assetJobs.has(id)) return assetJobs.get(id);
	const job = (async () => {
		// CDN downloads have their own slots, so slow Drive uploads cannot hold them up.
		if (!await stageAsset(client, id)) return;
		const release = await assetSlot();
		try {
			await processAssetNow(client, id);
		} finally {
			release();
		}
	})().finally(() => assetJobs.delete(id));
	assetJobs.set(id, job);
	return job;
}
async function processAssetNow(client, id) {
	let asset = await client.prisma.driveAsset.findUnique({
		where: { id },
		include: { archive: true },
	});
	if (!asset || asset.state !== 'pending' || asset.nextAttemptAt && asset.nextAttemptAt > new Date()) return;
	if (['deleting', 'deleted'].includes(asset.archive.state) || asset.archive.expiresAt && asset.archive.expiresAt <= new Date()) return;
	const claim = await client.prisma.driveAsset.updateMany({
		where: {
			id,
			state: 'pending',
			AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] }, { OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] }],
		},
		data: { leaseUntil: new Date(Date.now() + 600000) },
	});
	if (!claim.count) return;
	try {
		const target = spool(asset.archiveId, asset.relativePath);
		if (!asset.localReady || !fs.existsSync(target)) throw new DriveError('DISK');
		const drive = getDrive(client);
		await drive.validateRoot();
		const archive = await ensureFolder(client, asset.archive, drive);
		if (!asset.driveFileId) {
			asset = await client.prisma.driveAsset.update({
				where: { id },
				data: { driveFileId: await drive.id() },
			});
		}
		await drive.upload({
			fileId: asset.driveFileId,
			parent: archive.folderId,
			localPath: target,
			name: asset.fileName,
			mime: asset.mime,
			ticketId: archive.id,
			assetId: id,
			session: asset.uploadSession ? decrypt(asset.uploadSession) : null,
		}, async (session, uploadedBytes) => {
			const fresh = await client.prisma.driveArchive.findUnique({ where: { id: archive.id } });
			if (['deleting', 'deleted'].includes(fresh.state) || fresh.expiresAt && fresh.expiresAt <= new Date()) throw new DriveError('EXPIRED');
			return client.prisma.driveAsset.update({
				where: { id },
				data: {
					uploadSession: session ? encrypt(session) : null,
					uploadedBytes,
					leaseUntil: new Date(Date.now() + 600000),
				},
			});
		});
		await client.prisma.driveAsset.update({
			where: { id },
			data: {
				state: 'ready',
				localReady: false,
				nextAttemptAt: null,
				leaseUntil: null,
				errorCode: null,
				uploadSession: null,
			},
		});
		await fs.promises.unlink(target).catch(() => {});
	} catch (error) {
		const attempts = asset.attempts + 1;
		const code = codeOf(error);
		await client.prisma.driveAsset.update({
			where: { id },
			data: {
				state: code === 'MISSING' || code === 'UNSAFE_URL' ? 'missing' : 'pending',
				errorCode: code,
				attempts,
				leaseUntil: null,
				nextAttemptAt: code === 'MISSING' || code === 'UNSAFE_URL' ? null : new Date(Date.now() + Math.max(delay(attempts), error.retryAfter || 0)),
			},
		});
		client.log.warn('Drive attachment %s: %s', id, code);
	}
}
async function ensureFolder(client, archive, drive) {
	if (archive.rootFolderId === 'unconfigured') {
		archive = await client.prisma.driveArchive.update({
			where: { id: archive.id },
			data: { rootFolderId: drive.config.rootFolderId },
		});
	}
	if (archive.rootFolderId !== drive.config.rootFolderId) throw new DriveError('FOLDER');
	if (!archive.folderId) {
		const id = await drive.id();
		await client.prisma.driveArchive.updateMany({
			where: {
				id: archive.id,
				folderId: null,
			},
			data: { folderId: id },
		});
		archive = await client.prisma.driveArchive.findUnique({ where: { id: archive.id } });
	}
	await drive.folder(archive.folderId, archive.guildId + '-ticket-' + archive.number + '-' + archive.id, archive.rootFolderId, archive.id);
	return archive;
}
async function writeZip(client, archive, ticket, assets) {
	await prepare(archive.id);
	const drive = getDrive(client);
	const mapped = new Map();
	const downloaded = [];
	for (const asset of assets) {
		const target = spool(archive.id, asset.relativePath);
		if (asset.state === 'ready') {
			await fs.promises.mkdir(path.dirname(target), {
				recursive: true,
				mode: 0o700,
			});
			if (!fs.existsSync(target)) {
				try {
					await drive.download(asset.driveFileId, target);
				} catch (error) {
					if (error.code !== 'MISSING') throw error;
					await client.prisma.driveAsset.update({
						where: { id: asset.id },
						data: {
							state: 'missing',
							errorCode: 'MISSING',
						},
					});
					asset.state = 'missing';
				}
			}
			if (asset.state === 'ready') {
				downloaded.push({
					path: target,
					name: asset.relativePath,
				});
			}
		}
		mapped.set(asset.assetKey, { path: asset.state === 'ready' ? asset.relativePath : null });
		// Embed URLs can point at a message attachment rather than the media key.
		mapped.set(decrypt(asset.sourceUrl), mapped.get(asset.assetKey));
	}
	const { renderTranscript } = require('./transcripts');
	const { transcript } = await renderTranscript(client, ticket, {
		assets: mapped,
		forceHtml: true,
	});
	const target = spool(archive.id, 'archive.zip');
	const zip = archiver('zip', { zlib: { level: 6 } });
	const output = fs.createWriteStream(target + '.part', { mode: 0o600 });
	const completed = pipeline(zip, output);
	zip.on('warning', error => zip.destroy(error));
	zip.append(transcript, { name: 'transcript.html' });
	for (const entry of downloaded) zip.file(entry.path, { name: entry.name });
	zip.append(JSON.stringify({
		ticketId: archive.id,
		complete: assets.every(a => a.state === 'ready'),
		expiresAt: archive.expiresAt,
		unavailable: assets.filter(a => a.state !== 'ready').map(a => ({
			name: a.fileName,
			error: a.errorCode,
		})),
	}, null, 2), { name: 'archive-info.json' });
	await Promise.all([zip.finalize(), completed]);
	await fs.promises.rename(target + '.part', target);
	const size = (await fs.promises.stat(target)).size;
	for (const entry of downloaded) await fs.promises.unlink(entry.path).catch(() => {});
	return {
		size,
		complete: assets.every(a => a.state === 'ready'),
	};
}
function processArchive(client, id) {
	if (archiveJobs.has(id)) return archiveJobs.get(id);
	const job = processArchiveNow(client, id).finally(() => archiveJobs.delete(id));
	archiveJobs.set(id, job);
	return job;
}
async function processArchiveNow(client, id) {
	let archive = await client.prisma.driveArchive.findUnique({ where: { id } });
	if (!archive || archive.state === 'deleted') return;
	if (archive.nextAttemptAt && archive.nextAttemptAt > new Date() && !(archive.state !== 'deleting' && archive.expiresAt && archive.expiresAt <= new Date())) return;
	if (!archive.closedAt && archive.state !== 'deleting') return;
	const claim = await client.prisma.driveArchive.updateMany({
		where: {
			id,
			OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
		},
		data: { leaseUntil: new Date(Date.now() + 900000) },
	});
	if (!claim.count) return;
	try {
		if (archive.state === 'deleting' || archive.expiresAt && archive.expiresAt <= new Date()) return await purgeArchive(client, archive);
		const { transcriptInclude } = require('./transcripts');
		const ticket = await client.prisma.ticket.findUnique({
			where: { id },
			include: transcriptInclude,
		});
		if (!ticket) {
			await client.prisma.driveArchive.update({
				where: { id },
				data: {
					state: 'deleting',
					errorCode: 'TICKET_REMOVED',
				},
			});
			return await purgeArchive(client, archive);
		}
		if (ticket.closeCapturePending) return;
		const drive = getDrive(client);
		await drive.validateRoot();
		if (archive.state !== 'ready') {
			const assets = await client.prisma.driveAsset.findMany({ where: { archiveId: id } });
			if (assets.some(a => a.state === 'pending')) {
				await client.prisma.driveArchive.update({
					where: { id },
					data: { nextAttemptAt: new Date(Date.now() + 30000) },
				});
				return;
			}
			archive = await ensureFolder(client, archive, drive);
			if (!archive.zipLocalReady || !fs.existsSync(spool(id, 'archive.zip'))) {
				const result = await writeZip(client, archive, ticket, assets);
				archive = await client.prisma.driveArchive.update({
					where: { id },
					data: {
						zipLocalReady: true,
						zipSize: result.size,
						complete: result.complete,
					},
				});
			}
			if (!archive.zipFileId) {
				archive = await client.prisma.driveArchive.update({
					where: { id },
					data: { zipFileId: await drive.id() },
				});
			}
			await drive.upload({
				fileId: archive.zipFileId,
				parent: archive.folderId,
				localPath: spool(id, 'archive.zip'),
				name: 'ticket-' + archive.number + '.zip',
				mime: 'application/zip',
				ticketId: id,
				assetId: 'zip',
				session: archive.zipSession ? decrypt(archive.zipSession) : null,
			}, async (session, uploadedBytes) => {
				const fresh = await client.prisma.driveArchive.findUnique({ where: { id } });
				if (['deleting', 'deleted'].includes(fresh.state) || fresh.expiresAt <= new Date()) throw new DriveError('EXPIRED');
				return client.prisma.driveArchive.update({
					where: { id },
					data: {
						zipSession: session ? encrypt(session) : null,
						zipUploadedBytes: uploadedBytes,
						leaseUntil: new Date(Date.now() + 900000),
					},
				});
			});
			archive = await client.prisma.driveArchive.update({
				where: { id },
				data: {
					state: 'ready',
					zipSession: null,
					errorCode: null,
					nextAttemptAt: null,
				},
			});
		}
		if (ticket.transcriptMessageId && !archive.discordDelivered) {
			if (archive.zipSize <= uploadLimit(client.guilds.cache.get(ticket.guildId)) && !fs.existsSync(spool(id, 'archive.zip'))) await drive.download(archive.zipFileId, spool(id, 'archive.zip'));
			await deliverZip(client, archive, ticket);
		}
		await fs.promises.unlink(spool(id, 'archive.zip')).catch(() => {});
		await client.prisma.driveArchive.update({
			where: { id },
			data: { zipLocalReady: false },
		});
	} catch (error) {
		const attempts = archive.attempts + 1;
		await client.prisma.driveArchive.update({
			where: { id },
			data: {
				attempts,
				errorCode: codeOf(error),
				nextAttemptAt: new Date(Date.now() + Math.max(delay(attempts), error.retryAfter || 0)),
			},
		});
		client.log.warn('Drive archive %s: %s', id, codeOf(error));
	} finally {
		await client.prisma.driveArchive.update({
			where: { id },
			data: { leaseUntil: null },
		});
	}
}
function uploadLimit(guild, interaction) {
	return interaction?.attachmentSizeLimit || (guild?.premiumTier >= 3 ? 100 * 1024 * 1024 : guild?.premiumTier >= 2 ? 50 * 1024 * 1024 : 20 * 1024 * 1024);
}
async function deliverZip(client, archive, ticket) {
	const fresh = await client.prisma.driveArchive.findUnique({ where: { id: archive.id } });
	if (fresh.state !== 'ready' || fresh.expiresAt <= new Date()) throw new DriveError('EXPIRED');
	const { AttachmentBuilder } = require('discord.js');
	const { getSupportMessages } = require('./support-texts');
	const tr = await getSupportMessages(client, { ticketId: ticket.id });
	if (!archive.transcriptChannelId) return;
	const channel = await client.channels.fetch(archive.transcriptChannelId);
	if (!channel || channel.guildId !== ticket.guildId) throw new DriveError('PERMISSION');
	const message = await channel.messages.fetch(ticket.transcriptMessageId);
	if (!message || message.author.id !== client.user.id) throw new DriveError('PERMISSION');
	const name = 'ticket-' + ticket.number + '.zip';
	// An edit may have succeeded before the database update was persisted.
	if (![...message.attachments.values()].some(a => a.name === name)) {
		const tooLarge = archive.zipSize > uploadLimit(channel.guild);
		const retained = [...message.attachments.values()].map(a => ({ id: a.id }));
		const files = tooLarge ? [] : [new AttachmentBuilder(spool(archive.id, 'archive.zip'), { name })];
		if (!archive.complete) {
			const { renderTranscript } = require('./transcripts');
			const {
				fileName, transcript,
			} = await renderTranscript(client, ticket, { forceHtml: true });
			const previous = [...message.attachments.values()].find(a => a.name === fileName);
			if (previous) retained.splice(retained.findIndex(a => a.id === previous.id), 1);
			files.push(new AttachmentBuilder(Buffer.from(transcript), { name: fileName }));
		}
		const note = tr('ticket.transcript.drive.' + (tooLarge ? 'large' : archive.complete ? 'ready' : 'incomplete')) + (tooLarge && !archive.complete ? '\n' + tr('ticket.transcript.drive.incomplete') : '') + '\n' + tr('ticket.transcript.drive.expires', { timestamp: '<t:' + Math.floor(archive.expiresAt.getTime() / 1000) + ':F>' });
		await message.edit({
			content: note.slice(0, 2000),
			allowedMentions: { parse: [] },
			attachments: retained,
			...(files.length ? { files } : {}),
			components: [],
		});
	}
	await client.prisma.driveArchive.update({
		where: { id: archive.id },
		data: {
			discordDelivered: true,
			errorCode: null,
			nextAttemptAt: null,
		},
	});
}
async function purgeArchive(client, archive) {
	await client.prisma.driveArchive.update({
		where: { id: archive.id },
		data: { state: 'deleting' },
	});
	if (readers.get(archive.id)) return;
	await Promise.allSettled((await client.prisma.driveAsset.findMany({ where: { archiveId: archive.id } })).map(a => assetJobs.get(a.id)).filter(Boolean));
	// Expired local copies are removed even when Drive is unavailable.
	const target = spool(archive.id);
	if (!target.startsWith(path.resolve('./user/drive-spool') + path.sep)) throw new DriveError('DELETE_REFUSED');
	await fs.promises.rm(target, {
		recursive: true,
		force: true,
	});
	await client.prisma.driveAsset.updateMany({
		where: { archiveId: archive.id },
		data: {
			localReady: false,
			uploadSession: null,
		},
	});
	await client.prisma.driveArchive.update({
		where: { id: archive.id },
		data: {
			zipLocalReady: false,
			zipSession: null,
		},
	});
	const drive = getDrive(client);
	// The folder itself is owned by this archive; never delete the shared root.
	const assets = await client.prisma.driveAsset.findMany({ where: { archiveId: archive.id } });
	for (const asset of assets) {
		if (asset.driveFileId && asset.state !== 'deleted') {
			await drive.remove(asset.driveFileId, archive.id);
			await client.prisma.driveAsset.update({
				where: { id: asset.id },
				data: { state: 'deleted' },
			});
		}
	}
	if (archive.zipFileId) await drive.remove(archive.zipFileId, archive.id);
	if (archive.folderId) await drive.remove(archive.folderId, archive.id);
	await client.prisma.driveAsset.updateMany({
		where: { archiveId: archive.id },
		data: {
			state: 'deleted',
			localReady: false,
			uploadSession: null,
		},
	});
	await client.prisma.driveArchive.update({
		where: { id: archive.id },
		data: {
			state: 'deleted',
			zipLocalReady: false,
			zipSession: null,
			errorCode: null,
			nextAttemptAt: null,
		},
	});
}
async function acquireZip(client, ticketId, maximum) {
	const archive = await client.prisma.driveArchive?.findUnique({ where: { id: ticketId } });
	if (!archive || archive.state !== 'ready' || !archive.expiresAt || archive.expiresAt <= new Date()) return null;
	if (archive.zipSize > maximum) {
		return {
			tooLarge: true,
			complete: archive.complete,
		};
	}
	readers.set(ticketId, (readers.get(ticketId) || 0) + 1);
	let released = false;
	const release = async () => {
		if (released) return;
		released = true;
		const count = (readers.get(ticketId) || 1) - 1;
		if (count) {
			readers.set(ticketId, count);
		} else {
			readers.delete(ticketId);
			await fs.promises.unlink(spool(ticketId, 'download.zip')).catch(() => {});
		}
	};
	try {
		const current = await client.prisma.driveArchive.findUnique({ where: { id: ticketId } });
		if (current.state !== 'ready' || current.expiresAt <= new Date()) {
			await release();
			return null;
		}
		await prepare(ticketId);
		const target = spool(ticketId, 'download.zip');
		if (downloadJobs.has(ticketId) || !fs.existsSync(target)) {
			if (!downloadJobs.has(ticketId)) {
				downloadJobs.set(ticketId, (async () => {
					const drive = getDrive(client);
					await drive.validateRoot();
					await drive.download(archive.zipFileId, target);
				})().finally(() => downloadJobs.delete(ticketId)));
			}
			await downloadJobs.get(ticketId);
		}
		const after = await client.prisma.driveArchive.findUnique({ where: { id: ticketId } });
		if (after.state !== 'ready' || after.expiresAt <= new Date()) {
			await release();
			return null;
		}
		return {
			path: target,
			release,
			complete: archive.complete,
		};
	} catch (error) {
		await release();
		throw error;
	}
}
async function backfill(client, archive) {
	try {
		const ticket = await client.prisma.ticket.findUnique({
			where: { id: archive.id },
			include: { guild: true },
		});
		if (!ticket?.open || !ticket.guild.archive || !ticket.guild.driveArchiveEnabled) return;
		if (!archive.backfilledAt) {
			// Also recover files from already archived messages that were deleted in Discord.
			const users = await client.prisma.archivedUser.findMany({ where: { ticketId: ticket.id } });
			let cursor;
			while (true) {
				const saved = await client.prisma.archivedMessage.findMany({
					where: { ticketId: ticket.id },
					orderBy: { id: 'asc' },
					take: 100,
					...(cursor ? {
						cursor: { id: cursor },
						skip: 1,
					} : {}),
				});
				for (const message of saved) {
					const content = JSON.parse(decrypt(message.content));
					content.author ||= users.find(u => u.userId === message.authorId) || { userId: message.authorId };
					await captureContent(client, ticket, content, message.id);
				}
				if (saved.length < 100) break;
				cursor = saved.at(-1).id;
			}
		}
		const channel = await client.channels.fetch(ticket.id);
		let before;
		while (true) {
			const messages = await channel.messages.fetch({
				limit: 100,
				...(before ? { before } : {}),
			});
			if (!messages.size) break;
			for (const message of messages.values()) await client.tickets.archiver.saveMessage(ticket.id, message);
			before = messages.last().id;
			if (messages.size < 100) break;
		}
		await client.prisma.driveArchive.update({
			where: { id: archive.id },
			data: {
				backfilledAt: new Date(),
				errorCode: null,
				nextAttemptAt: null,
			},
		});
	} catch (error) {
		await client.prisma.driveArchive.update({
			where: { id: archive.id },
			data: {
				errorCode: 'SOURCE',
				nextAttemptAt: new Date(Date.now() + 900000),
			},
		});
	}
}
async function tick(client, startup = false) {
	if (!client.prisma.driveArchive || ticks.has(client)) return;
	ticks.add(client);
	try {
		if (startup) {
			// Unfinished leases can be retried after a single-process restart.
			await client.prisma.driveAsset.updateMany({
				where: { state: 'pending' },
				data: { leaseUntil: null },
			});
			await client.prisma.driveArchive.updateMany({
				where: { state: { not: 'deleted' } },
				data: { leaseUntil: null },
			});
			const tickets = await client.prisma.ticket.findMany({
				where: {
					open: true,
					guild: {
						driveArchiveEnabled: true,
						archive: true,
					},
				},
				include: { guild: true },
			});
			for (const ticket of tickets) {
				await ensureArchive(client, ticket);
				await client.prisma.driveArchive.updateMany({
					where: { id: ticket.id },
					data: { backfilledAt: null },
				});
			}
		}
		const now = new Date();
		// Bounded ledger sweep also finds archives whose guild/ticket was removed.
		const sweep = await client.prisma.driveArchive.findMany({
			where: {
				state: { not: 'deleted' },
				id: { gt: sweepCursors.get(client) || '' },
			},
			select: {
				id: true,
				state: true,
			},
			orderBy: { id: 'asc' },
			take: 50,
		});
		for (const item of sweep) {
			if (item.state !== 'deleting' && !await client.prisma.ticket.findUnique({
				where: { id: item.id },
				select: { id: true },
			})) {
				await client.prisma.driveArchive.update({
					where: { id: item.id },
					data: {
						state: 'deleting',
						nextAttemptAt: null,
					},
				});
			}
		}
		sweepCursors.set(client, sweep.length === 50 ? sweep.at(-1).id : '');
		const archives = await client.prisma.driveArchive.findMany({
			where: {
				state: { not: 'deleted' },
				AND: [
					{
						OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }, {
							state: { not: 'deleting' },
							expiresAt: { lte: now },
						}],
					},
					{
						OR: [{ state: 'deleting' }, { expiresAt: { lte: now } }, {
							state: 'ready',
							discordDelivered: false,
							transcriptChannelId: { not: null },
						}, {
							state: 'collecting',
							closedAt: { not: null },
						}, {
							state: 'collecting',
							OR: [{ backfilledAt: null }, { backfilledAt: { lte: new Date(Date.now() - 600000) } }],
						}],
					},
				],
			},
			orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
			take: 50,
		});
		for (const archive of archives) {
			const ticket = await client.prisma.ticket.findUnique({
				where: { id: archive.id },
				include: { guild: true },
			});
			if (!ticket) {
				await client.prisma.driveArchive.update({
					where: { id: archive.id },
					data: { state: 'deleting' },
				});
				await processArchive(client, archive.id);
			} else if (!ticket.open && !archive.closedAt) {
				await markClosed(client, ticket);
			} else if (ticket.open && archive.state === 'collecting') {
				await backfill(client, archive);
			}
			await processArchive(client, archive.id);
		}
		const assets = await client.prisma.driveAsset.findMany({
			where: {
				state: 'pending',
				OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
				archive: { state: { notIn: ['deleting', 'deleted'] } },
			},
			take: 30,
			orderBy: { createdAt: 'asc' },
		});
		for (let i = 0; i < assets.length; i += 2) await Promise.allSettled(assets.slice(i, i + 2).map(a => processAsset(client, a.id)));
		for (const archive of archives) if (archive.closedAt) await processArchive(client, archive.id);
	} finally {
		ticks.delete(client);
	}
}
async function driveStatus(client, guildId) {
	let connected = false, error = null;
	try {
		await getDrive(client).validateRoot();
		connected = true;
	} catch (e) {
		error = codeOf(e);
	}
	const where = { guildId };
	const [pending, recent, failures] = await Promise.all([
		client.prisma.driveAsset.count({
			where: {
				archive: where,
				state: 'pending',
			},
		}),
		client.prisma.driveArchive.findMany({
			where: {
				...where,
				state: { not: 'deleted' },
			},
			select: {
				id: true,
				number: true,
				state: true,
				errorCode: true,
				attempts: true,
				nextAttemptAt: true,
				expiresAt: true,
				complete: true,
			},
			orderBy: { createdAt: 'desc' },
			take: 10,
		}),
		client.prisma.driveAsset.findMany({
			where: {
				archive: where,
				errorCode: { not: null },
				state: { in: ['pending', 'missing'] },
			},
			select: {
				fileName: true,
				errorCode: true,
				state: true,
				attempts: true,
				nextAttemptAt: true,
				archive: { select: { number: true } },
			},
			orderBy: { createdAt: 'desc' },
			take: 10,
		}),
	]);
	return {
		connected,
		error,
		pending,
		retentionDays: 90,
		archives: recent,
		failures,
	};
}
module.exports = {
	RETENTION,
	acquireZip,
	backfill,
	captureContent,
	codeOf,
	contentAssets,
	driveStatus,
	ensureArchive,
	filename,
	markClosed,
	originalSourceUrl,
	processArchive,
	processAsset,
	sourceUrl,
	spool,
	stageTicketAssets,
	tick,
	uploadLimit,
};
