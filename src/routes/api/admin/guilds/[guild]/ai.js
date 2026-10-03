const {
	status, checkConnection,
} = require('../../../../../lib/gemini-support');
const { describeReason } = require('../../../../../lib/ai-diagnostics');
module.exports.get = fastify => ({
	handler: async req => {
		const db = req.routeOptions.config.client.prisma;
		const recent = await db.aiTask.findMany({
			where: {
				guildId: req.params.guild,
				id: { startsWith: 'human-' },
				errorCode: { not: null },
			},
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			take: 5,
			select: {
				ticketId: true,
				createdAt: true,
				errorCode: true,
			},
		});
		const tickets = recent.length ? await db.ticket.findMany({
			where: {
				guildId: req.params.guild,
				id: { in: recent.map(task => task.ticketId) },
			},
			select: {
				id: true,
				number: true,
			},
		}) : [];
		return {
			...await status(db),
			recentHandoffs: recent.map(task => ({
				ticketNumber: tickets.find(ticket => ticket.id === task.ticketId)?.number ?? null,
				occurredAt: task.createdAt,
				...describeReason(task.errorCode),
			})),
			pending: await db.aiTask.count({
				where: {
					guildId: req.params.guild,
					state: { in: ['queued', 'processing', 'ready', 'handoff'] },
				},
			}),
		};
	},
	onRequest: [fastify.authenticate, fastify.isAdmin],
});
module.exports.post = fastify => ({
	handler: async () => ({
		...await checkConnection(),
		checkedAt: new Date(),
	}),
	onRequest: [fastify.authenticate, fastify.isAdmin],
});
