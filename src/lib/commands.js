const snowflake = /^\d{17,20}$/;

function getGuildIds(client, guildId) {
	const target = guildId || process.env.GUILD_ID;
	if (target) {
		if (!snowflake.test(target)) throw new Error('GUILD_ID must be a Discord server ID (17-20 digits).');
		return [target];
	}
	return [...client.guilds.cache.keys()];
}

function getCommandCache(client, guildId) {
	const commands = client.guilds.cache.get(guildId)?.commands.cache;
	if (commands?.size) return commands;
	return client.application.commands.cache.filter(command => !command.guildId);
}

async function fetchCommands(client) {
	await client.application.commands.fetch();
	for (const guildId of getGuildIds(client)) {
		try {
			const guild = await client.guilds.fetch(guildId);
			await guild.commands.fetch();
		} catch (error) {
			client.log.warn('Failed to fetch commands for guild %s', guildId);
			client.log.error(error);
		}
	}
}

async function publishCommands(client, guildId) {
	const ids = getGuildIds(client, guildId);
	if (!ids.length) throw new Error('No guilds available for command registration.');
	const commands = client.commands.components.map(command => command.toJSON());
	if (!commands.length) throw new Error('No loaded commands; refusing to erase guild commands.');
	const errors = [];
	let published = 0;
	for (const id of ids) {
		try {
			const guild = await client.guilds.fetch(id);
			const registered = await guild.commands.set(commands);
			guild.commands.cache.clear();
			for (const [id, command] of registered) guild.commands.cache.set(id, command);
			published += registered.size;
			client.log.success('Published %d commands to guild %s', registered.size, id);
		} catch (error) {
			client.log.warn('Failed to publish commands to guild %s', id);
			client.log.error(error);
			errors.push(error);
		}
	}
	if (errors.length) throw new AggregateError(errors, 'Guild command registration failed.');
	// Remove legacy global registrations only after every connected guild is covered.
	if ([...client.guilds.cache.keys()].every(id => ids.includes(id))) {
		await client.application.commands.set([]);
		client.application.commands.cache.clear();
	}
	return published;
}

module.exports = {
	fetchCommands,
	getCommandCache,
	publishCommands,
};
