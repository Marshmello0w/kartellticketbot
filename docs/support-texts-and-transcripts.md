# Supporttexte und Transkript-Kanal

Nach dem üblichen Bot-Update und Neustart werden die Datenbankänderungen automatisch angewendet. Das Repository enthält den Portal-Quellcode in Version 2.5.5 und den fertigen Build. Auf dem Bot-Host ist kein separater Frontend-Build erforderlich.

## Texte einrichten

In der Serververwaltung gibt es **Texte**. In einer gespeicherten Kategorie führt **Texte dieser Kategorie bearbeiten** zum gleichen Editor für diese Kategorie.

Die Auflösung ist: eigener Kategorie-Text → eigener Server-Text → Standardtext der bisherigen Server-Locale. Somit können beispielsweise die Kategorien Deutsch und English im selben Server eigene Buttons, Schließanfragen und Feedback-Formulare haben. Ohne bekannte Kategorie gelten die Servertexte; vor der Serverauswahl bei einer Direktnachricht gilt der bisherige allgemeine Standard.

Der Editor bietet Bereiche, Suche, eine Vorschau mit Beispieldaten, verfügbare Platzhalter und getrennte Pluralvarianten. Markdown und Zeilenumbrüche bleiben gespeichert. Nur die am jeweiligen Feld angezeigten Platzhalter sind erlaubt. Längenlimits gelten auch für ausgefüllte Platzhalter; lange kombinierte Embed-Inhalte werden auf die Discord-Grenzen gekürzt.

**Auf Standard zurücksetzen** entfernt die eigene Anpassung. Bei Kategorien wird anschließend wieder der Servertext übernommen, sofern vorhanden. Änderungen mit **Texte speichern** bestätigen. Sie gelten sofort für künftig erzeugte Nachrichten und Buttons; ein Speichern aktualisiert keine bereits vorhandenen Discord-Nachrichten.

Begrüßung, Fragen, Kategorienamen und Beschreibungen bleiben in ihren bisherigen Feldern. Command-Namen, Optionen, IDs und Emoji-Konfiguration werden durch Textvorlagen nicht verändert. Die APIs unter `/api/admin/guilds/:guild/texts` und `/categories/:category/texts` verwenden die bisherigen Administratorrechte; ein PATCH mit `{ "overrides": {} }` setzt alle Anpassungen des jeweiligen Bereichs zurück.

## Transkripte einrichten

Unter **General → Transkript-Kanal** einen eigenen Textkanal wählen und **Archive** aktivieren. Der Kanal muss zum selben Server gehören und sich vom Log-Kanal unterscheiden. Der Bot braucht Kanalansicht, Nachrichtenverlauf, Nachrichten senden, Links einbetten und Dateien anhängen.

Beim Schließen wird dort eine HTML-Datei zusammen mit Ticketnummer, Kategorie, Ersteller, Abschlusszeit, schließender Person und gegebenenfalls Grund abgelegt. Das gilt auch für bestätigte und automatische Schließungen. Der Log-Kanal erhält weiterhin Abschlusslogs, aber keine Transkript-Datei und keinen Transkript-Button. Der bisherige manuelle Download einschließlich seiner Zugriffsprüfungen und der Download-Button in der Abschluss-Direktnachricht bleiben erhalten. Die optionale Sicherung von Anhängen und Offline-ZIPs ist unter [HTML-Transkripte und Google Drive](html-transcripts-and-drive.md) beschrieben.

Ohne Transkript-Kanal oder bei deaktivierter Archivierung entsteht kein automatischer Versandauftrag. `OVERRIDE_ARCHIVE=false` deaktiviert die automatische Ablage ebenfalls. Es gibt keinen Rückfall auf den Log-Kanal und keinen nachträglichen automatischen Versand bereits geschlossener Tickets.

Versandaufträge liegen dauerhaft am Ticket. Der Bot versucht die Zustellung direkt nach dem Abschluss. Bei einem Fehler werden weitere Versuche nach 1, dann 5 und anschließend jeweils 15 Minuten geplant. Die Warteschlange wird beim Start und jede Minute geprüft. Ein Neustart verliert ausstehende Aufträge nicht. Die gespeicherte Nachrichten-ID verhindert erneuten Versand; bei einem Absturz unmittelbar nach dem Senden wird zusätzlich nach der Ticket-ID an einer kürzlich gesendeten Transkript-Nachricht gesucht.

Ein Zustellfehler verhindert den Ticketabschluss nicht. Die Archivdaten bleiben für den manuellen Download erhalten. Ausstehende Aufträge verwenden beim nächsten Versuch den aktuell eingestellten Transkript-Kanal.

## Feedback ansehen

**Feedback** in der Serververwaltung zeigt Bewertungen und Kommentare direkt, mit Ticketnummer, Kategorie und Datum. Die Übersicht ist nur für Serveradministratoren zugänglich und zeigt jeweils 25 Einträge. Ein nicht entschlüsselbarer Kommentar wird gekennzeichnet, ohne die übrigen Bewertungen auszublenden. Der Download oder die Veröffentlichung von Feedback ist damit nicht verbunden.

## Entwicklung und Prüfung

Portal erneut bauen: `npm --prefix portal ci --ignore-scripts`, danach `npm run portal:build`. Quellcode und `portal/build` gemeinsam committen. Die Herkunft des Portals steht in `portal/UPSTREAM.md`.

`npm test` prüft die Textauflösung, Validierung, Commands, Close-Logik und Transkript-Zustellung mit simulierten Discord-Antworten. Mit `TEST_DATABASE_URL` auf eine separat migrierte SQLite-Testdatenbank laufen zusätzlich die API-, Migrations- und Neustarttests. Die Testdatenbank darf keine Produktionsdaten enthalten.

Für dieses Update wurden außerdem Speichern, Neuladen, Kategorie-Isolation, Zurücksetzen, Platzhalter-Vorschau und die Transkript-Kanalauswahl im gebauten Portal mit einer lokalen Test-API geprüft. Die SQLite-Migration wurde ausgeführt; MySQL- und PostgreSQL-Schemas wurden validiert. Live-Discord und produktive MySQL-/PostgreSQL-Datenbanken waren nicht Teil dieser lokalen Prüfung.
