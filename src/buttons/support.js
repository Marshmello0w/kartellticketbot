const { Button } = require('@eartharoid/dbf');
const { runSupportUI } = require('../lib/ticket-support-ui');
module.exports = class SupportButton extends Button {
	constructor(client, options) {
		super(client, {
			...options,
			id: 'support',
		});
	}
	async run(id, interaction) {
		return runSupportUI(this.client, id, interaction);
	}
};
