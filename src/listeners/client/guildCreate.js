const { publishCommands } = require('../../lib/commands');
const { Listener } = require('@eartharoid/dbf');

module.exports = class extends Listener {
	constructor(client, options) {
		super(client, {
			...options,
			emitter: client,
			event: 'guildCreate',
		});
	}

	/**
	 * @param {import("discord.js").Guild} guild
	 */
	async run(guild) {
		/** @type {import("client")} */
		const client = this.client;

		this.client.log.success(`Added to guild "${guild.name}"`);
		let settings = await client.prisma.guild.findUnique({ where: { id: guild.id } });
		if (!settings) {
			settings = await client.prisma.guild.create({
				data: {
					id: guild.id,
					locale: client.i18n.locales.includes(guild.preferredLocale) ? guild.preferredLocale : 'en-GB',
				},
			});
		}
		if (process.env.PUBLISH_COMMANDS !== 'false' && (!process.env.GUILD_ID || process.env.GUILD_ID === guild.id)) {
			try {
				await publishCommands(client, guild.id);
			} catch (error) {
				client.log.error(error);
			}
		}
	}
};
