const Gemini = require('./gemini-support');
const Input = require('./ai-input');

const crypt = (method, text) => require('./threads').pools.crypto.queue(worker => worker[method](text));
function configured(category) {
	return ['de', 'en'].includes(category?.aiResponseLanguage) ? category.aiResponseLanguage : null;
}
async function capture(client, ticket, message) {
	if (ticket.aiLanguage || !message || message.author.id !== ticket.createdById || message.author.bot || message.webhookId || message.system || !message.content?.trim()) return;
	if (ticket.topic) {
		await client.prisma.ticket.updateMany({
			where: {
				id: ticket.id,
				aiLanguageSeed: null,
			},
			data: {
				aiLanguageSeed: ticket.topic,
				aiLanguageSourceId: null,
			},
		});
		return;
	}
	const seed = await crypt('encrypt', message.content.slice(0, 3000));
	await client.prisma.ticket.updateMany({
		where: {
			id: ticket.id,
			aiLanguage: null,
			OR: [{
				aiLanguageSourceId: null,
				aiLanguageSeed: null,
			}, { aiLanguageSourceId: { gt: message.id } }],
		},
		data: {
			aiLanguageSeed: seed,
			aiLanguageSourceId: message.id,
		},
	});
}
async function context(client, ticket, channel) {
	const responseLanguage = ticket.aiLanguage || configured(ticket.category);
	if (responseLanguage) await pin(client, ticket.id, responseLanguage);
	if (ticket.aiLanguageSeed) {
		return {
			responseLanguage,
			creatorFirstText: await crypt('decrypt', ticket.aiLanguageSeed),
		};
	}
	// The opening topic was written by the creator before any channel messages.
	if (ticket.topic) {
		await client.prisma.ticket.updateMany({
			where: {
				id: ticket.id,
				aiLanguageSeed: null,
			},
			data: { aiLanguageSeed: ticket.topic },
		});
		return {
			responseLanguage,
			creatorFirstText: await crypt('decrypt', ticket.topic),
		};
	}
	if (!responseLanguage && channel) {
		let before, first;
		while (true) {
			const page = await channel.messages.fetch({
				limit: 100,
				cache: false,
				...(before ? { before } : {}),
			});
			for (const message of page.values()) {
				if (message.author.id === ticket.createdById && !message.author.bot && !message.webhookId && !message.system && message.content?.trim() && (!first || BigInt(message.id) < BigInt(first.id))) first = message;
			}
			if (page.size < 100) break;
			const next = page.last().id;
			if (next === before) throw new Error('HISTORY');
			before = next;
		}
		if (first) {
			await capture(client, ticket, first);
			return {
				responseLanguage,
				creatorFirstText: first.content.slice(0, 3000),
			};
		}
	}
	return {
		responseLanguage,
		creatorFirstText: '',
	};
}
async function pin(client, ticketId, language) {
	if (!Gemini.validLanguage(language)) return;
	await client.prisma.ticket.updateMany({
		where: {
			id: ticketId,
			aiLanguage: null,
		},
		data: { aiLanguage: language },
	});
}
async function supportLanguage(client, ticket, channel) {
	const seed = await context(client, ticket, channel);
	if (seed.responseLanguage) return seed.responseLanguage;
	if (!seed.creatorFirstText.trim()) return null;
	const language = Input.language(seed.creatorFirstText, ticket.guild?.locale?.split('-')[0]);
	await pin(client, ticket.id, language);
	return language;
}
module.exports = {
	configured,
	capture,
	context,
	pin,
	supportLanguage,
};
