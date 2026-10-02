const { join } = require('node:path');
const { Collection } = require('discord.js');
const {
	commandKey, fingerprint, readRegistry, writeRegistry,
} = require('./command-registry');
const snowflake = /^\d{17,20}$/;
const publications = new WeakMap();

function getGuildIds(client, guildId) {
	const target = guildId || process.env.GUILD_ID;
	if (target) {
		if (!snowflake.test(target)) throw new Error('GUILD_ID must be a Discord server ID (17-20 digits).');
		return [target];
	}
	return [...client.guilds.cache.keys()];
}

function getCommandCache(client, guildId) {
	const guildCommands = client.guilds.cache.get(guildId)?.commands.cache || new Collection();
	const globalCommands = client.application.commands.cache.filter(command => !command.guildId);
	const result = new Collection();
	for (const component of client.commands?.components?.values() || []) {
		const definition = component.toJSON();
		const key = commandKey(definition);
		const command = guildCommands.find(command => commandKey(command) === key) || globalCommands.find(command => commandKey(command) === key);
		if (command && fingerprint(command) === fingerprint(definition)) result.set(command.id, command);
	}
	return result;
}

async function fetchCommands(client) {
	const globals = await client.application.commands.fetch({ withLocalizations: true });
	client.application.commands.cache.clear();
	for (const [id, command] of globals) client.application.commands.cache.set(id, command);
	for (const guildId of getGuildIds(client)) {
		try {
			const guild = await client.guilds.fetch(guildId);
			const registered = await guild.commands.fetch({ withLocalizations: true });
			guild.commands.cache.clear();
			for (const [id, command] of registered) guild.commands.cache.set(id, command);
		} catch (error) {
			client.log.warn('Failed to fetch commands for guild %s', guildId);
			client.log.error(error);
		}
	}
}

async function publishCommandsNow(client, guildId, options) {
	const ids = getGuildIds(client, guildId);
	if (!ids.length) throw new Error('No guilds available for command registration.');
	const commands = client.commands.components.map(command => command.toJSON());
	if (!commands.length) throw new Error('No loaded commands; refusing to erase guild commands.');
	const keys = commands.map(commandKey);
	if (new Set(keys).size !== keys.length) throw new Error('Duplicate loaded command names/types; refusing to publish.');
	const applicationId = client.application.id;
	if (!snowflake.test(applicationId)) throw new Error('Discord application ID is not available for command registration.');
	const file = options.registryPath || join('./user', 'command-registrations-' + applicationId + '.json');
	const registry = await readRegistry(applicationId, file);
	// Confirm the ownership record can be saved before changing Discord.
	await writeRegistry(registry, file);
	const errors = [];
	let published = 0;
	for (const id of ids) {
		try {
			const guild = await client.guilds.fetch(id);
			const registered = await guild.commands.fetch({ withLocalizations: true });
			guild.commands.cache.clear();
			for (const [commandId, command] of registered) guild.commands.cache.set(commandId, command);
			registry.guilds[id] ||= {};
			let managed = 0;
			for (const definition of commands) {
				try {
					const key = commandKey(definition);
					const existing = registered.find(command => commandKey(command) === key);
					const desired = fingerprint(definition);
					const current = existing && fingerprint(existing);
					const previous = registry.guilds[id][key];
					if (existing && current !== desired && (previous?.id !== existing.id || previous.fingerprint !== current)) {
						const error = new Error('Command conflict in guild ' + id + ': ' + key + '. Existing command belongs to another publisher or was changed externally; it was preserved.');
						error.code = 'COMMAND_CONFLICT';
						throw error;
					}
					let command = existing;
					if (!existing) command = await guild.commands.create(definition);
					else if (current !== desired) command = await guild.commands.edit(existing.id, definition);
					registry.guilds[id][key] = {
						id: command.id,
						fingerprint: fingerprint(command),
					};
					await writeRegistry(registry, file);
					guild.commands.cache.set(command.id, command);
					managed++;
				} catch (error) {
					client.log.warn('Failed to publish command %s in guild %s', commandKey(definition), id);
					client.log.error(error);
					errors.push(error);
				}
			}
			published += managed;
			client.log.success('Registered %d ticket commands in guild %s; other commands were preserved', managed, id);
		} catch (error) {
			client.log.warn('Failed to publish commands to guild %s', id);
			client.log.error(error);
			errors.push(error);
		}
	}
	if (errors.length) throw new AggregateError(errors, 'Guild command registration failed.');
	return published;
}

function publishCommands(client, guildId, options = {}) {
	// Startup, guild joins and manual publishing must not race the ownership file.
	const previous = publications.get(client) || Promise.resolve();
	const promise = previous.catch(() => {}).then(() => publishCommandsNow(client, guildId, options));
	publications.set(client, promise);
	promise.finally(() => {
		if (publications.get(client) === promise) publications.delete(client);
	}).catch(() => {});
	return promise;
}

module.exports = {
	fetchCommands,
	getCommandCache,
	publishCommands,
};
