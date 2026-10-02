const fs = require('node:fs');
const path = require('node:path');
const Mustache = require('mustache');
const MarkdownIt = require('markdown-it');
const { createTranslator } = require('./support-texts');

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	'\'': '&#39;',
})[c]);
const safeUrl = value => {
	try {
		const url = new URL(String(value));
		return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
	} catch {
		return '';
	}
};
const defaultAvatar = user => 'https://cdn.discordapp.com/embed/avatars/' + (user.discriminator && user.discriminator !== '0' ? Number(user.discriminator) % 5 : Number((BigInt(/^\d+$/.test(user.userId || '') ? user.userId : '0') >> 22n) % 6n)) + '.png';
function avatarUrl(user = {}) {
	if (safeUrl(user.avatarUrl)) return safeUrl(user.avatarUrl);
	if (/^(a_)?[a-f0-9]+$/.test(user.avatar || '') && /^\d+$/.test(user.userId || '')) return 'https://cdn.discordapp.com/avatars/' + user.userId + '/' + user.avatar + '.png?size=128';
	return defaultAvatar(user);
}
function discordAssetKey(value) {
	try {
		const url = new URL(value);
		if (!['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) return value;
		const attachment = url.pathname.match(/^\/attachments\/\d+\/(\d+)\//);
		if (attachment) return 'attachment:' + attachment[1];
		const emoji = url.pathname.match(/^\/emojis\/(\d+)/);
		if (emoji) return 'emoji:' + emoji[1];
		url.hostname = 'cdn.discordapp.com';
		url.search = '';
		url.hash = '';
		return url.href;
	} catch {
		return value;
	}
}
function renderHtml(ticket, options = {}) {
	const tr = createTranslator(options.i18n, ticket.guild, ticket.category);
	const label = key => tr('ticket.transcript.html.' + key);
	const users = new Map((ticket.archivedUsers || []).map(u => [u.userId, u]));
	const roles = new Map((ticket.archivedRoles || []).map(r => [r.roleId, r]));
	const channels = new Map((ticket.archivedChannels || []).map(c => [c.channelId, c]));
	const messages = new Map((ticket.archivedMessages || []).map(m => [m.id, m]));
	const assets = options.assets;
	const missing = new Set(options.missingAssets || []);
	for (const message of ticket.archivedMessages || []) for (const attachment of message.content?.attachments || []) if (missing.has('attachment:' + attachment.id)) missing.add(attachment.url);
	const asset = (key, url) => {
		if (missing.has(key) || missing.has(url) || missing.has(discordAssetKey(url))) return '';
		if (!assets) return safeUrl(url);
		const stored = assets.get(key) || assets.get(url) || assets.get(discordAssetKey(url));
		return stored?.path || '';
	};
	const locale = ticket.guild?.locale || 'en-GB';
	const date = value => {
		try {
			return new Intl.DateTimeFormat(locale, {
				dateStyle: 'medium',
				timeStyle: 'short',
				timeZone: 'UTC',
			}).format(new Date(value));
		} catch {
			return '';
		}
	};
	const md = new MarkdownIt({
		html: false,
		breaks: true,
		linkify: true,
	});
	md.disable('image');
	md.validateLink = url => Boolean(safeUrl(url)) || /^mailto:[^\s]+$/i.test(url);
	md.renderer.rules.link_open = (tokens, index, settings, env, self) => {
		tokens[index].attrSet('rel', 'noreferrer noopener');
		tokens[index].attrSet('target', '_blank');
		return self.renderToken(tokens, index, settings);
	};
	// Discord tokens are parsed only outside inline code and fenced code blocks.
	md.inline.ruler.before('autolink', 'discord', (state, silent) => {
		const match = state.src.slice(state.pos).match(/^<(?:@!?(\d+)|@&(\d+)|#(\d+)|(a?):([A-Za-z0-9_]+):(\d+)|t:(-?\d{1,12})(?::([tTdDfFR]))?)>/);
		if (!match) return false;
		if (!silent) {
			const token = state.push('html_inline', '', 0);
			if (match[1]) {
				token.content = '<span class="mention">@' + escape(users.get(match[1])?.displayName || users.get(match[1])?.username || match[1]) + '</span>';
			} else if (match[2]) {
				token.content = '<span class="mention">@' + escape(roles.get(match[2])?.name || match[2]) + '</span>';
			} else if (match[3]) {
				token.content = '<span class="mention">#' + escape(channels.get(match[3])?.name || match[3]) + '</span>';
			} else if (match[6]) {
				const url = 'https://cdn.discordapp.com/emojis/' + match[6] + '.' + (match[4] ? 'gif' : 'png');
				const src = asset('emoji:' + match[6], url);
				token.content = src ? '<img class="emoji" src="' + escape(src) + '" alt=":' + escape(match[5]) + ':" loading="lazy">' : ':' + escape(match[5]) + ':';
			} else {
				token.content = '<span class="mention">' + escape(date(Number(match[7]) * 1000)) + '</span>';
			}
		}
		state.pos += match[0].length;
		return true;
	});
	md.inline.ruler.at('text', (state, silent) => {
		const position = state.src.slice(state.pos, state.posMax).search(/[\n!#$%&*+\-:<=>@[\\\]^_\x60{}~|]/);
		if (position === 0) return false;
		const end = position < 0 ? state.posMax : state.pos + position;
		if (!silent) state.pending += state.src.slice(state.pos, end);
		state.pos = end;
		return true;
	});
	md.inline.ruler.before('text', 'spoiler', (state, silent) => {
		if (!state.src.startsWith('||', state.pos)) return false;
		const end = state.src.indexOf('||', state.pos + 2);
		if (end < 0) return false;
		if (!silent) {
			const token = state.push('html_inline', '', 0);
			token.content = '<details class="spoiler"><summary>' + escape(label('spoiler')) + '</summary>' + escape(state.src.slice(state.pos + 2, end)) + '</details>';
		}
		state.pos = end + 2;
		return true;
	});
	const markdown = value => md.render(String(value ?? ''));
	const link = (url, text) => safeUrl(url) ? '<a href="' + escape(safeUrl(url)) + '" target="_blank" rel="noreferrer noopener">' + escape(text) + '</a>' : escape(text);
	const image = (url, key, alt = '') => {
		if (safeUrl(url) && !['cdn.discordapp.com', 'media.discordapp.net'].includes(new URL(url).hostname)) return link(url, alt || label('attachment'));
		const src = asset(key || url, url);
		return src ? '<img class="media" src="' + escape(src) + '" alt="' + escape(alt) + '" loading="lazy">' : '';
	};
	const embedHtml = (original, attachments = []) => {
		const e = original.data || original;
		const resolveImage = url => url?.startsWith('attachment://') ? attachments.find(a => (a.name || a.filename) === url.slice(13))?.url : url;
		const colour = Number.isInteger(e.color) && e.color >= 0 && e.color <= 0xFFFFFF ? e.color.toString(16).padStart(6, '0') : '5865f2';
		return '<div class="embed" style="border-color:#' + colour + '">' +
			(e.author ? '<div class="embed-author">' + image(e.author.icon_url, null, '') + link(e.author.url, e.author.name) + '</div>' : '') +
			(e.title ? '<strong>' + link(e.url, e.title) + '</strong>' : '') + markdown(e.description) +
			'<div class="embed-fields">' + (e.fields || []).map(f => '<div class="' + (f.inline ? 'inline' : '') + '"><strong>' + escape(f.name) + '</strong>' + markdown(f.value) + '</div>').join('') + '</div>' +
			image(resolveImage(e.thumbnail?.url), null) + image(resolveImage(e.image?.url), null) +
			(e.footer ? '<small class="embed-footer">' + image(e.footer.icon_url, null, '') + escape(e.footer.text) + ' ' + escape(e.timestamp ? date(e.timestamp) : '') + '</small>' : '') + '</div>';
	};
	const componentsHtml = rows => (rows || []).map(original => {
		const row = original.data || original;
		const elements = original.components || row.components || [row];
		return '<div class="components">' + elements.map(originalChild => {
			const c = originalChild.data || originalChild;
			const emojiUrl = c.emoji?.id && /^\d+$/.test(c.emoji.id) ? asset('emoji:' + c.emoji.id, 'https://cdn.discordapp.com/emojis/' + c.emoji.id + '.' + (c.emoji.animated ? 'gif' : 'png')) : '';
			const emoji = emojiUrl ? '<img class="emoji" src="' + escape(emojiUrl) + '" alt="' + escape(c.emoji.name) + '">' : escape(c.emoji?.name || '');
			return '<span class="component style-' + ([1, 2, 3, 4, 5].includes(c.style) ? c.style : 2) + '">' + emoji + ' ' + escape(c.label || c.placeholder || (c.options || []).map(o => o.label).join(' · ') || label('menu')) + '</span>';
		}).join('') + '</div>';
	}).join('');
	const attachmentsHtml = items => (items || []).map(a => {
		const name = a.name || a.filename || 'attachment';
		const key = 'attachment:' + a.id;
		const src = asset(key, a.url);
		const mime = a.contentType || a.content_type || '';
		const isImage = /^image\/(png|jpeg|gif|webp|avif)$/.test(mime) || /\.(png|jpe?g|gif|webp|avif)$/i.test(name);
		const fileLink = src ? '<a href="' + escape(src) + '" rel="noreferrer noopener" download>' + escape(name) + '</a>' : escape(name) + ' <span class="missing">' + escape(label('unavailable')) + '</span>';
		return '<div class="attachment">' + (src && isImage ? image(a.url, key, name) : '') + '<div>' + fileLink + ' <small>' + escape(a.size ? (a.size / 1024).toFixed(1) + ' KiB' : '') + '</small></div></div>';
	}).join('');
	let previous;
	const rows = (ticket.archivedMessages || []).map(message => {
		const content = message.content || {};
		const author = {
			...users.get(message.authorId),
			...content.author,
			userId: message.authorId,
		};
		const name = author.displayName || author.username || message.authorId || label('unknown');
		const role = roles.get(author.roleId);
		const colour = /^[a-f0-9]{6}$/i.test(role?.colour || '') && role.colour !== '000000' ? role.colour : 'f2f3f5';
		const day = Number.isFinite(new Date(message.createdAt).getTime()) ? new Date(message.createdAt).toISOString().slice(0, 10) : '';
		const grouped = previous && previous.authorId === message.authorId && previous.day === day && new Date(message.createdAt) - new Date(previous.createdAt) < 300000 && !content.reference;
		const divider = previous?.day !== day ? '<div class="day">' + escape(day) + '</div>' : '';
		previous = {
			...message,
			day,
		};
		const reference = messages.get(content.reference);
		const reply = content.reference ? '<div class="reply">' + (reference ? '<a href="#message-' + escape(reference.id) + '">↪ ' + escape(users.get(reference.authorId)?.displayName || reference.authorId) + ': ' + escape((reference.content?.content || label('attachment')).slice(0, 160)) + '</a>' : escape(label('missingReply'))) + '</div>' : '';
		const url = avatarUrl(author);
		const src = asset(url, url);
		const avatar = src ? '<img class="avatar" src="' + escape(src) + '" alt="' + escape(name) + '" loading="lazy">' : '<span class="avatar fallback">' + escape(name.slice(0, 2).toUpperCase()) + '</span>';
		return divider + '<article id="message-' + escape(message.id) + '" class="message ' + (grouped ? 'grouped' : '') + '">' + (grouped ? '' : avatar) + '<div class="body">' + reply +
			'<header>' + (grouped ? '' : '<strong style="color:#' + colour + '">' + escape(name) + '</strong> ' + (author.bot ? '<span class="bot">APP</span>' : '')) + ' <a class="time" href="#message-' + escape(message.id) + '">' + escape(date(message.createdAt)) + '</a> ' +
			(message.edited ? '<small>' + escape(label('edited')) + '</small>' : '') + ' ' + (message.deleted ? '<small class="missing">' + escape(label('deleted')) + '</small>' : '') + '</header>' +
			markdown(content.content) + attachmentsHtml(content.attachments) + (content.embeds || []).map(e => embedHtml(e, content.attachments)).join('') + componentsHtml(content.components) + '</div></article>';
	}).join('');
	const metadata = [
		[label('category'), ticket.category?.name],
		[label('creator'), ticket.createdBy?.displayName || ticket.createdBy?.username || ticket.createdById],
		[label('created'), date(ticket.createdAt)],
		[label('closed'), ticket.closedAt ? date(ticket.closedAt) : label('open')],
		[label('closedBy'), ticket.closedBy?.displayName || ticket.closedBy?.username || ticket.closedById || label('automatic')],
		[label('claimed'), ticket.claimedBy?.displayName || ticket.claimedBy?.username || ticket.claimedById || '—'],
		[label('topic'), ticket.topic],
		[label('reason'), ticket.closedReason],
		...(ticket.feedback ? [[label('rating'), ticket.feedback.rating + '/5'], [label('feedback'), ticket.feedback.comment]] : []),
	].filter(([, value]) => value).map(([name, value]) => '<div><dt>' + escape(name) + '</dt><dd>' + escape(value) + '</dd></div>').join('');
	const questions = (ticket.questionAnswers || []).map(a => '<section><strong>' + escape(a.question?.label) + '</strong>' + markdown(a.value || label('noAnswer')) + '</section>').join('');
	const template = fs.readFileSync(options.templatePath || path.join(__dirname, '../user/templates/transcript.html.mustache'), 'utf8');
	return Mustache.render(template, {
		locale,
		title: (ticket.category?.name || 'Ticket') + ' #' + ticket.number,
		channelName: options.channelName || ticket.channelBaseName || 'ticket-' + ticket.number,
		guildName: options.guildName || ticket.guildId,
		ticketId: ticket.id,
		metadata,
		questions,
		messages: rows || '<p>' + escape(label('empty')) + '</p>',
		info: assets ? label('offline') : label('external'),
		questionsLabel: label('questions'),
		unavailable: missing.size || assets && [...assets.values()].some(a => !a.path) ? label('incomplete') : '',
	});
}

module.exports = {
	avatarUrl,
	defaultAvatar,
	discordAssetKey,
	escape,
	renderHtml,
	safeUrl,
};
