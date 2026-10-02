const {
	getCatalog, validateOverrides,
} = require('./support-texts');
const { logAdminEvent } = require('./logging');

module.exports = function textSettingsRoutes(fastify, categoryScope = false) {
	async function context(req) {
		const client = req.routeOptions.config.client;
		const guild = await client.prisma.guild.findUnique({ where: { id: req.params.guild } });
		const category = categoryScope ? await client.prisma.category.findUnique({ where: { id: Number(req.params.category) } }) : null;
		if (!guild || categoryScope && (!category || category.guildId !== guild.id)) {
			throw Object.assign(new Error('Not Found'), { statusCode: 404 });
		}
		return {
			client,
			guild,
			category,
		};
	}
	async function describe(req) {
		const {
			client, guild, category,
		} = await context(req);
		const catalog = getCatalog(client.i18n, guild.locale);
		const overrides = (category || guild).textOverrides || {};
		const inherited = category ? guild.textOverrides || {} : {};
		return {
			catalog,
			overrides,
			inherited,
			categoryName: category?.name || null,
		};
	}
	return {
		get: () => ({
			onRequest: [fastify.authenticate, fastify.isAdmin],
			handler: describe,
		}),
		patch: () => ({
			onRequest: [fastify.authenticate, fastify.isAdmin],
			handler: async req => {
				const {
					client, guild, category,
				} = await context(req);
				let overrides;
				try {
					overrides = validateOverrides(client.i18n, guild.locale, req.body?.overrides);
				} catch (error) {
					error.statusCode = 400;
					throw error;
				}
				const target = category || guild;
				await client.prisma[category ? 'category' : 'guild'].update({
					where: { id: target.id },
					data: { textOverrides: overrides },
				});
				const categories = category ? [category] : await client.prisma.category.findMany({
					where: { guildId: guild.id },
					select: { id: true },
				});
				for (const item of categories) await client.tickets.getCategory(item.id, true);
				await logAdminEvent(client, {
					action: 'update',
					guildId: guild.id,
					userId: req.user.id,
					target: {
						id: target.id,
						name: category?.name || 'Supporttexte',
						type: category ? 'category' : 'settings',
					},
					diff: {
						original: { textOverrides: target.textOverrides },
						updated: { textOverrides: overrides },
					},
				});
				return describe(req);
			},
		}),
	};
};
