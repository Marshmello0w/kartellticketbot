const fs = require('node:fs/promises');
const path = require('node:path');
const {
	createHash, randomUUID,
} = require('node:crypto');

const commandKey = command => (command.type || 1) + ':' + command.name;
const localizations = value => Object.fromEntries(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)));
function optionDefinition(option) {
	return {
		autocomplete: Boolean(option.autocomplete),
		channelTypes: [...(option.channelTypes || option.channel_types || [])].sort((a, b) => a - b),
		choices: (option.choices || []).map(choice => ({
			name: choice.name,
			nameLocalizations: localizations(choice.nameLocalizations || choice.name_localizations),
			value: choice.value,
		})),
		description: option.description || '',
		descriptionLocalizations: localizations(option.descriptionLocalizations || option.description_localizations),
		maxLength: option.maxLength ?? option.max_length ?? null,
		maxValue: option.maxValue ?? option.max_value ?? null,
		minLength: option.minLength ?? option.min_length ?? null,
		minValue: option.minValue ?? option.min_value ?? null,
		name: option.name,
		nameLocalizations: localizations(option.nameLocalizations || option.name_localizations),
		options: (option.options || []).map(optionDefinition),
		required: Boolean(option.required),
		type: option.type,
	};
}
function fingerprint(command) {
	const permissions = command.defaultMemberPermissions?.bitfield ?? command.defaultMemberPermissions ?? command.default_member_permissions ?? null;
	// Guild commands cannot use DM, installation or interaction context settings.
	const definition = {
		defaultMemberPermissions: permissions === null ? null : String(permissions),
		description: command.description || '',
		descriptionLocalizations: localizations(command.descriptionLocalizations || command.description_localizations),
		name: command.name,
		nameLocalizations: localizations(command.nameLocalizations || command.name_localizations),
		nsfw: Boolean(command.nsfw),
		options: (command.options || []).map(optionDefinition),
		type: command.type || 1,
	};
	return createHash('sha256').update(JSON.stringify(definition)).digest('hex');
}
async function readRegistry(applicationId, file) {
	try {
		const registry = JSON.parse(await fs.readFile(file, 'utf8'));
		if (registry.version !== 1 || registry.applicationId !== applicationId || !registry.guilds || typeof registry.guilds !== 'object' || Array.isArray(registry.guilds)) {
			throw new Error('Invalid command registry; refusing to overwrite existing registrations.');
		}
		return registry;
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
		return {
			applicationId,
			guilds: {},
			version: 1,
		};
	}
}
async function writeRegistry(registry, file) {
	await fs.mkdir(path.dirname(file), {
		recursive: true,
		mode: 0o700,
	});
	const temporary = file + '.' + randomUUID() + '.tmp';
	try {
		await fs.writeFile(temporary, JSON.stringify(registry, null, 2), {
			flag: 'wx',
			mode: 0o600,
		});
		await fs.rename(temporary, file);
	} finally {
		await fs.unlink(temporary).catch(() => {});
	}
}
module.exports = {
	commandKey,
	fingerprint,
	readRegistry,
	writeRegistry,
};
