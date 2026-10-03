const { createHash } = require('node:crypto');
const {
	ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const { createTranslator } = require('./support-texts');
const {
	participantSide, requestSync,
} = require('./ticket-presentation');
const Gemini = require('./gemini-support');
const Language = require('./ai-language');
const Input = require('./ai-input');
const startTyping = require('./ai-typing');

const include = {
	guild: true,
	category: true,
};
const MAX_REPLIES = 3;
const running = new WeakSet();
const LEASE_MS = 5 * 60000;

function validateSettings(data) {
	if (Object.hasOwn(data, 'aiSupportEnabled') && typeof data.aiSupportEnabled !== 'boolean') throw Object.assign(new Error('Ungültiger KI-Schalter.'), { statusCode: 400 });
	if (Object.hasOwn(data, 'aiKnowledge') && (typeof data.aiKnowledge !== 'string' || data.aiKnowledge.length > 12000)) throw Object.assign(new Error('Supportwissen darf höchstens 12.000 Zeichen enthalten.'), { statusCode: 400 });
	if (Object.hasOwn(data, 'aiResponseLanguage') && !['auto', 'de', 'en'].includes(data.aiResponseLanguage)) throw Object.assign(new Error('Ungültige KI-Antwortsprache.'), { statusCode: 400 });
}
function enabled(ticket) {
	return ticket?.open && !ticket.deleted && ticket.guild.aiSupportEnabled && ticket.category?.aiSupportEnabled && ticket.aiState === 'active' && !ticket.claimedById && !ticket.closeRequestedAt;
}
function knowledge(ticket) {
	return ticket.category?.aiKnowledge?.trim() || ticket.guild.aiKnowledge?.trim() || '';
}
async function enqueue(client, ticketId, message = null) {
	const ticket = await client.prisma.ticket.findUnique({
		where: { id: ticketId },
		include,
	});
	if (!enabled(ticket)) return;
	if (message && (message.author.bot || message.webhookId || message.system || await participantSide(client, ticket, message.author.id) !== 'USER')) return;
	// Existing tickets may have older creator messages from before this feature.
	if (message?.author.id === ticket.createdById && !ticket.aiLanguage && !ticket.aiLanguageSeed) {
		await Language.context(client, ticket, await client.channels.fetch(ticket.id));
	}
	await Language.capture(client, ticket, message);
	const id = message?.id || 'initial-' + ticketId;
	await client.prisma.aiTask.upsert({
		where: { id },
		update: {},
		create: {
			id,
			ticketId,
			guildId: ticket.guildId,
			userId: message?.author.id || ticket.createdById,
			initial: !message,
		},
	});
}
async function stop(client, ticketId) {
	await client.prisma.ticket.updateMany({
		where: {
			id: ticketId,
			open: true,
		},
		data: { aiState: 'human' },
	});
	await client.prisma.aiTask.updateMany({
		where: {
			ticketId,
			state: { in: ['queued', 'processing', 'ready'] },
		},
		data: {
			state: 'cancelled',
			response: null,
		},
	});
}
async function human(client, ticket, task, reason) {
	const claimed = await client.prisma.ticket.updateMany({
		where: {
			id: ticket.id,
			open: true,
			aiState: 'active',
		},
		data: { aiState: 'human' },
	});
	await client.prisma.aiTask.updateMany({
		where: {
			ticketId: ticket.id,
			state: { in: ['queued', 'processing', 'ready'] },
		},
		data: {
			state: 'cancelled',
			response: null,
		},
	});
	if (claimed.count) {
		await client.prisma.aiTask.upsert({
			where: { id: 'human-' + ticket.id },
			create: {
				id: 'human-' + ticket.id,
				ticketId: ticket.id,
				guildId: ticket.guildId,
				userId: ticket.createdById,
				initial: true,
				state: 'handoff',
				errorCode: reason,
			},
			update: {},
		});
		requestSync(client, ticket.id);
		client.log.info('AI support: ticket %s handed to staff (%s)', ticket.id, reason);
	}
	if (task) {
		await client.prisma.aiTask.updateMany({
			where: { id: task.id },
			data: { errorCode: reason },
		});
	}
}
async function transcriptContext(client, ticket, task, channel) {
	const messages = await channel.messages.fetch({
		limit: 50,
		cache: false,
	});
	const sorted = [...messages.values()].sort((a, b) => +a.createdAt - +b.createdAt);
	// Catch replies received while the bot was offline or while preparing a task.
	for (const message of sorted) {
		if (message.author.bot || message.webhookId || message.system) continue;
		if (await participantSide(client, ticket, message.author.id) === 'STAFF') return { staff: true };
	}
	const decrypt = value => require('./threads').pools.crypto.queue(worker => worker.decrypt(value));
	const context = { responseLanguage: await Language.supportLanguage(client, ticket, channel) };
	const safeText = require('./faq-learning').safeText;
	if (!task.initial) {
		const trigger = messages.get(task.id) || await channel.messages.fetch({
			message: task.id,
			force: true,
			cache: false,
		}).catch(() => null);
		if (!trigger || trigger.author.bot || trigger.webhookId || trigger.system) return { missing: true };
		context.latestQuestion = {
			text: safeText(trigger.content).slice(0, 3000),
			attachments: trigger.attachments.size > 0,
		};
	} else {
		const latest = sorted.filter(message => !message.author.bot && !message.webhookId && !message.system && message.author.id === ticket.createdById).at(-1);
		context.latestQuestion = {
			text: safeText(latest?.content || (ticket.topic ? await decrypt(ticket.topic) : '')).slice(0, 3000),
			attachments: (latest?.attachments?.size || 0) > 0,
		};
	}
	return context;
}
function nonce(id) {
	return createHash('sha256').update(id).digest('hex').slice(0, 24);
}
function reference(ticket, task) {
	return task.initial ? ticket.openingMessageId : task.id;
}
async function findDelivery(client, ticket, task, channel, marker) {
	let before;
	let staff = false;
	while (true) {
		const page = await channel.messages.fetch({
			limit: 100,
			cache: false,
			...(before ? { before } : {}),
		});
		for (const message of page.values()) {
			if (message.author.id === client.user.id && message.reference?.messageId === reference(ticket, task) &&
				message.components?.some(row => row.components.some(button => (button.customId || button.data?.custom_id) === marker))) {
				return {
					found: message,
					staff,
				};
			}
			if (!message.author.bot && !message.webhookId && !message.system &&
				await participantSide(client, ticket, message.author.id) === 'STAFF') staff = true;
		}
		if (page.size < 100 || +page.last().createdAt < +task.createdAt - 120000) return { staff };
		const next = page.last().id;
		if (next === before) throw new Error('HISTORY');
		before = next;
	}
}
async function deliver(client, ticket, task, channel) {
	const language = ticket.aiLanguage || Language.configured(ticket.category);
	const locale = language === 'en' ? 'en-GB' : language === 'de' ? 'de' : ticket.guild.locale;
	const getMessage = createTranslator(client.i18n, {
		...ticket.guild,
		locale,
	}, ticket.category);
	const handoff = task.state === 'handoff';
	if (!ticket.open || (!handoff && !enabled(ticket))) {
		await client.prisma.aiTask.updateMany({
			where: { id: task.id },
			data: {
				state: 'cancelled',
				response: null,
			},
		});
		return;
	}
	const ref = reference(ticket, task);
	// Nonces cover brief retries. Matching the reply + button on Discord covers
	// restarts after the nonce window, even if a send succeeded before DB commit.
	const marker = JSON.stringify({
		action: 'ai-human',
		ticket: ticket.id,
		task: nonce(task.id).slice(0, 12),
	});
	const {
		found, staff,
	} = await findDelivery(client, ticket, task, channel, marker);
	if (staff && !handoff) return await stop(client, ticket.id);
	const response = handoff ? getMessage('ticket.ai.handoff') : await require('./threads').pools.crypto.queue(worker => worker.decrypt(task.response));
	const note = '\n\n-# ' + getMessage(handoff ? 'ticket.ai.handoff_marker' : 'ticket.ai.disclaimer');
	const payload = {
		content: response + (response.length + note.length <= 2000 ? note : ''),
		flags: MessageFlags.SuppressEmbeds,
		allowedMentions: {
			parse: [],
			repliedUser: false,
		},
		nonce: nonce(task.id),
		enforceNonce: true,
		reply: {
			messageReference: ref,
			failIfNotExists: false,
		},
		components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(marker).setStyle(ButtonStyle.Secondary).setLabel(getMessage('buttons.ai_human.text')).setDisabled(handoff))],
	};
	// Recheck after network calls; staff actions always take precedence.
	const fresh = await client.prisma.ticket.findUnique({
		where: { id: ticket.id },
		include,
	});
	if (!fresh?.open || !handoff && !enabled(fresh)) return;
	if (!handoff && await client.prisma.aiTask.count({
		where: {
			ticketId: ticket.id,
			state: 'queued',
			createdAt: { gt: task.createdAt },
		},
	})) {
		await client.prisma.aiTask.updateMany({
			where: { id: task.id },
			data: {
				state: 'superseded',
				response: null,
			},
		});
		return;
	}
	const sent = found || await channel.send(payload);
	await client.prisma.$transaction(async tx => {
		const changed = await tx.aiTask.updateMany({
			where: {
				id: task.id,
				discordMessageId: null,
			},
			data: {
				state: 'sent',
				discordMessageId: sent.id,
				response: null,
			},
		});
		if (changed.count && !handoff) {
			await tx.ticket.updateMany({
				where: {
					id: ticket.id,
					open: true,
				},
				data: { aiReplies: { increment: 1 } },
			});
		}
	});
}
async function processTask(client, task, generator) {
	let ticket = await client.prisma.ticket.findUnique({
		where: { id: task.ticketId },
		include,
	});
	if (!ticket?.open || task.state !== 'handoff' && !enabled(ticket)) {
		await client.prisma.aiTask.updateMany({
			where: { id: task.id },
			data: {
				state: 'cancelled',
				response: null,
			},
		});
		return;
	}
	const lease = new Date(Date.now() + LEASE_MS);
	const claimed = await client.prisma.ticket.updateMany({
		where: {
			id: ticket.id,
			open: true,
			OR: [{ aiLeaseUntil: null }, { aiLeaseUntil: { lt: new Date() } }],
		},
		data: { aiLeaseUntil: lease },
	});
	if (!claimed.count) return;
	let stopTyping = () => {};
	try {
		const channel = await client.channels.fetch(ticket.id);
		if (!channel || channel.guildId !== ticket.guildId) return;
		if (task.state === 'queued') {
			const siblings = await client.prisma.aiTask.findMany({
				where: {
					ticketId: ticket.id,
					state: 'queued',
				},
				orderBy: { createdAt: 'desc' },
			});
			if (siblings[0]?.id !== task.id) {
				await client.prisma.aiTask.updateMany({
					where: {
						id: task.id,
						state: 'queued',
					},
					data: { state: 'superseded' },
				});
				return;
			}
			if (ticket.aiReplies >= MAX_REPLIES) return await human(client, ticket, task, 'LIMIT');
			const context = await transcriptContext(client, ticket, task, channel);
			if (context.staff) return await stop(client, ticket.id);
			if (context.missing) {
				await client.prisma.aiTask.updateMany({
					where: { id: task.id },
					data: { state: 'cancelled' },
				});
				return;
			}
			if (!context.latestQuestion.text.trim()) {
				if (!context.latestQuestion.attachments && task.initial) {
					await client.prisma.aiTask.updateMany({
						where: { id: task.id },
						data: { state: 'cancelled' },
					});
					return;
				}
				return await human(client, ticket, task, 'ATTACHMENT');
			}
			if (!context.responseLanguage) {
				await client.prisma.aiTask.updateMany({
					where: { id: task.id },
					data: { state: 'cancelled' },
				});
				return;
			}
			const greeting = ['de', 'en'].includes(context.responseLanguage) && !context.latestQuestion.attachments && Input.isGreeting(context.latestQuestion.text);
			const supportKnowledge = greeting ? '' : [knowledge(ticket), await require('./faq-learning').getKnowledge(client.prisma, ticket, {
				language: context.responseLanguage,
				question: context.latestQuestion.text,
			})].filter(Boolean).join('\n\n');
			if (!greeting && !supportKnowledge) return await human(client, ticket, task, 'KNOWLEDGE');
			const claim = await client.prisma.aiTask.updateMany({
				where: {
					id: task.id,
					state: 'queued',
				},
				data: {
					state: 'processing',
					leaseUntil: lease,
				},
			});
			if (!claim.count) return;
			ticket = await client.prisma.ticket.findUnique({
				where: { id: ticket.id },
				include,
			});
			if (!enabled(ticket)) return await stop(client, ticket.id);
			stopTyping = startTyping(channel, async () => enabled(await client.prisma.ticket.findUnique({
				where: { id: ticket.id },
				include,
			})));
			const result = greeting ? {
				action: 'answer',
				language: context.responseLanguage,
				text: createTranslator(client.i18n, {
					...ticket.guild,
					locale: context.responseLanguage === 'en' ? 'en-GB' : 'de',
				}, ticket.category)('ticket.ai.clarification'),
			} : await generator(client.prisma, task.id, supportKnowledge, context);
			await Language.pin(client, ticket.id, result.language);
			if (result.action !== 'answer') return await human(client, ticket, task, result.reason || 'MODEL');
			const protectedResponse = await require('./threads').pools.crypto.queue(worker => worker.encrypt(result.text));
			const saved = await client.prisma.aiTask.updateMany({
				where: {
					id: task.id,
					state: 'processing',
				},
				data: {
					state: 'ready',
					response: protectedResponse,
					tier: result.tier || null,
				},
			});
			if (!saved.count) return;
			task = await client.prisma.aiTask.findUnique({ where: { id: task.id } });
			ticket = await client.prisma.ticket.findUnique({
				where: { id: ticket.id },
				include,
			});
		}
		await deliver(client, ticket, task, channel);
	} catch {
		// Never log message text, prompts, response bodies, headers or API keys.
		const fresh = await client.prisma.aiTask.findUnique({ where: { id: task.id } });
		if (fresh?.state === 'processing' || task.state === 'queued') {
			await human(client, ticket, task, 'ERROR');
		} else {
			await client.prisma.aiTask.updateMany({
				where: { id: task.id },
				data: {
					leaseUntil: new Date(Date.now() + 60000),
					errorCode: 'DELIVERY',
				},
			});
			client.log.warn('AI support delivery pending for ticket %s', ticket.id);
		}
	} finally {
		stopTyping();
		await client.prisma.ticket.updateMany({
			where: {
				id: ticket.id,
				aiLeaseUntil: lease,
			},
			data: { aiLeaseUntil: null },
		});
	}
}
async function tick(client, generator = Gemini.generate) {
	if (!client.prisma.aiTask || running.has(client)) return;
	running.add(client);
	try {
		const interrupted = await client.prisma.aiTask.findMany({
			where: {
				state: 'processing',
				leaseUntil: { lt: new Date() },
			},
			take: 20,
		});
		for (const task of interrupted) {
			const ticket = await client.prisma.ticket.findUnique({
				where: { id: task.ticketId },
				include,
			});
			if (ticket?.open && ticket.aiState === 'active') {
				await human(client, ticket, task, 'RESTART');
			} else {
				await client.prisma.aiTask.updateMany({
					where: { id: task.id },
					data: {
						state: 'cancelled',
						response: null,
					},
				});
			}
		}
		const tasks = await client.prisma.aiTask.findMany({
			where: {
				state: { in: ['queued', 'ready', 'handoff'] },
				createdAt: { lte: new Date(Date.now() - 2000) },
				OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
			},
			orderBy: { createdAt: 'asc' },
			take: 20,
		});
		// Serial processing also limits paid concurrency and provider rate spikes.
		for (const task of tasks) await processTask(client, task, generator);
	} finally {
		running.delete(client);
	}
}
async function humanButton(client, id, interaction) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	const ticket = await client.prisma.ticket.findUnique({
		where: { id: interaction.channelId },
		include,
	});
	const language = ticket?.aiLanguage || Language.configured(ticket?.category);
	const locale = language === 'en' ? 'en-GB' : language === 'de' ? 'de' : ticket?.guild?.locale;
	const getMessage = createTranslator(client.i18n, {
		...ticket?.guild,
		locale,
	}, ticket?.category);
	if (!ticket?.open || ticket.guildId !== interaction.guildId || id.ticket !== ticket.id || ticket.createdById !== interaction.user.id && await participantSide(client, ticket, interaction.user.id) !== 'STAFF') return interaction.editReply({ content: getMessage('ticket.ai.denied') });
	await human(client, ticket, null, 'REQUESTED');
	await interaction.editReply({ content: getMessage('ticket.ai.requested') });
}
module.exports = {
	MAX_REPLIES,
	validateSettings,
	enabled,
	knowledge,
	enqueue,
	stop,
	human,
	transcriptContext,
	deliver,
	processTask,
	tick,
	humanButton,
};
