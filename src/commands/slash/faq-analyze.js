const { SlashCommand } = require('@eartharoid/dbf');
const {
	ApplicationCommandOptionType, MessageFlags,
} = require('discord.js');
const { getSupportMessages } = require('../../lib/support-texts');
const FAQ = require('../../lib/faq-learning');

module.exports = class FaqAnalyzeCommand extends SlashCommand {
	constructor(client, options) {
		const key = 'commands.slash.faq-analyze';
		super(client, {
			...options,
			name: 'faq-analyze',
			dmPermission: false,
			description: client.i18n.getMessage(null, key + '.description'),
			descriptionLocalizations: client.i18n.getAllMessages(key + '.description'),
			options: [{
				name: 'ticket',
				type: ApplicationCommandOptionType.String,
				required: false,
				autocomplete: true,
				description: client.i18n.getMessage(null, key + '.options.ticket.description'),
				descriptionLocalizations: client.i18n.getAllMessages(key + '.options.ticket.description'),
			}],
		});
	}
	async run(interaction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const client = this.client, value = interaction.options.getString('ticket');
		const getMessage = await getSupportMessages(client, {
			ticketId: interaction.channelId,
			guildId: interaction.guildId,
		});
		try {
			if (!interaction.guildId || value && !/^\d{1,20}$/.test(value)) throw Object.assign(new Error('TICKET'), { faqCode: 'TICKET' });
			const ticket = await client.prisma.ticket.findUnique({
				where: value && value.length < 17 ? {
					guildId_number: {
						guildId: interaction.guildId,
						number: Number(value),
					},
				} : { id: value || interaction.channelId },
				include: {
					guild: true,
					category: true,
				},
			});
			if (!ticket || ticket.guildId !== interaction.guildId) throw Object.assign(new Error('TICKET'), { faqCode: 'TICKET' });
			const messages = await getSupportMessages(client, { ticketId: ticket.id });
			const job = await FAQ.start(client, ticket, interaction.user.id, interaction.id);
			await interaction.editReply({
				content: messages('commands.slash.faq-analyze.started'),
				allowedMentions: { parse: [] },
			});
			await FAQ.processJob(client, job);
			const current = await client.prisma.faqJob.findUnique({ where: { id: job.id } });
			const key = current.state === 'done' ? 'done' : current.state === 'failed' ? 'failed' : 'started';
			return await interaction.editReply({
				content: (messages('commands.slash.faq-analyze.' + key, {
					count: current.proposals,
					messages: current.messageCount,
				}) + (current.truncated ? '\n' + messages('commands.slash.faq-analyze.truncated') : '')).slice(0, 2000),
				allowedMentions: { parse: [] },
			});
		} catch (error) {
			client.log.warn('FAQ command failed (%s)', error.faqCode || 'ERROR');
			return interaction.editReply({
				content: getMessage('commands.slash.faq-analyze.' + (error.faqCode === 'FORBIDDEN' ? 'denied' : error.faqCode === 'TICKET' ? 'ticket_missing' : 'failed')),
				allowedMentions: { parse: [] },
			});
		}
	}
};
