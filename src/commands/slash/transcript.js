const {
	renderTranscript, transcriptInclude,
} = require('../../lib/transcripts');
const { getSupportMessages } = require('../../lib/support-texts');
const { SlashCommand } = require('@eartharoid/dbf');
const {
	ApplicationCommandOptionType,
	PermissionsBitField,
	MessageFlags,
} = require('discord.js');
const { AttachmentBuilder } = require('discord.js');
const ExtendedEmbedBuilder = require('../../lib/embed');


module.exports = class TranscriptSlashCommand extends SlashCommand {
	constructor(client, options) {
		const name = 'transcript';
		super(client, {
			...options,
			description: client.i18n.getMessage(null, `commands.slash.${name}.description`),
			descriptionLocalizations: client.i18n.getAllMessages(`commands.slash.${name}.description`),
			dmPermission: false,
			name,
			nameLocalizations: client.i18n.getAllMessages(`commands.slash.${name}.name`),
			options: [
				{
					autocomplete: true,
					name: 'ticket',
					required: true,
					type: ApplicationCommandOptionType.String,
				},
				{
					name: 'member',
					required: false,
					type: ApplicationCommandOptionType.User,
				},
			].map(option => {
				option.descriptionLocalizations = client.i18n.getAllMessages(`commands.slash.${name}.options.${option.name}.description`);
				option.description = option.descriptionLocalizations['en-GB'];
				option.nameLocalizations = client.i18n.getAllMessages(`commands.slash.${name}.options.${option.name}.name`);
				return option;
			}),
		});

	}

	shouldAllowAccess(interaction, ticket) {
		// the creator can always get their ticket, even from outside the guild
		if (ticket.createdById === interaction.user.id) return true; // user not member (DMs)
		// everyone else must be in the guild
		if (interaction.guild?.id !== ticket.guildId) return false;
		// and have authority
		if (interaction.client.supers.includes(interaction.member.id)) return true;
		if (interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
		if (interaction.member.roles.cache.filter(role => ticket.category.staffRoles.includes(role.id)).size > 0) return true;
		return false;
	}

	async fillTemplate(ticket) {
		return renderTranscript(this.client, ticket);
	}

	/**
	 * @param {import("discord.js").ChatInputCommandInteraction} interaction
	 */
	async run(interaction, ticketId) {
		/** @type {import("client")} */
		const client = this.client;

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		ticketId = ticketId || interaction.options.getString('ticket', true);
		const ticket = await client.prisma.ticket.findUnique({
			include: transcriptInclude,
			where: interaction.guildId && ticketId.length < 16
				? {
					guildId_number: {
						guildId: interaction.guildId,
						number: parseInt(ticketId),
					},
				}
				: { id: ticketId },
		});

		if (!ticket) throw new Error(`Ticket ${ticketId} does not exist`);

		if (!this.shouldAllowAccess(interaction, ticket)) {
			const getMessage = await getSupportMessages(client, { ticketId: ticket.id });
			return await interaction.editReply({
				embeds: [
					new ExtendedEmbedBuilder({
						iconURL: interaction.guild?.iconURL(),
						text: ticket.guild.footer,
					})
						.setColor(ticket.guild.errorColour)
						.setTitle(getMessage('commands.slash.transcript.not_staff.title'))
						.setDescription(getMessage('commands.slash.transcript.not_staff.description')),
				],
			});
		}

		const {
			fileName,
			transcript,
		} = await this.fillTemplate(ticket);
		const attachment = new AttachmentBuilder()
			.setFile(Buffer.from(transcript))
			.setName(fileName);

		await interaction.editReply({ files: [attachment] });
		// TODO: add portal link
	}
};
