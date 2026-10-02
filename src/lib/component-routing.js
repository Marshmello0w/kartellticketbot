const {
	AutocompleteModule, CommandsModule, FrameworkModule, ListenersModule, StdinCommandsModule,
} = require('@eartharoid/dbf');
const {
	Client, Collection, Events, InteractionType,
} = require('discord.js');
const { existsSync } = require('node:fs');

function parseComponentId(customId) {
	try {
		const id = JSON.parse(customId);
		if (!id || typeof id !== 'object' || Array.isArray(id) || typeof id.action !== 'string' || !id.action.trim()) return null;
		return id;
	} catch {
		return null;
	}
}

// Keep DBF's component lifecycle and events, but guard parsing in each router.
// Other interaction listeners, including DM collectors, still receive their IDs.
class ComponentModule extends FrameworkModule {
	constructor(client, name, matches) {
		super(client, name);
		const key = name.slice(0, -1);
		client.on(Events.InteractionCreate, async interaction => {
			if (!matches(interaction)) return;
			const id = parseComponentId(interaction.customId);
			if (!id || !this.components.has(id.action)) {
				this.emit('unknown', interaction);
				return;
			}
			const component = this.components.get(id.action);
			const context = {
				interaction,
				[key]: component,
			};
			try {
				this.emit('run', context);
				await component.run(id, interaction);
				this.emit('success', context);
			} catch (error) {
				this.emit('error', {
					...context,
					error,
				});
			}
		});
	}
}

class ComponentClient extends Client {
	constructor(discordOptions, frameworkOptions) {
		super(discordOptions);
		this.baseDir = frameworkOptions?.baseDir ?? (existsSync('./src') ? './src' : './');
		this.mods = new Collection();
		this.autocomplete = new AutocompleteModule(this);
		this.buttons = new ComponentModule(this, 'buttons', interaction => interaction.isButton());
		this.commands = new CommandsModule(this);
		this.events = new ListenersModule(this);
		this.menus = new ComponentModule(this, 'menus', interaction => interaction.isStringSelectMenu());
		this.modals = new ComponentModule(this, 'modals', interaction => interaction.type === InteractionType.ModalSubmit);
		this.stdin = new StdinCommandsModule(this);
		// Register listeners before loading components, matching DBF's load order.
		this.events.loadAll();
		for (const name of ['autocomplete', 'buttons', 'commands', 'menus', 'modals', 'stdin']) this[name].loadAll();
	}
}

module.exports = {
	ComponentClient,
	parseComponentId,
};
