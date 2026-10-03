const { refreshPresentations } = require('../../lib/ticket-presentation');
const { deliverPendingTranscripts } = require('../../lib/transcripts');
const {
	fetchCommands, publishCommands,
} = require('../../lib/commands');
const { Listener } = require('@eartharoid/dbf');
const { Events } = require('discord.js');
const ms = require('ms');
const sync = require('../../lib/sync');
const checkForUpdates = require('../../lib/updates');
const {
	getAverageTimes,
	getAverageRating,
	sendToHouston,
} = require('../../lib/stats');
const handleStaleTickets = require('../../lib/stale');

module.exports = class extends Listener {
	constructor(client, options) {
		super(client, {
			...options,
			emitter: client,
			event: Events.ClientReady,
			once: true,
		});
	}

	async run() {
		/** @type {import("client")} */
		const client = this.client;

		// process.title = `"[Discord Tickets] ${client.user.tag}"`; // too long and gets cut off
		process.title = 'tickets';
		client.log.success('Connected to Discord as "%s" over %d shards', client.user.tag, client.ws.shards.size);

		await client.initAfterLogin();

		// fill cache
		await sync(client);

		if (process.env.PUBLISH_COMMANDS !== 'false') {
			client.log.info('Publishing commands to guilds...');
			try {
				await publishCommands(client);
			} catch (error) {
				client.log.error(error);
			}
		} else {
			client.log.notice('Automatic command registration disabled (PUBLISH_COMMANDS=false). Use commands publish to register manually.');
		}

		await client.application.fetch();
		if (process.env.PUBLIC_BOT === 'true' && !client.application.botPublic) {
			client.log.warn('The `PUBLIC_BOT` environment variable is set to `true`, but the bot is not public.');
		} else if (process.env.PUBLIC_BOT !== 'true' && client.application.botPublic) {
			client.log.warn('Your bot is public, but public features are disabled. Set the `PUBLIC_BOT` environment variable to `true`, or make your bot private.');
		}

		// commands are not cached automatically
		await fetchCommands(client);

		// presence/activity
		if (client.config.presence.activities?.length > 0) {
			let next = 0;
			const setPresence = async () => {
				client.log.verbose.cron('Updating presence');
				const cacheKey = 'cache/presence';
				let cached = await client.keyv.get(cacheKey);
				if (!cached) {
					const tickets = await client.prisma.ticket.findMany({
						select: {
							closedAt: true,
							createdAt: true,
							feedback: { select: { rating: true } },
							firstResponseAt: true,
						},
					});
					const closedTickets = tickets.filter(t => t.closedAt);
					const closedTicketsWithResponse = closedTickets.filter(t => t.firstResponseAt);
					const {
						avgResolutionTime,
						avgResponseTime,
					} = await getAverageTimes(closedTicketsWithResponse);
					const avgRating = await getAverageRating(closedTickets);

					cached = {
						avgRating: avgRating.toFixed(1),
						avgResolutionTime: ms(avgResolutionTime),
						avgResponseTime: ms(avgResponseTime),
						guilds: client.guilds.cache.size,
						openTickets: tickets.length - closedTickets.length,
						totalTickets: tickets.length,
					};
					await client.keyv.set(cacheKey, cached, ms('15m'));
				}
				const activity = { ...client.config.presence.activities[next] };
				activity.name = activity.name
					.replace(/{+avgResolutionTime}+/gi, cached.avgResolutionTime)
					.replace(/{+avgResponseTime}+/gi, cached.avgResponseTime)
					.replace(/{+avgRating}+/gi, cached.avgRating)
					.replace(/{+guilds}+/gi, cached.guilds)
					.replace(/{+openTickets}+/gi, cached.openTickets)
					.replace(/{+totalTickets}+/gi, cached.totalTickets);
				client.user.setPresence({
					activities: [activity],
					status: client.config.presence.status,
				});
				next++;
				if (next === client.config.presence.activities.length) next = 0;
			};
			setPresence();
			if (client.config.presence.activities.length > 1) setInterval(() => setPresence(), client.config.presence.interval * 1000);
		} else {
			client.log.info('Presence activities are disabled');
		}

		let refreshingTickets = false;
		const refreshTickets = async startup => {
			if (refreshingTickets) return;
			refreshingTickets = true;
			try {
				await refreshPresentations(client, startup);
			} catch (error) {
				client.log.error(error);
			} finally {
				refreshingTickets = false;
			}
		};
		refreshTickets(true);
		setInterval(() => refreshTickets(false), 30000);
		const { tick: aiTick } = require('../../lib/ai-support');
		const checkAI = () => aiTick(client).catch(() => client.log.warn('AI support worker check failed'));
		checkAI();
		setInterval(checkAI, 5000);

		// stats posting
		if (client.config.stats) {
			sendToHouston(client);
			setInterval(() => sendToHouston(client), ms('12h'));
		}

		if (client.config.updates) {
			checkForUpdates(client);
			setInterval(() => checkForUpdates(client), ms('1w'));
		}

		let sendingTranscripts = false;
		const sendTranscripts = async () => {
			if (sendingTranscripts) return;
			sendingTranscripts = true;
			try {
				await deliverPendingTranscripts(client);
			} catch (error) {
				client.log.error(error);
			} finally {
				sendingTranscripts = false;
			}
		};
		await sendTranscripts();
		setInterval(sendTranscripts, ms('1m'));
		const { tick } = require('../../lib/drive-archive');
		const archiveTick = startup => tick(client, startup).catch(() => client.log.warn('Drive archive worker could not complete its check'));
		archiveTick(true);
		setInterval(() => archiveTick(false), 30000);
		const { finishPendingCloseChannels } = require('../../lib/ticket-close-channel');
		let finishingChannels = false;
		const finishChannels = async () => {
			if (finishingChannels) return;
			finishingChannels = true;
			try {
				await finishPendingCloseChannels(client);
			} catch {
				client.log.warn('Pending ticket channel cleanup could not complete its check');
			} finally {
				finishingChannels = false;
			}
		};
		finishChannels();
		setInterval(finishChannels, 30000);

		if (process.env.PUBLIC_BOT === 'true') {
			client.log.notice('Inactivity warnings and auto-close features are disabled');
			client.log.warn('Unset PUBLIC_BOT to re-enable stale ticket handling');
		} else {
			// send inactivity warnings and close stale tickets
			const staleInterval = ms('15m');
			let checking = false;
			const check = async () => {
				if (checking) return;
				checking = true;
				try {
					await handleStaleTickets(client, staleInterval);
				} catch (error) {
					client.log.error(error);
				} finally {
					checking = false;
				}
			};
			await check();
			setInterval(check, staleInterval);
		}
	}
};
