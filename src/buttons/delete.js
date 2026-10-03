const { Button } = require('@eartharoid/dbf');
const { runDelete } = require('../lib/ticket-delete');
module.exports = class DeleteButton extends Button {
	constructor(client, options) {
		super(client, {
			...options,
			id: 'delete',
		});
	}
	async run(id, interaction) {
		return runDelete(this.client, interaction, id.ticket || interaction.channelId);
	}
};
