export const driveErrors = {
	AUTH: 'Google-Anmeldung erneuern',
	QUOTA: 'Google-Drive-Speicher voll',
	NOT_CONFIGURED: 'Noch nicht eingerichtet',
	FOLDER: 'Archivordner nicht erreichbar',
	NOT_PRIVATE: 'Archivordner ist freigegeben',
	PERMISSION: 'Berechtigung fehlt',
	SOURCE: 'Discord-Datei wird erneut abgerufen',
	MISSING: 'Datei nicht mehr erreichbar',
	DISK: 'Lokaler Speicher nicht verfügbar',
	UPLOAD: 'Upload wird wiederholt',
	DOWNLOAD: 'Discord-Datei wurde nicht vollständig heruntergeladen',
	SIZE_MISMATCH: 'Die geladene Dateigröße stimmt nicht mit dem Original überein',
	DOWNLOAD_LIMIT: 'Datei ohne Größenangabe überschreitet das Downloadlimit',
	RATE_LIMIT: 'Google begrenzt die Anfragen',
	SESSION_EXPIRED: 'Abgelaufene Übertragung wird neu gestartet',
	FILE_CONFLICT: 'Gespeicherte Drive-Datei stimmt nicht mit dem Archiv überein',
	DELETE: 'Löschung wird wiederholt',
	DELETE_REFUSED: 'Löschung blockiert: Ticketordner enthält fremde Dateien',
	UNSAFE_URL: 'Dateiadresse kann nicht sicher abgerufen werden',
	EXPIRED: 'Aufbewahrungsfrist abgelaufen',
	TICKET_REMOVED: 'Ticket wurde aus der Datenbank entfernt'
};

export const driveErrorLabel = code => driveErrors[code] || `Archivierungsfehler (${code || 'Unbekannt'})`;

export function driveRetryLabel(entry, now = Date.now()) {
	if (entry.state === 'missing') return 'Datei nicht gesichert';
	if (!entry.nextAttemptAt) return '';
	const due = new Date(entry.nextAttemptAt).getTime();
	if (!Number.isFinite(due)) return '';
	const attempts = entry.attempts ? ` · Fehlversuche: ${entry.attempts}` : '';
	return (due > now ? `Nächster Versuch: ${new Date(due).toLocaleString('de-DE')}` : 'Wiederholung ist fällig') + attempts;
}
