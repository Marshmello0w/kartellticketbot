const {
	ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder, UserSelectMenuBuilder,
} = require('discord.js');
const {
	context, performAction,
} = require('./ticket-actions');
const { isCategoryStaff } = require('./ticket-presentation');
const { getSupportMessages } = require('./support-texts');
function menuId(ticket, step, extra = {}) {
	return JSON.stringify({
		action: 'support',
		ticket,
		step,
		...extra,
	});
}
async function runSupportUI(client, id, interaction) {
	const ticketId = interaction.channelId;
	const getMessage = await getSupportMessages(client, { ticketId });
	try {
		if (id.ticket !== ticketId || !interaction.guildId) throw Object.assign(new Error('closed'), { supportKey: 'ticket.support.errors.closed' });
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const {
			ticket, guild,
		} = await context(client, interaction.guildId, ticketId, interaction.user.id);
		let step = id.step || 'actions';
		if (step === 'actions' && interaction.values?.length) step = interaction.values[0];
		if (['claim', 'release'].includes(step) || ['priority', 'handoff', 'move'].includes(id.step) && interaction.values?.length) {
			await performAction(client, {
				guildId: interaction.guildId,
				ticketId,
				actorId: interaction.user.id,
				action: step,
				value: interaction.values?.[0],
			});
			return interaction.editReply({
				content: getMessage('ticket.support.saved'),
				components: [],
			});
		}
		let components;
		if (step === 'actions') {
			const choices = [ticket.claimedById ? 'release' : 'claim', ...(ticket.claimedById ? ['handoff'] : []), 'priority', 'move'];
			components = [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(menuId(ticketId, 'actions')).setPlaceholder(getMessage('menus.support.placeholder')).addOptions(choices.map(value => ({
				label: getMessage(`menus.support.options.${value}`).slice(0, 100),
				value,
			}))))];
		} else if (step === 'priority') {
			components = [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(menuId(ticketId, step)).setPlaceholder(getMessage('menus.support.priority')).addOptions(['HIGH', 'MEDIUM', 'LOW'].map(value => ({
				value,
				label: getMessage(`commands.slash.priority.options.priority.choices.${value}`).slice(0, 100),
			}))))];
		} else if (step === 'handoff') {
			components = [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(menuId(ticketId, step)).setPlaceholder(getMessage('menus.support.handoff')).setMinValues(1).setMaxValues(1))];
		} else if (step === 'move') {
			const all = await client.prisma.category.findMany({
				where: { guildId: interaction.guildId },
				orderBy: { id: 'asc' },
			});
			const eligible = [];
			for (const category of all) if (category.id !== ticket.categoryId && await isCategoryStaff(client, guild, category, interaction.user.id)) eligible.push(category);
			if (!eligible.length) throw Object.assign(new Error('category'), { supportKey: 'ticket.support.errors.category' });
			const page = Math.max(0, Math.min(Math.floor(Number(id.page) || 0), Math.ceil(eligible.length / 25) - 1));
			components = [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(menuId(ticketId, step)).setPlaceholder(getMessage('menus.support.move')).addOptions(eligible.slice(page * 25, page * 25 + 25).map(category => ({
				label: category.name.slice(0, 100),
				value: String(category.id),
			}))))];
			if (eligible.length > 25) {
				const row = new ActionRowBuilder();
				for (const [delta, label] of [[-1, 'previous'], [1, 'next']]) row.addComponents(new ButtonBuilder().setCustomId(menuId(ticketId, 'move', { page: page + delta })).setStyle(ButtonStyle.Secondary).setLabel(getMessage(`buttons.support_${label}.text`)).setDisabled(page + delta < 0 || (page + delta) * 25 >= eligible.length));
				components.push(row);
			}
		} else {
			throw Object.assign(new Error('invalid'), { supportKey: 'ticket.support.errors.invalid' });
		}
		return interaction.editReply({
			content: getMessage('ticket.support.actions'),
			components,
		});
	} catch (error) {
		if (!error.supportKey) client.log.error(error);
		const payload = {
			content: getMessage(error.supportKey || 'ticket.support.errors.failed'),
			components: [],
			flags: MessageFlags.Ephemeral,
		};
		return interaction.deferred || interaction.replied ? interaction.editReply(payload) : interaction.reply(payload);
	}
}
module.exports = { runSupportUI };
