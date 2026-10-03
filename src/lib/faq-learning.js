const { createHash } = require('node:crypto');
const {
	isCategoryStaff, participantSide,
} = require('./ticket-presentation');
const Gemini = require('./gemini-support');
const Language = require('./ai-language');

const MAX_MESSAGES = 500;
const MAX_BYTES = 56000;
const running = new WeakSet();
const include = {
	guild: true,
	category: true,
};
const fail = code => {
	throw Object.assign(new Error(code), { faqCode: code });
};
const decrypt = value => require('./threads').pools.crypto.queue(worker => worker.decrypt(value));

function safeText(value) {
	return String(value || '')
		.replace(/<@!?\d+>|<@&\d+>|<#\d+>/g, '[Discord-Verweis]')
		.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[E-Mail-Adresse]')
		.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP-Adresse]')
		.replace(/\b(?:AIza[\w-]{20,}|AQ\.[\w-]{20,})|\b[\w-]{24,}\.[\w-]{6,}\.[\w-]{25,}\b/g, '[Zugangsdaten]')
		.replace(/\b(?:password|passwort|secret|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token)\s*[:=]\s*\S+/gi, '[Zugangsdaten entfernt]')
		.replace(/([?&](?:token|key|secret|auth|signature|password)=)[^&\s]+/gi, '$1[entfernt]')
		.replace(/\b\d{17,20}\b/g, '[Discord-ID]');
}
async function canAnalyze(client, ticket, userId) {
	const guild = client.guilds.cache.get(ticket.guildId);
	return Boolean(guild && ticket.category && await isCategoryStaff(client, guild, ticket.category, userId));
}
async function start(client, ticket, userId, requestId) {
	if (!await canAnalyze(client, ticket, userId)) fail('FORBIDDEN');
	const id = 'faq-' + requestId;
	try {
		return await client.prisma.faqJob.upsert({
			where: { id },
			update: {},
			create: {
				id,
				guildId: ticket.guildId,
				ticketId: ticket.id,
				ticketNumber: ticket.number,
				categoryId: ticket.categoryId,
				categoryName: ticket.category.name,
				requestedById: userId,
				ticketKey: ticket.id,
			},
		});
	} catch (error) {
		if (error.code !== 'P2002') throw error;
		return client.prisma.faqJob.findUnique({ where: { ticketKey: ticket.id } });
	}
}
async function collect(client, ticket) {
	const messages = new Map();
	let channel, incomplete = false;
	try {
		channel = await client.channels.fetch(ticket.id);
		if (!channel || channel.guildId !== ticket.guildId) throw new Error('CHANNEL');
		let before;
		while (messages.size <= MAX_MESSAGES) {
			const page = await channel.messages.fetch({
				limit: 100,
				cache: false,
				...(before ? { before } : {}),
			});
			for (const message of page.values()) {
				if (!ticket.open && ticket.closedAt && +message.createdAt > +ticket.closedAt) continue;
				messages.set(message.id, {
					id: message.id,
					text: message.content || '',
					at: message.createdAt,
					authorId: message.author.id,
					bot: message.author.bot || message.webhookId || message.system,
				});
			}
			if (page.size < 100) break;
			if (messages.size > MAX_MESSAGES) {
				incomplete = true;
				break;
			}
			const next = page.last().id;
			if (next === before) throw new Error('HISTORY');
			before = next;
		}
	} catch {
		incomplete = messages.size > 0;
		channel = null;
	}
	// Archived messages are a fallback for closed/deleted ticket channels.
	if (!channel) {
		const archived = await client.prisma.archivedMessage.findMany({
			where: {
				ticketId: ticket.id,
				external: false,
				deleted: false,
			},
			include: { author: true },
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			take: MAX_MESSAGES + 1,
		});
		for (const message of archived) {
			if (messages.has(message.id)) continue;
			const value = JSON.parse(await decrypt(message.content));
			messages.set(message.id, {
				id: message.id,
				text: value.content || '',
				at: message.createdAt,
				authorId: message.authorId,
				bot: message.author.bot || value.author?.bot,
				roleId: message.author.roleId,
			});
		}
	}
	if (!messages.size) fail('NO_MESSAGES');
	const selected = [...messages.values()].sort((a, b) => +b.at - +a.at || (BigInt(a.id) > BigInt(b.id) ? -1 : 1));
	const result = [], staff = new Set();
	let bytes = 0;
	for (const message of selected) {
		if (message.bot || !message.text.trim()) continue;
		const redacted = safeText(message.text);
		if (redacted.length > 4000) incomplete = true;
		const text = redacted.slice(0, 4000);
		const side = await participantSide(client, ticket, message.authorId);
		const confirmed = side === 'STAFF' || message.authorId !== ticket.createdById && message.roleId && ticket.category.staffRoles.includes(message.roleId);
		const entry = {
			id: message.id,
			side: confirmed ? 'STAFF' : 'USER',
			text,
		};
		const size = Buffer.byteLength(JSON.stringify(entry), 'utf8');
		if (result.length >= MAX_MESSAGES || bytes + size > MAX_BYTES) {
			incomplete = true;
			break;
		}
		result.push(entry);
		bytes += size;
		if (confirmed) staff.add(message.id);
	}
	if (selected.length > MAX_MESSAGES) incomplete = true;
	const lang = await Language.context(client, ticket, channel);
	if (!lang.creatorFirstText && !lang.responseLanguage) {
		const firstCreator = selected.filter(item => item.authorId === ticket.createdById && !item.bot && item.text.trim()).at(-1);
		lang.creatorFirstText = firstCreator?.text.slice(0, 3000) || ticket.category.openingMessage.slice(0, 3000);
	}
	return {
		messages: result.reverse(),
		staff,
		truncated: incomplete,
		...lang,
		creatorFirstText: safeText(lang.creatorFirstText),
	};
}
function entryId(guildId, categoryId, entry) {
	const question = entry.question.trim().toLowerCase().normalize('NFKC').replace(/\s+/g, ' ');
	return createHash('sha256').update(JSON.stringify([guildId, categoryId, entry.language, question])).digest('hex');
}
async function finish(client, job, data) {
	return client.prisma.faqJob.updateMany({
		where: { id: job.id },
		data: {
			...data,
			finishedAt: new Date(),
			leaseUntil: null,
			ticketKey: null,
		},
	});
}
async function processJob(client, job, generator = Gemini.analyzeFaq) {
	const lease = new Date(Date.now() + 5 * 60000);
	const claim = await client.prisma.faqJob.updateMany({
		where: {
			id: job.id,
			state: 'queued',
		},
		data: {
			state: 'collecting',
			leaseUntil: lease,
		},
	});
	if (!claim.count) return;
	try {
		const ticket = await client.prisma.ticket.findUnique({
			where: { id: job.ticketId },
			include,
		});
		if (!ticket || ticket.guildId !== job.guildId || ticket.categoryId !== job.categoryId) fail('CHANGED');
		if (!await canAnalyze(client, ticket, job.requestedById)) fail('FORBIDDEN');
		const context = await collect(client, ticket);
		await client.prisma.faqJob.update({
			where: { id: job.id },
			data: {
				messageCount: context.messages.length,
				truncated: context.truncated,
			},
		});
		if (!context.staff.size) {
			return await finish(client, job, {
				state: 'done',
				proposals: 0,
			});
		}
		const claimed = await client.prisma.faqJob.updateMany({
			where: {
				id: job.id,
				state: 'collecting',
				leaseUntil: lease,
			},
			data: { state: 'processing' },
		});
		if (!claimed.count) return;
		const {
			staff, truncated, ...input
		} = context;
		const result = await generator(client.prisma, job.id, input);
		if (result.action !== 'answer') fail(result.reason || 'MODEL');
		if (!Array.isArray(result.entries) || result.entries.length > 5) fail('MODEL');
		const entries = [];
		for (const entry of result.entries) {
			validateEntry(entry);
			if (!Array.isArray(entry.evidence) || !entry.evidence.length || entry.evidence.some(id => !staff.has(id)) || context.responseLanguage && entry.language !== context.responseLanguage) fail('EVIDENCE');
			entries.push({
				...entry,
				question: safeText(entry.question).trim(),
				answer: safeText(entry.answer).trim(),
			});
		}
		const latest = await client.prisma.ticket.findUnique({
			where: { id: ticket.id },
			include,
		});
		if (!latest || latest.categoryId !== job.categoryId || !await canAnalyze(client, latest, job.requestedById)) fail('CHANGED');
		await client.prisma.$transaction(async tx => {
			const held = await tx.faqJob.updateMany({
				where: {
					id: job.id,
					state: 'processing',
					leaseUntil: lease,
				},
				data: {
					state: 'done',
					finishedAt: new Date(),
					leaseUntil: null,
					ticketKey: null,
				},
			});
			if (!held.count) return;
			let proposals = 0;
			for (const entry of entries) {
				const id = entryId(job.guildId, job.categoryId, entry);
				if (await tx.faqEntry.findUnique({ where: { id } })) continue;
				await tx.faqEntry.create({
					data: {
						id,
						guildId: job.guildId,
						categoryId: job.categoryId,
						categoryName: job.categoryName,
						sourceTicketId: job.ticketId,
						sourceTicketNumber: job.ticketNumber,
						jobId: job.id,
						question: entry.question,
						answer: entry.answer,
						language: entry.language,
						evidence: JSON.stringify(entry.evidence),
					},
				});
				proposals++;
			}
			await tx.faqJob.update({
				where: { id: job.id },
				data: { proposals },
			});
		});
	} catch (error) {
		await finish(client, job, {
			state: 'failed',
			errorCode: error.faqCode || 'ERROR',
		});
		client.log.warn('FAQ analysis %s failed (%s)', job.id, error.faqCode || 'ERROR');
	}
}
async function tick(client) {
	if (!client.prisma.faqJob || running.has(client)) return;
	running.add(client);
	try {
		await client.prisma.faqJob.updateMany({
			where: {
				state: 'collecting',
				leaseUntil: { lt: new Date() },
			},
			data: {
				state: 'queued',
				leaseUntil: null,
			},
		});
		// Uncertain generations cannot be repeated after a crash: keep cost reservations.
		await client.prisma.faqJob.updateMany({
			where: {
				state: 'processing',
				leaseUntil: { lt: new Date() },
			},
			data: {
				state: 'failed',
				errorCode: 'RESTART',
				finishedAt: new Date(),
				leaseUntil: null,
				ticketKey: null,
			},
		});
		const jobs = await client.prisma.faqJob.findMany({
			where: { state: 'queued' },
			orderBy: { createdAt: 'asc' },
			take: 3,
		});
		for (const job of jobs) await processJob(client, job);
	} finally {
		running.delete(client);
	}
}
function validateEntry(input) {
	if (!input || typeof input.question !== 'string' || !input.question.trim() || input.question.length > 240 || typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 1800 || !Gemini.validLanguage(input.language)) throw Object.assign(new Error('Frage (max. 240), Antwort (max. 1.800) und gültige Sprache sind erforderlich.'), { statusCode: 400 });
}
async function getKnowledge(db, ticket) {
	if (!db.faqEntry) return '';
	const entries = await db.faqEntry.findMany({
		where: {
			guildId: ticket.guildId,
			status: 'approved',
			OR: [{ categoryId: null }, { categoryId: ticket.categoryId }],
		},
		orderBy: { updatedAt: 'desc' },
		take: 50,
	});
	let text = '';
	for (const entry of entries) {
		const item = '\nFAQ (' + entry.language + '): ' + entry.question + '\n' + entry.answer + '\n';
		if (Buffer.byteLength(text + item, 'utf8') > 16000) break;
		text += item;
	}
	return text;
}
module.exports = {
	MAX_MESSAGES,
	safeText,
	canAnalyze,
	start,
	collect,
	processJob,
	tick,
	validateEntry,
	getKnowledge,
};
