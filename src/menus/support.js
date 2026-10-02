const { Menu } = require('@eartharoid/dbf');
const { runSupportUI } = require('../lib/ticket-support-ui');
module.exports = class SupportMenu extends Menu {
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
