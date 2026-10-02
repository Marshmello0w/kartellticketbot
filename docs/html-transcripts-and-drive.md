# HTML-Transkripte und privates Google-Drive-Archiv

Nach dem normalen Bot-Update werden die neuen Datenbankmigrationen beim Installieren angewendet. Der fertige Portal-Build liegt im Repository; auf dem Bot-Host ist kein Frontend-Build nötig.

## Ohne Google Drive

Automatische Transkripte im separaten Transkript-Kanal und manuelle Downloads verwenden jetzt HTML. Auch eine bestehende Standardkonfiguration mit `transcript.md` wird automatisch auf HTML umgestellt. Eigene, ausdrücklich konfigurierte andere Vorlagen bleiben erhalten.

Die Datei zeigt den Verlauf im dunklen Discord-Stil mit Namen, Rollenfarben, Avataren, Antworten, Markdown, Embeds und sichtbaren, inaktiven Buttons beziehungsweise Menüs. Fragen, Ticketdaten und vorhandenes Feedback stehen darüber. Externe Medien werden verlinkt. Discord-Dateien und Avatare können in dieser einzelnen HTML-Datei noch von den Discord-URLs abhängen.

## Google einmalig verbinden

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt für das Ticketarchiv erstellen und die **Google Drive API** aktivieren.
2. Unter **Google Auth Platform** die App einrichten, bei einem privaten normalen Google-Konto mit externer Zielgruppe. Als Zugriff ausschließlich `https://www.googleapis.com/auth/drive.file` verwenden. Das ist der von Google empfohlene begrenzte Zugriff auf vom Programm erstellte oder ausdrücklich bereitgestellte Dateien; kein Zugriff auf das gesamte Drive wird angefordert. Siehe [Drive-Berechtigungen](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
3. Unter **Branding** die Konfiguration vervollständigen und speichern: App-Name, Nutzersupport-E-Mail und Entwicklerkontakt sowie die Links zur App-Startseite, Datenschutzerklärung und Nutzungsbedingungen. Google verlangt diese Links für externe Apps in Produktion. Die Startseite muss öffentlich erreichbar sein, die Funktion der App erklären und auf die Datenschutzinformationen verweisen. Die Links gehören auf eine eigene Domain; diese unter **Autorisierte Domains** eintragen und bei erforderlicher Überprüfung über die Google Search Console bestätigen. Die Bot-Verwaltungsoberfläche und die Archive können weiterhin privat bleiben. Siehe [Google-Branding-Anforderungen](https://support.google.com/cloud/answer/15549049?hl=en) und [öffentliche App-Startseite](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance#host-a-home-page-for-production-apps).
4. Einen OAuth-Client vom Typ **Desktop-App** erstellen und seine JSON-Datei herunterladen. Zum Beispiel als `desktop-oauth.json` außerhalb des Repositorys ablegen.
5. Unter **Zielgruppe** auf **App veröffentlichen** klicken, bis der Veröffentlichungsstatus **In Produktion** lautet. Ist der Button gesperrt und verweist auf Branding, zuerst Schritt 3 abschließen. Im externen Testmodus dürfen sich nur eingetragene Testnutzer anmelden; andernfalls erscheint `403: access_denied`. Auch mit eingetragenem Testnutzer laufen Refresh-Tokens für diesen Zugriff nach sieben Tagen ab. Deshalb die folgende Anmeldung für die dauerhafte Verbindung erst im Produktionsstatus durchführen. Produktion ist keine Garantie für unbegrenzte Token-Gültigkeit: Widerruf und andere Google-Regeln gelten weiterhin. Siehe [Google-Zielgruppe und Testmodus](https://support.google.com/cloud/answer/15549945?hl=en). Eventuell angezeigte Prüfanforderungen von Google im eigenen Cloud-Projekt beachten.
6. Auf deinem PC mit Node.js 18 oder neuer das mitgelieferte `scripts/connect-google-drive.js` ausführen:

```powershell
node scripts/connect-google-drive.js --client "C:/privat/desktop-oauth.json" --output "C:/privat/google-drive.json"
```

Das Programm öffnet die Google-Anmeldung im Browser. Melde dich mit deinem eigenen Google-Konto an. Die Rückleitung erfolgt ausschließlich an eine vorübergehende Adresse auf `127.0.0.1`; Statusprüfung und PKCE sichern die Anmeldung ab. Das Portal kann seine bestehende HTTP-Adresse behalten. Siehe [Desktop-OAuth](https://developers.google.com/identity/protocols/oauth2/native-app).

Das Programm erstellt den privaten Drive-Ordner **Kartell Ticketarchive**. Es gibt keine Freigabe an das Supportteam und keine öffentlichen Drive-Links. Eine vorhandene Ausgabedatei wird nicht überschrieben.

7. Die erzeugte `google-drive.json` geschützt auf den Bot-Host übertragen, beispielsweise nach `/AMP/node-server/app/user/google-drive.json`. In der Bot-Konfiguration setzen:

```dotenv
GOOGLE_DRIVE_AUTH_FILE=/AMP/node-server/app/user/google-drive.json
```

Nur der Bot-Benutzer soll die Datei lesen können (unter Linux beispielsweise Dateirechte `600`, privates Verzeichnis `700`). Zugangsdaten niemals in GitHub, Discord, Transkripte oder Supportnachrichten kopieren. Das Arbeitsverzeichnis `user/drive-spool` ebenfalls nicht öffentlich über einen Webserver anbieten; der Bot legt es mit privaten Dateirechten an.

8. Bot neu starten, im Portal **General → Google-Drive-Archiv** den Verbindungsstatus prüfen und die Archivierung aktivieren. **Archive** muss eingeschaltet sein. Ein Transkript-Kanal wird unabhängig davon ausgewählt. Danach gelten Änderungen am Schalter sofort, ohne Neustart.

Bei einer widerrufenen Anmeldung das Programm erneut ausführen, in eine neue Ausgabedatei schreiben und die Zugangsdaten auf dem Bot-Host ersetzen. Derselbe OAuth-Client muss beibehalten werden, damit bereits erstellte App-Dateien weiterhin zugänglich bleiben. Für denselben Archivordner die bisherige `rootFolderId` in der neuen privaten Konfigurationsdatei beibehalten; der vom neuen Einrichtungsdurchlauf zusätzlich erzeugte leere Ordner wird dann nicht verwendet. Einen bestehenden Archivordner weder verschieben noch freigeben. Ein neuer Wurzelordner ist kein automatischer Umzug alter Archive.

## Ablauf und Downloads

Anhänge, Discord-Avatare und benutzerdefinierte Emojis werden bei Eingang einer archivierten Nachricht in eine dauerhafte Warteschlange eingetragen, lokal zwischengespeichert und mit höchstens zwei gleichzeitigen Datei-Aufgaben nach Drive hochgeladen. Große Dateien werden in Abschnitten übertragen; Uploads können nach einem Neustart fortgesetzt werden. Erfolgreich gesicherte lokale Dateikopien werden entfernt.

Beim Start prüft der Bot bestehende offene Tickets auf verpasste Nachrichten und erreichbare Dateien. Schon geschlossene Tickets werden nicht automatisch nacharchiviert. Solange die Discord-Nachricht noch existiert, kann der Bot eine abgelaufene Anhangs-URL erneut abrufen. Bereits endgültig verlorene Dateien erscheinen als nicht verfügbar.

Nach dem Schließen erstellt der Bot im jeweiligen privaten Ticketordner ein ZIP mit `transcript.html`, `files/` und `archive-info.json`. Das ZIP vollständig entpacken und dann `transcript.html` öffnen: Gesicherte Bilder, Avatare, Emojis und Downloads verwenden relative Pfade und funktionieren offline. Externe Webseiten bleiben externe Links. Fehlen gesicherte Dateien, wird das Archiv ausdrücklich als unvollständig gekennzeichnet.

Die Abschlussnachricht enthält zuerst HTML und die Ticketübersicht im Transkript-Kanal. Sobald das ZIP bereitsteht, ergänzt der Bot dieselbe Nachricht. Der Log-Kanal bleibt bei den normalen Ereignislogs. Beim manuellen Download gelten unverändert die bestehenden Ticket-Zugriffsprüfungen.

Ein ZIP wird nur angehängt, wenn es innerhalb des Discord-Dateilimits liegt. Bei Interaktionen wird das von Discord mitgelieferte Limit verwendet, sonst das Serverlimit anhand der Boost-Stufe (20/50/100 MiB). Bei zu großen ZIPs erhält Discord einen Hinweis; das vollständige Archiv bleibt für dich im privaten Drive. Das Supportteam braucht kein Google-Konto. Siehe [Discord-Dateiuploads](https://docs.discord.com/developers/reference#uploading-files).

Upload- und Zustellfehler verhindern den Ticketabschluss nicht. Aufträge, Fortschritt, Fehlercodes und erfolgreiche Nachrichten-IDs bleiben gespeichert. Wiederholungen erfolgen nach einer, fünf und anschließend jeweils fünfzehn Minuten; längere API-Vorgaben werden berücksichtigt. Ein Abgleich alle 30 Sekunden arbeitet die Drive-Aufträge ab. Im Portal zeigt **Status aktualisieren** die Verbindung, ausstehende Dateien und aktuelle Archivierungsfehler.

Der Schalter steuert die Sicherung neuer Nachrichten. Bereits eingetragene Datei-, Abschluss- und Löschaufträge werden weiter bearbeitet, auch nach dem Ausschalten. Dateien dürfen nicht manuell in die Bot-Ticketordner verschoben werden; diese Ordner sind ausschließlich für das automatische Archiv vorgesehen.

## Aufbewahrung

90 Tage nach Ticketabschluss sperrt der Bot neue ZIP-Downloads und löscht seine Drive-Dateien endgültig, einschließlich ZIP, Ticketordner und verbliebener lokaler Kopien. Bei einem Drive-Ausfall werden lokale Kopien bereits entfernt; ausstehende Drive-Löschungen bleiben gespeichert und werden wiederholt. Der Bot muss laufen, um fällige Aufgaben auszuführen; nach einer Offlinezeit werden sie nachgeholt. Schon laufende Downloads dürfen zuerst enden.

Die Löschaufträge bestehen unabhängig von Ticket- und Serverdatensätzen weiter. Nur als eigene Ticketdateien gekennzeichnete Drive-Dateien werden gelöscht; der gemeinsame Wurzelordner bleibt erhalten.

Diese Frist löscht weder archivierte Chatdaten aus der Bot-Datenbank noch bereits heruntergeladene oder in Discord versendete Kopien. Ein HTML-Download bleibt nach Ablauf möglich, solange die Chatdaten noch existieren; gesicherte Dateien sind dann nicht mehr über den Bot verfügbar.

## Entwicklung und Prüfung

`npm test` prüft Renderer, Zugriffsregeln, Queue, OAuth-Rückleitung und API-Adapter. Für die Datenbanktests `TEST_DATABASE_URL` auf eine separat migrierte SQLite-Testdatenbank setzen. Keine Produktionsdaten verwenden. Die Tests simulieren Discord und Google Drive, einschließlich Neustart, Uploadfortschritt, Quotenfehlern, Offline-Nachrichten, unvollständigen Archiven und Löschfehlern. Eine echte Google-Anmeldung und produktive Discord-Zustellung müssen nach der Einrichtung mit einem Testticket geprüft werden.

Portal-Quellcode und `portal/build` gemeinsam verwalten. Build: `npm run portal:build`. SQLite, MySQL und PostgreSQL erhalten jeweils dieselben neuen Einstellungen und unabhängigen Archiv-/Datei-Ledger.
