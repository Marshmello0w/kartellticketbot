const I18n = require('@eartharoid/i18n');

const groups = {
	buttons: 'Buttons',
	ticket: 'Tickets und Schließung',
	dm: 'Direktnachrichten',
	modals: 'Formulare und Feedback',
	menus: 'Auswahlmenüs',
	misc: 'Hinweise und Fehler',
	commands: 'Command-Antworten',
};

function isEditable(key) {
	if (key.split('.').some(part => ['__proto__', 'prototype', 'constructor'].includes(part))) return false;
	if (key.startsWith('buttons.')) return key.endsWith('.text');
	if (key.startsWith('commands.')) {
		return !/^commands\.(slash|message|user)\.[^.]+\.(name|description|options)(\.|$)/.test(key);
	}
	return Object.hasOwn(groups, key.split('.')[0]);
}

function flatten(object, prefix = '', result = {}) {
	for (const [name, value] of Object.entries(object)) {
		const key = prefix ? `${prefix}.${name}` : name;
		if (typeof value === 'string' || Array.isArray(value)) result[key] = value;
		else if (value && typeof value === 'object') flatten(value, key, result);
	}
	return result;
}

function getLimit(key) {
	if (key.startsWith('commands.slash.faq-analyze.')) return 2000;
	if (key.startsWith('buttons.')) return 80;
	if (key.startsWith('ticket.ai.')) return key.endsWith('_title') || key.endsWith('.title') ? 256 : 2000;
	if (key.startsWith('modals.')) return key.endsWith('.placeholder') ? 100 : 45;
	if (key.startsWith('menus.support.options.')) return 100;
	if (key.startsWith('menus.')) return 150;
	if (key === 'ticket.support.deadline.value') return 1024;
	if (key.startsWith('ticket.support.overview.') || key.startsWith('ticket.support.status.')) return 256;
	if (key.startsWith('ticket.support.')) return key.endsWith('.name') ? 256 : 2000;
	if (key === 'ticket.opening_message.content') return 2000;
	if (key === 'ticket.answers.no_value') return 1024;
	if (key.startsWith('commands.slash.help.response.links.') && !key.endsWith('.links')) return 150;
	if (['commands.slash.help.response.commands', 'commands.slash.help.response.settings', 'commands.slash.help.response.links.links'].includes(key)) return 256;
	if (key === 'ticket.transcript.creator') return 256;
	if (key === 'ticket.transcript.automatic') return 1024;
	if (key.endsWith('.title') || key.endsWith('.name') || key.includes('.fields.') && !key.endsWith('.value')) return 256;
	if (key.includes('.fields.')) return 1024;
	return 4096;
}

function getPlaceholders(value) {
	const texts = Array.isArray(value) ? value : [value];
	return [...new Set(texts.flatMap(text => text.match(/(?<!\\)\{\{?\s*[\w.:-]+\s*\}\}?|(?<!\\)%[ds]/g) || []))];
}

function getCatalog(i18n, locale) {
	const defaults = {
		...flatten(i18n.messages[i18n.default_locale]),
		...flatten(i18n.messages[locale] || {}),
	};
	return Object.entries(defaults).filter(([key]) => isEditable(key)).map(([key, value]) => ({
		key,
		group: groups[key.split('.')[0]],
		defaultValue: value,
		maxLength: getLimit(key),
		placeholders: getPlaceholders(value),
	}));
}

function validateOverrides(i18n, locale, input) {
	if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Texte müssen ein Objekt sein.');
	const catalog = new Map(getCatalog(i18n, locale).map(field => [field.key, field]));
	const result = {};
	for (const [key, value] of Object.entries(input)) {
		const field = catalog.get(key);
		if (!field) throw new Error(`Unbekanntes Textfeld: ${key}`);
		if (value === null) continue;
		const values = Array.isArray(value) ? value : [value];
		if (Array.isArray(field.defaultValue) !== Array.isArray(value) || Array.isArray(value) && value.length !== field.defaultValue.length) {
			throw new Error(`Ungültige Textvarianten: ${key}`);
		}
		for (const text of values) {
			if (typeof text !== 'string' || !text.trim() || text.length > field.maxLength) throw new Error(`${key}: Text erforderlich, maximal ${field.maxLength} Zeichen.`);
			const allowed = field.placeholders.map(token => token.replace(/[{}\s]/g, ''));
			if (getPlaceholders(text).some(token => !allowed.includes(token.replace(/[{}\s]/g, '')))) throw new Error(`${key}: Unbekannter Platzhalter.`);
		}
		result[key] = value;
	}
	return result;
}

function createTranslator(i18n, guild, category) {
	const locale = guild?.locale || i18n.default_locale;
	const merged = JSON.parse(JSON.stringify(i18n.messages[locale] || i18n.messages[i18n.default_locale]));
	const allowed = new Set(getCatalog(i18n, locale).map(field => field.key));
	for (const [key, value] of Object.entries({
		...guild?.textOverrides,
		...category?.textOverrides,
	})) {
		if (!allowed.has(key)) continue;
		const parts = key.split('.');
		let node = merged;
		for (const part of parts.slice(0, -1)) node = node[part] ||= {};
		node[parts.at(-1)] = value;
	}
	const translate = new I18n(i18n.default_locale, {
		...i18n.messages,
		[locale]: merged,
	}).getLocale(locale);
	const customKeys = new Set(Object.keys({
		...guild?.textOverrides,
		...category?.textOverrides,
	}));
	return (key, ...args) => {
		const text = translate(key, ...args);
		return customKeys.has(key) && typeof text === 'string' ? text.slice(0, getLimit(key)) : text;
	};
}

async function getSupportMessages(client, {
	guildId, categoryId, ticketId,
} = {}) {
	if (ticketId) {
		const ticket = await client.prisma.ticket.findUnique({
			where: { id: ticketId },
			include: {
				guild: true,
				category: true,
			},
		});
		if (ticket) return createTranslator(client.i18n, ticket.guild, ticket.category);
	}
	const guild = guildId ? await client.prisma.guild.findUnique({ where: { id: guildId } }) : null;
	const category = categoryId ? await client.prisma.category.findUnique({ where: { id: Number(categoryId) } }) : null;
	return createTranslator(client.i18n, guild, category?.guildId === guildId ? category : null);
}

module.exports = {
	createTranslator,
	getCatalog,
	getSupportMessages,
	validateOverrides,
};
