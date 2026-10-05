const { detectAll } = require('tinyld');

const EN_WORDS = new Set('i you your we our my is are am why what how when where much many can could would should do does did please need help have not'.split(' '));
const DE_WORDS = new Set('ich du ihr euch eure wir unser ist sind warum was wie wann wo kann kannst können könnt könnte bitte brauche brauchen habe haben nicht'.split(' '));
const EN_CLEAR = new Set('banned allowed forbidden removed disabled thanks hello'.split(' '));
const DE_CLEAR = new Set('gebannt erlaubt verboten entfernt deaktiviert danke hallo'.split(' '));

function detectedLanguage(text) {
	const plain = String(text || '')
		.replace(/https?:\/\/\S+|<[@#][!&]?\d+>|\b\d{10,}\b/g, '')
		.slice(0, 3000);
	// Short greetings and emoticons have too little evidence for statistical
	// detection (for example, "uwu" was incorrectly classified as Kirundi).
	if (isGreeting(plain)) {
		if (/^(?:hello|good\s+)/i.test(plain.trim())) return 'en';
		if (/^(?:hallo|huhu|moin|servus|guten\s+)/i.test(plain.trim())) return 'de';
		return null;
	}
	const candidates = detectAll(plain);
	const first = candidates[0], second = candidates[1];
	if (first?.accuracy >= 0.4 && first.accuracy - (second?.accuracy || 0) >= 0.15) return first.lang;
	// N-gram scores are often very low for short support questions and game
	// names/typos. Use distinct DE/EN grammar and words, without treating neutral
	// keywords such as "VIP", "server" or "Humvee" as language evidence.
	const words = new Set(plain.toLowerCase().match(/[\p{L}]+/gu) || []);
	const score = (markers, clear) => [...words].reduce((sum, word) => sum + (clear.has(word) ? 2 : markers.has(word) ? 1 : 0), 0);
	const en = score(EN_WORDS, EN_CLEAR), de = score(DE_WORDS, DE_CLEAR);
	if (en >= 2 && en - de >= 2) return 'en';
	if (de >= 2 && de - en >= 2) return 'de';
	return null;
}

function language(text, fallback = 'de') {
	return detectedLanguage(text) || (/^[a-z]{2,3}$/.test(fallback) ? fallback : 'de');
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
	detectedLanguage,
	language,
	supportLanguage,
	supportQuestion,
	isGreeting,
};
