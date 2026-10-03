const { status } = require('../../../../../lib/gemini-support');
module.exports.get = fastify => ({
	handler: async req => ({
		...await status(req.routeOptions.config.client.prisma),
		pending: await req.routeOptions.config.client.prisma.aiTask.count({
			where: {
				guildId: req.params.guild,
				state: { in: ['queued', 'processing', 'ready', 'handoff'] },
			},
		}),
	}),
	onRequest: [fastify.authenticate, fastify.isAdmin],
});
