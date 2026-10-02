const { Listener } = require('@eartharoid/dbf');
const { runSupportUI } = require('../../lib/ticket-support-ui');
// DBF handles string selects only. Route our user selector through Discord directly.
module.exports = class extends Listener {
	constructor(client, options) {
		super(client, {
			...options,
			emitter: client,
			event: 'interactionCreate',
		});
	}
	async run(interaction) {
		if (!interaction.isUserSelectMenu()) return;
		let id;
		try {
			id = JSON.parse(interaction.customId);
		} catch {
			return;
		}
		if (id.action === 'support' && id.step === 'handoff') await runSupportUI(this.client, id, interaction);
	}
};
