const FAQ = require('./faq-learning');

const failure = (statusCode, message) => {
	throw Object.assign(new Error(message), { statusCode });
};
async function context(req) {
	const client = req.routeOptions.config.client;
	const guild = await client.prisma.guild.findUnique({ where: { id: req.params.guild } });
	if (!guild) failure(404, 'Server nicht gefunden.');
	return {
		client,
		guild,
	};
}
module.exports.get = fastify => ({
	onRequest: [fastify.authenticate, fastify.isAdmin],
	handler: async req => {
		const {
			client, guild,
		} = await context(req);
		const status = req.query.status || 'draft', page = Number(req.query.page || 1), query = String(req.query.query || '').trim();
		if (!['draft', 'approved', 'rejected', 'all'].includes(status) || !Number.isInteger(page) || page < 1 || page > 10000 || query.length > 200) failure(400, 'Ungültiger FAQ-Filter.');
		const where = {
			guildId: guild.id,
			...(status !== 'all' ? { status } : {}),
			...(query ? { OR: [{ question: { contains: query } }, { answer: { contains: query } }] } : {}),
		};
		const [entries, total, categories, jobs] = await Promise.all([
			client.prisma.faqEntry.findMany({
				where,
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
				skip: (page - 1) * 25,
				take: 25,
			}),
			client.prisma.faqEntry.count({ where }),
			client.prisma.category.findMany({
				where: { guildId: guild.id },
				select: {
					id: true,
					name: true,
					aiKnowledge: true,
				},
			}),
			client.prisma.faqJob.findMany({
				where: { guildId: guild.id },
				orderBy: { createdAt: 'desc' },
				take: 20,
			}),
		]);
		return {
			entries,
			total,
			page,
			pageSize: 25,
			categories,
			jobs,
			serverKnowledge: guild.aiKnowledge,
		};
	},
});
module.exports.patch = fastify => ({
	onRequest: [fastify.authenticate, fastify.isAdmin],
	handler: async req => {
		const {
				client, guild,
			} = await context(req), data = req.body;
		FAQ.validateEntry(data);
		if (!['draft', 'approved', 'rejected'].includes(data.status) || typeof data.updatedAt !== 'string' || !Number.isFinite(+new Date(data.updatedAt))) failure(400, 'Ungültiger FAQ-Status.');
		const entry = await client.prisma.faqEntry.findFirst({
			where: {
				id: req.params.entry,
				guildId: guild.id,
			},
		});
		if (!entry) failure(404, 'FAQ-Eintrag nicht gefunden.');
		const categoryId = data.categoryId === null ? null : Number(data.categoryId);
		let category;
		if (categoryId !== null) {
			if (!Number.isInteger(categoryId)) failure(400, 'Ungültige Kategorie.');
			category = await client.prisma.category.findFirst({
				where: {
					id: categoryId,
					guildId: guild.id,
				},
			});
			if (!category) failure(400, 'Die Kategorie gehört nicht zu diesem Server oder wurde entfernt.');
		}
		const changed = await client.prisma.faqEntry.updateMany({
			where: {
				id: entry.id,
				guildId: guild.id,
				updatedAt: new Date(data.updatedAt),
			},
			data: {
				question: data.question.trim(),
				answer: data.answer.trim(),
				language: data.language,
				status: data.status,
				categoryId,
				categoryName: category?.name || 'Server',
				reviewedById: req.user.id,
			},
		});
		if (!changed.count) failure(409, 'Dieser Eintrag wurde inzwischen geändert. Bitte neu laden.');
		const categories = category ? [category] : await client.prisma.category.findMany({
			where: { guildId: guild.id },
			select: { id: true },
		});
		for (const item of categories) await client.tickets.getCategory(item.id, true);
		if (typeof client.log.info === 'function') client.log.info('FAQ entry %s saved (%s)', entry.id, data.status);
		return client.prisma.faqEntry.findUnique({ where: { id: entry.id } });
	},
});
