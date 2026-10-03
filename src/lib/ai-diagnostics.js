// Only fixed codes/descriptions cross the log and portal boundary. Never expose
// Google's error body, ErrorInfo metadata, request text or credentials.
const messages = {
	CONFIG: 'Die private Gemini-Konfiguration fehlt oder ist ungültig.',
	KNOWLEDGE: 'Für diese Frage ist kein freigegebenes FAQ-Wissen vorhanden.',
	QUOTA: 'Das verfügbare Gemini-Kontingent ist erschöpft.',
	BUDGET: 'Der bezahlte Zugang hat kein verfügbares Bot-Budget mehr.',
	MODEL: 'Gemini hat eine Übergabe empfohlen oder keine verwendbare Antwort geliefert.',
	ATTACHMENT: 'Die Anfrage enthält nur Dateien; ein Mensch muss sie prüfen.',
	LIMIT: 'Die Grenze von drei KI-Antworten wurde erreicht.',
	REQUESTED: 'Menschlicher Support wurde ausdrücklich angefordert.',
	ERROR: 'Die KI-Aufgabe konnte nicht verarbeitet werden.',
	RESTART: 'Eine beim Neustart unterbrochene Anfrage wurde an das Team übergeben.',
	PROVIDER: 'Gemini-Anfrage fehlgeschlagen. Der alte Eintrag enthält keinen genaueren Fehlergrund.',
	PROVIDER_API_KEY_INVALID: 'Google lehnt den API-Schlüssel ab. In AI Studio prüfen und die private Konfiguration aktualisieren.',
	PROVIDER_API_KEY_EXPIRED: 'Der API-Schlüssel ist abgelaufen. In AI Studio einen neuen Schlüssel erstellen.',
	PROVIDER_API_KEY_LEAKED: 'Google hat den API-Schlüssel wegen einer erkannten Veröffentlichung gesperrt. Schlüssel ersetzen.',
	PROVIDER_KEY_RESTRICTED: 'Die Schlüsselbeschränkungen erlauben den Zugriff vom Botserver auf Gemini nicht.',
	PROVIDER_SERVICE_DISABLED: 'Die Gemini-API ist für dieses Google-Projekt deaktiviert.',
	PROVIDER_PRECONDITION: 'Google meldet eine fehlende Voraussetzung. Verfügbarkeit des kostenlosen Zugangs und Projekteinstellungen in AI Studio prüfen.',
	PROVIDER_HTTP_400: 'Google lehnt die Anfrage als ungültig ab.',
	PROVIDER_HTTP_401: 'Google akzeptiert die Anmeldung mit diesem Schlüssel nicht.',
	PROVIDER_HTTP_402: 'Google meldet fehlendes Guthaben für diesen Zugang.',
	PROVIDER_HTTP_403: 'Google verweigert den Zugriff. Schlüssel, API-Berechtigungen und Einschränkungen in AI Studio prüfen.',
	PROVIDER_HTTP_404: 'Das verwendete Gemini-Modell ist für diesen Zugang nicht verfügbar.',
	PROVIDER_HTTP_408: 'Google meldet eine Zeitüberschreitung.',
	PROVIDER_HTTP_429: 'Google meldet ein erschöpftes Kontingent oder zu viele Anfragen.',
	PROVIDER_HTTP_500: 'Google meldet einen internen Fehler.',
	PROVIDER_HTTP_502: 'Google meldet einen Gateway-Fehler.',
	PROVIDER_HTTP_503: 'Gemini ist vorübergehend nicht verfügbar.',
	PROVIDER_HTTP_504: 'Google meldet eine Zeitüberschreitung am Gateway.',
	PROVIDER_HTTP_UNKNOWN: 'Google hat die Anfrage mit einem unerwarteten HTTP-Status abgelehnt.',
	PROVIDER_TIMEOUT: 'Google hat innerhalb der Wartezeit nicht geantwortet.',
	PROVIDER_CONNECT_TIMEOUT: 'Der Botserver konnte rechtzeitig keine Verbindung zu Google herstellen.',
	PROVIDER_DNS: 'Der Botserver kann die Adresse von Google nicht auflösen.',
	PROVIDER_NETWORK: 'Die Verbindung vom Botserver zu Google ist fehlgeschlagen.',
	PROVIDER_INVALID_RESPONSE: 'Google hat keine gültige API-Antwort geliefert.',
	PROVIDER_MODEL_UNSUPPORTED: 'Dieses Modell unterstützt für den Zugang keine Chat-Antworten.',
	UNKNOWN: 'Der gespeicherte Eintrag enthält keinen bekannten Fehlergrund.',
};

function describeReason(value) {
	const code = Object.hasOwn(messages, value) ? value : 'UNKNOWN';
	return {
		code,
		message: messages[code],
	};
}
module.exports = { describeReason };
