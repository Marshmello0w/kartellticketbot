const MAX_ENTRIES = 4;
const MAX_BYTES = 6000;
const STOP = new Set(('a an and are as at be been but by can could did do does for from had has have how i if in is it its me my of on or our please so that the their them there these they this to us was we were what when where which who why will with would you your ' +
	'aber als am an auch auf aus bei bin bis bitte das dem den der des die dies diese dieser doch du ein eine einem einen einer es euch fur habe haben hat hatte hier ich im in ist kann konnen man mein meine mit nach nicht noch nur ob oder sind so uber um und uns unser vom von vor wann warum was wenn wer wie wir wird wurde zu zum zur').split(' '));
const GROUPS = [
	['granatwerfer', 'granatenwerfer', 'grenade', 'launcher'],
	['heli', 'helikopter', 'helicopter'],
	['fahrzeug', 'fahrzeuge', 'vehicle', 'vehicles', 'humvee', 'humvees', 'humvey', 'hamvey'],
	['infanterie', 'infantry'],
	['vip', 'slot', 'slots', 'reserved'],
	['warteschlange', 'queue', 'priority', 'vorrang'],
	['spende', 'spenden', 'donate', 'donation', 'donations'],
	['preis', 'preise', 'kostet', 'kosten', 'price', 'prices', 'cost', 'costs'],
	['verlangerung', 'verlangern', 'renew', 'renewal', 'extend'],
	['ablauf', 'ablaufen', 'expires', 'expiry', 'expire'],
	['gebannt', 'bann', 'ban', 'banned', 'bans'],
	['teamkill', 'teamkills', 'tk'],
	['headshot', 'headshots'],
	['melden', 'meldung', 'spielermeldung', 'report', 'reporting'],
	['beweis', 'beweise', 'evidence', 'proof', 'clip', 'clips'],
	['absturz', 'absturze', 'crash', 'crashes'],
	['rassismus', 'racism', 'racist'],
	['regel', 'regeln', 'rule', 'rules', 'policy', 'policies'],
	['support', 'supporter', 'hilfe', 'help'],
	['erreichbar', 'offnungszeiten', 'zeiten', 'hours', 'available', 'availability'],
	['beitreten', 'finden', 'join', 'find'],
	['deaktivieren', 'deaktiviert', 'entfernen', 'remove', 'removed', 'disable', 'disabled'],
	['erlaubt', 'zulassig', 'allowed', 'permitted'],
];

function words(text) {
	const result = new Set();
	const normalized = String(text || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
	for (const word of normalized.match(/[\p{L}\p{N}]+/gu) || []) {
		if (word.length > 1 && !STOP.has(word)) result.add(word);
	}
	for (const group of GROUPS) {
		if (group.some(word => result.has(word))) result.add('concept:' + group[0]);
	}
	return result;
}

function select(entries, question, categoryId, responseLanguage) {
	const query = words(question);
	if (!query.size) return [];
	// Same-question category overrides win over server defaults.
	const unique = new Map();
	for (const entry of entries) {
		const key = entry.language + ':' + entry.question.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
		if (!unique.has(key) || entry.categoryId === categoryId && unique.get(key).categoryId !== categoryId) unique.set(key, entry);
	}
	const documents = [...unique.values()].map(entry => ({
		entry,
		question: words(entry.question),
		answer: words(entry.answer),
	}));
	const frequencies = new Map();
	for (const doc of documents) {
		for (const word of new Set([...doc.question, ...doc.answer])) frequencies.set(word, (frequencies.get(word) || 0) + 1);
	}
	for (const doc of documents) {
		doc.score = 0;
		for (const word of query) {
			const weight = Math.log(1 + documents.length / (frequencies.get(word) || 1));
			doc.score += weight * (doc.question.has(word) ? 3 : doc.answer.has(word) ? 1 : 0);
		}
	}
	// Knowledge is usable in any source language. Prefer an existing translation
	// only when relevance is equal; never drop relevant facts in another language.
	return documents.filter(doc => doc.score > 0).sort((a, b) => b.score - a.score || Number(b.entry.language === responseLanguage) - Number(a.entry.language === responseLanguage)).slice(0, MAX_ENTRIES).map(doc => doc.entry);
}

function format(entries) {
	let text = '';
	for (const entry of entries) {
		const item = '\nFAQ (' + entry.language + '): ' + entry.question + '\n' + entry.answer + '\n';
		if (Buffer.byteLength(text + item, 'utf8') > MAX_BYTES) continue;
		text += item;
	}
	return text;
}

module.exports = {
	MAX_ENTRIES,
	MAX_BYTES,
	words,
	select,
	format,
};
