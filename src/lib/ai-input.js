const { detectAll } = require('tinyld');

function language(text, fallback = 'de') {
	const plain = String(text || '')
		.replace(/https?:\/\/\S+|<[@#][!&]?\d+>|\b\d{10,}\b/g, '')
		.slice(0, 3000);
	const candidates = detectAll(plain);
	const first = candidates[0], second = candidates[1];
	if (first?.accuracy >= 0.4 && first.accuracy - (second?.accuracy || 0) >= 0.15) return first.lang;
	return /^[a-z]{2,3}$/.test(fallback) ? fallback : 'de';
}

function supportLanguage(context) {
	return /^[a-z]{2,3}$/.test(context?.responseLanguage || '')
		? context.responseLanguage
		: language(context?.creatorFirstText, context?.fallbackLanguage);
}

function supportQuestion(context) {
	// Explicit allowlist: never serialize the caller's context, even if it contains
	// transcripts, a first-message language seed, form answers or old AI replies.
	return {
		text: String(context?.latestQuestion?.text || '').slice(0, 3000),
		attachments: context?.latestQuestion?.attachments === true,
	};
}

module.exports = {
	language,
	supportLanguage,
	supportQuestion,
};
