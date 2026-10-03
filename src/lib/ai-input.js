const { detectAll } = require('tinyld');

function language(text, fallback = 'de') {
	const plain = String(text || '')
		.replace(/https?:\/\/\S+|<[@#][!&]?\d+>|\b\d{10,}\b/g, '')
		.slice(0, 3000);
	const fallbackLanguage = /^[a-z]{2,3}$/.test(fallback) ? fallback : 'de';
	// Short greetings and emoticons have too little evidence for statistical
	// detection (for example, "uwu" was incorrectly classified as Kirundi).
	if (isGreeting(plain)) {
		if (/^(?:hello|good\s+)/i.test(plain.trim())) return 'en';
		if (/^(?:hallo|huhu|moin|servus|guten\s+)/i.test(plain.trim())) return 'de';
		return fallbackLanguage;
	}
	const candidates = detectAll(plain);
	const first = candidates[0], second = candidates[1];
	if (first?.accuracy >= 0.4 && first.accuracy - (second?.accuracy || 0) >= 0.15) return first.lang;
	return fallbackLanguage;
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

function isGreeting(text) {
	// Exact, short messages only: never classify a real question by its greeting.
	return typeof text === 'string' && text.length <= 60 && /^(?:hi|hey|hello|hallo|huhu|moin|servus|guten\s+(?:morgen|tag|abend)|good\s+(?:morning|afternoon|evening)|uwu|owo)[\s.!?,]*$/iu.test(text.trim());
}

module.exports = {
	language,
	supportLanguage,
	supportQuestion,
	isGreeting,
};
