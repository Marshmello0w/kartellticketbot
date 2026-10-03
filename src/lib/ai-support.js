const { createHash } = require('node:crypto');
const {
	ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
} = require('discord.js');
const { getSupportMessages } = require('./support-texts');
const {
	participantSide, requestSync,
} = require('./ticket-presentation');
const Gemini = require('./gemini-support');

const include = {
	guild: true,
	category: true,
	questionAnswers: { include: { question: true } },
};
const MAX_REPLIES = 3;
const running = new WeakSet();
const LEASE_MS = 5 * 60000;

function validateSettings(data) {
	if (Object.hasOwn(data, 'aiSupportEnabled') && typeof data.aiSupportEnabled !== 'boolean') throw Object.assign(new Error('Ungültiger KI-Schalter.'), { statusCode: 400 });
	if (Object.hasOwn(data, 'aiKnowledge') && (typeof data.aiKnowledge !== 'string' || data.aiKnowledge.length > 12000)) throw Object.assign(new Error('Supportwissen darf höchstens 12.000 Zeichen enthalten.'), { statusCode: 400 });
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
	const known = await client.prisma.aiTask.findMany({
		where: {
			ticketId: ticket.id,
			state: 'sent',
			discordMessageId: { not: null },
		},
		select: { discordMessageId: true },
	});
	const ids = new Set(known.map(item => item.discordMessageId));
	const conversation = [];
	for (const message of sorted) {
		if (message.webhookId || message.system) continue;
		if (message.author.bot && !ids.has(message.id)) continue;
		conversation.push({
			role: message.author.bot ? 'assistant' : 'user',
			text: String(message.content || message.embeds?.[0]?.description || '').slice(0, 3000),
			attachments: (message.attachments?.size || 0) > 0,
		});
	}
	const decrypt = value => require('./threads').pools.crypto.queue(worker => worker.decrypt(value));
	const context = {
		category: ticket.category?.name || '',
		conversation: conversation.slice(-12),
	};
	if (ticket.topic) context.topic = String(await decrypt(ticket.topic)).slice(0, 3000);
	context.answers = [];
	for (const entry of ticket.questionAnswers.slice(0, 12)) {
		if (entry.value) {
			context.answers.push({
				question: entry.question.label,
				answer: String(await decrypt(entry.value)).slice(0, 1000),
			});
		}
	}
	if (!task.initial) {
		const trigger = messages.get(task.id) || await channel.messages.fetch({
			message: task.id,
			force: true,
			cache: false,
		}).catch(() => null);
		if (!trigger || trigger.author.bot || trigger.webhookId || trigger.system) return { missing: true };
		context.latestQuestion = {
			text: trigger.content.slice(0, 3000),
			attachments: trigger.attachments.size > 0,
		};
	} else {
		context.latestQuestion = context.conversation.at(-1) || {
			text: context.topic || '',
			attachments: false,
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
	const getMessage = await getSupportMessages(client, { ticketId: ticket.id });
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
	const payload = {
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
		embeds: [new EmbedBuilder().setColor(ticket.guild.primaryColour).setTitle(getMessage(handoff ? 'ticket.ai.handoff_title' : 'ticket.ai.title')).setDescription(handoff ? getMessage('ticket.ai.handoff') : await require('./threads').pools.crypto.queue(worker => worker.decrypt(task.response))).setFooter({ text: getMessage(handoff ? 'ticket.ai.handoff_marker' : 'ticket.ai.disclaimer') })],
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
			if (ticket.aiReplies >= MAX_REPLIES || !knowledge(ticket)) return await human(client, ticket, task, ticket.aiReplies >= MAX_REPLIES ? 'LIMIT' : 'KNOWLEDGE');
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
			const result = await generator(client.prisma, task.id, knowledge(ticket), context);
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
	const getMessage = await getSupportMessages(client, { ticketId: interaction.channelId });
	const ticket = await client.prisma.ticket.findUnique({
		where: { id: interaction.channelId },
		include,
	});
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
