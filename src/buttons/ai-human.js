const { Button } = require('@eartharoid/dbf');
const { humanButton } = require('../lib/ai-support');
module.exports = class extends Button {
	constructor(client, options) {
		super(client, {
			...options,
			id: 'ai-human',
		});
	}
	async run(id, interaction) {
		return humanButton(this.client, id, interaction);
	}
};
