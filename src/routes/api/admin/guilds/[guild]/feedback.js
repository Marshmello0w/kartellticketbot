module.exports.get = fastify => ({
	handler: async req => {
		const client = req.routeOptions.config.client;
		const guildId = req.params.guild;
		const pageText = req.query.page ?? '1';
		if (!/^\d+$/.test(pageText) || Number(pageText) < 1 || Number(pageText) > 100000) {
			throw Object.assign(new Error('Ungültige Seitenzahl.'), { statusCode: 400 });
		}
		const page = Number(pageText);
		const pageSize = 25;
		const where = { guildId };
		const [total, feedback] = await Promise.all([
			client.prisma.feedback.count({ where }),
			client.prisma.feedback.findMany({
				orderBy: [{ createdAt: 'desc' }, { ticketId: 'desc' }],
				select: {
					comment: true,
					createdAt: true,
					rating: true,
					ticket: {
						select: {
							category: { select: { name: true } },
							number: true,
						},
					},
					ticketId: true,
					userId: true,
				},
				skip: (page - 1) * pageSize,
				take: pageSize,
				where,
			}),
		]);
		const guild = client.guilds.cache.get(guildId);
		const entries = await Promise.all(feedback.map(async item => {
			let comment = null;
			let commentUnavailable = false;
			if (item.comment) {
				try {
					const { pools } = require('../../../../../lib/threads');
					comment = await pools.crypto.queue(worker => worker.decrypt(item.comment));
				} catch (error) {
					commentUnavailable = true;
					client.log.error(error);
				}
			}
			const member = item.userId && guild?.members.cache.get(item.userId);
			return {
				category: item.ticket.category?.name || 'Ticket',
				comment,
				commentUnavailable,
				createdAt: item.createdAt,
				number: item.ticket.number,
				rating: item.rating,
				ticketId: item.ticketId,
				userId: item.userId,
				userName: member?.displayName || item.userId || 'Unbekannter Nutzer',
			};
		}));
		return {
			entries,
			guild: {
				id: guildId,
				name: guild?.name || guildId,
			},
			page,
			pageSize,
			total,
		};
	},
	onRequest: [fastify.authenticate, fastify.isAdmin],
});
