const { EmbedBuilder } = require('discord.js');

module.exports = class ExtendedEmbedBuilder extends EmbedBuilder {
	constructor(footer, opts) {
		super(opts);
		if (footer && footer.text) this.setFooter(footer);
	}

	addFields(...fields) {
		return super.addFields(fields.flat().map(field => ({
			...field,
			name: field.name.slice(0, 256),
			value: field.value.slice(0, 1024),
		})));
	}

	setFields(...fields) {
		return super.setFields(fields.flat().map(field => ({
			...field,
			name: field.name.slice(0, 256),
			value: field.value.slice(0, 1024),
		})));
	}

	toJSON() {
		const result = super.toJSON();
		// Individually valid templates can exceed Discord's combined embed limit.
		let remaining = 6000 - (result.title?.length || 0) - (result.footer?.text?.length || 0) - (result.author?.name?.length || 0);
		result.fields = result.fields?.flatMap(field => {
			if (remaining < 2) return [];
			const name = field.name.slice(0, Math.min(256, remaining - 1));
			remaining -= name.length;
			const value = field.value.slice(0, Math.min(1024, remaining));
			remaining -= value.length;
			return [{
				...field,
				name,
				value,
			}];
		});
		if (result.description) result.description = result.description.slice(0, Math.max(0, remaining)) || undefined;
		return result;
	}
};
