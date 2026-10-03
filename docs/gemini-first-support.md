# Gemini-Erstsupport einrichten

Neue Tickets können bis zu drei Antworten von Gemini erhalten. Die Reihenfolge ist:
kostenloses Kontingent → begrenzter bezahlter Zugang mit deinem Abo-Guthaben →
menschlicher Support. Der kostenlose Zugang wird nach einer Kontingent-Sperre wieder
versucht; bestehende, an Menschen übergebene Tickets bleiben beim Team.

## Google vorbereiten

1. In [Google AI Studio](https://aistudio.google.com/api-keys) zwei **separate Projekte**
   mit je einem API-Schlüssel anlegen. Zwei Schlüssel desselben Projekts reichen nicht.
2. Das kostenlose Projekt darf **keine verknüpfte Abrechnung** haben. Es darf später
   nicht versehentlich auf einen bezahlten Tarif umgestellt werden.
3. Das zweite Projekt ausschließlich für diesen Bot verwenden. Google-AI-Pro-Guthaben
   im [Google Developer Program](https://developers.google.com/profile/help/benefits)
   auf das zugehörige Abrechnungskonto einlösen. Bei der Einlösung **„Always use this
   billing account“** aktivieren, damit wiederkehrendes Guthaben automatisch dort landet.
   Auch das Abrechnungskonto darf nicht durch andere Anwendungen/Cloud-Dienste
   das für den Bot vorgesehene Guthaben verbrauchen.
4. In AI Studio prüfen, dass das bezahlte Projekt korrekt verbunden ist und die
   Gutschrift verfügbar ist. Das Pro-Abo enthält **10 US-Dollar**, nicht 10 Euro.
   Bei Prepay verlangt Google unter Umständen zuerst eine zusätzliche Vorauszahlung.
   Diese Einrichtung nimmt der Bot nicht selbst vor.
5. Als zusätzlichen Schutz einen niedrigen Projekt-Ausgabenrahmen bei Google setzen
   und automatische Guthabenaufladung deaktivieren. Googles Ausgabenanzeige und
   Ausgabenrahmen können verzögert reagieren.

## Private Konfigurationsdatei

Die Vorlage [gemini-support.example.json](./gemini-support.example.json) kopieren,
die beiden Schlüssel dort eintragen und die Datei auf dem Botserver unter
**`user/gemini-support.json`** speichern. In AMP ist das der Unterordner `user`
neben `src`, `db`, `node_modules` und `.env` im Bot-Verzeichnis.
Alternativ verweist `GEMINI_SUPPORT_CONFIG` in der Umgebung auf einen anderen
geschützten Dateipfad. Der Bot liest die Datei bei jeder Anfrage neu.

- `freeProjectHasNoBilling`: erst auf `true` setzen, wenn das kostenlose Projekt
  tatsächlich ohne Abrechnung eingerichtet ist.
- `paidCreditConfirmed`: nur auf `true` setzen, wenn das Abo-Guthaben eingelöst und
  verfügbar ist. Bei gekündigtem Abo oder fehlender Gutschrift wieder deaktivieren.
- `paidProjectOnlyForThisBot`: bestätigt die ausschließliche Nutzung des bezahlten
  Projekts und des dafür reservierten Guthabens durch diesen Bot.
- `recurringCreditsAppliedAutomatically`: bestätigt die automatische Zuweisung
  zukünftiger monatlicher Gutschriften auf dieses Abrechnungskonto.
- `monthlyUsd`: maximal **9,50 USD**, standardmäßig 9,50. Die übrigen 0,50 USD sind
  Sicherheitsreserve. Niedrigere Beträge sind möglich; 0 schaltet den bezahlten Zugang aus.
- `creditRenewalDay`: Tag des neuen Budgetzeitraums in UTC (1–31). Einen Termin
  **nach** der monatlichen Gutschrift wählen, nicht vorher. In kürzeren Monaten wird
  der Tag auf den letzten Monatstag begrenzt.

Fehlt eine Bestätigung, ein anderer bezahlter Schlüssel oder eine gültige Grenze,
bleibt der bezahlte Zugang aus. Der kostenlose Zugang funktioniert unabhängig davon.
Schlüssel gehören nicht in Discord, in FAQ-Texte, GitHub oder Screenshots. Die
Konfigurationsdatei im `user`-Verzeichnis wird nicht ins Repository aufgenommen.
Die Drive-Anmeldedatei ist ein anderer Zugang und wird hierfür nicht verändert.

## Webseite

Nach dem normalen Bot-Update und Neustart:

1. Unter **General → KI-Erstsupport mit Gemini** den Zugang prüfen und die KI aktivieren.
2. Eigene FAQ, Regeln, Zuständigkeiten und hilfreiche Links eintragen; speichern.
3. In jeder Support-Kategorie die KI erlauben oder ausschalten. Eigene Kategorie-FAQ
   ersetzen die Server-FAQ; ein leeres Feld übernimmt die Server-FAQ.
   Unter **Antwortsprache der KI** Deutsch, Englisch oder automatisch auswählen.
   Automatisch verwendet die erste Textnachricht des Ticket-Erstellers beziehungsweise
   dessen zuvor eingegebenes Ticketthema. Die Sprache bleibt für dieses Ticket
   gespeichert, auch nach weiteren Nachrichten, Kategorieänderungen oder Neustarts.
4. Unter **Texte** Button „Supporter anfordern“ und KI-Hinweise anpassen. Auch hier gilt
   Kategorie → Server → Standard. Bestehende Nachrichten werden nicht umgeschrieben.

Ohne Supportwissen oder bei einer nicht daraus beantwortbaren Frage übernimmt ein
Mensch. Die KI antwortet in der gespeicherten Ticketsprache, bezeichnet sich als KI
und kann über den Button beendet werden. Eine Antwort/öffentliche Tag-Antwort oder
Ticketaktion des Teams sowie eine Schließanfrage beendet die KI-Hilfe dauerhaft.
Dateien werden nicht von der KI analysiert; reine Datei-Anfragen gehen zum Team.
Schließen, Priorität, Rollen oder sonstige Ticketaktionen kann die KI nicht ausführen.

## FAQ aus einem Ticket lernen

Zuständige Kategorie-Supporter und Administratoren können **`/faq-analyze`** im
Ticket ausführen. Mit **`/faq-analyze ticket:NUMMER`** ist auch die Analyse eines
anderen Tickets dieses Servers möglich, einschließlich geschlossener Tickets mit
vorhandenen Archivdaten. Die Rückmeldung in Discord sieht nur die ausführende Person.

Die KI erstellt höchstens fünf Vorschläge aus bestätigten menschlichen
Support-Antworten. Botnachrichten, ungelöste Fragen und individuelle Accountfälle
sollen nicht übernommen werden. Personenbezogene Angaben und Zugangsdaten werden
vor der Anfrage soweit erkennbar entfernt. Links auf die zugrunde liegenden
Support-Antworten helfen bei der Prüfung; bei gelöschten Kanälen das Transkript nutzen.

Auf der Webseite unter **FAQ aus Tickets** Vorschläge prüfen, bearbeiten und mit
**In FAQ übernehmen** freigeben oder verwerfen. Dort sind auch freigegebene FAQ,
Suchfunktion, letzte Analysen und das manuell hinterlegte Supportwissen sichtbar.
Ein Eintrag gilt für seine Kategorie oder nach Umstellung für den gesamten Server.
Nur freigegebene Einträge ergänzen unmittelbar das bisherige Supportwissen; Entwürfe
und verworfene Einträge werden von der antwortenden KI nicht verwendet.
Wiederholte Analysen überschreiben keine bereits vorhandenen Einträge.

Die Analyse teilt sich kostenlose und bezahlte Kontingente sowie das gespeicherte
Kostenlimit mit dem Erstsupport. Ist kein Kontingent verfügbar, bleibt sie mit
Fehlermeldung stehen. Lange Verläufe werden begrenzt ausgewertet: höchstens die
neuesten 500 Nachrichten, bis zu 4.000 Zeichen pro Nachricht und rund 56 KB Kontext.
Die Webseite und die Command-Rückmeldung kennzeichnen einen unvollständigen Ausschnitt.
Nach einem Neustart werden noch nicht begonnene Analysen fortgesetzt. Eine unklar
abgebrochene Google-Anfrage wird nicht automatisch erneut gestartet; das Team kann
den Command bei Bedarf erneut ausführen.

## Kosten und Zustellung

Die Anzeige auf der Webseite zeigt **die vom Bot erfasste Nutzung**, keinen Live-Stand
deines Google-Guthabens. Gemini liefert keinen Guthabenstand zusammen mit Antworten.
Ein Bot kann deshalb nicht garantieren, dass Google ausschließlich Abo-Guthaben
abbucht: falsche Projekte, andere Cloud-Nutzung, fehlende Gutschriften oder Änderungen
der Google-Tarife müssen bei der Einrichtung und Verwaltung berücksichtigt werden.

Der Bot reserviert vor jeder bezahlten Anfrage einen großzügigen maximalen Betrag
und verrechnet danach gemeldete Eingabe-, Ausgabe- und Denk-Token. Reservierungen
und Nutzung gelten über alle Discord-Server gemeinsam und überstehen Neustarts.
Ein Schlüsselwechsel setzt sie nicht zurück; ein geänderter Erneuerungstag eröffnet
kein überlappendes Budget. Ohne Platz für die nächste Reservierung wird keine
bezahlte Anfrage mehr gestartet. Unklare Timeouts und abgebrochene Anfragen bleiben
vorsorglich reserviert und werden nicht erneut berechnet.

Kostenloses HTTP 429 löst den Wechsel aus; kurzfristige Sperren berücksichtigen
Retry-Hinweise, Tageslimits werden konservativ 24 Stunden gesperrt. Authentifizierungs-,
Inhalts-, Sicherheits- oder Netzwerkfehler führen direkt zum Team. Es werden keine
kostenpflichtigen Suchwerkzeuge, Datei-Uploads oder zusätzliche Modelle verwendet.
Das Modell und die Standardpreise sind gemeinsam festgelegt: `gemini-3.5-flash-lite`,
0,30 USD pro Million Eingabetoken und 2,50 USD pro Million Ausgabetoken
einschließlich Denken (geprüft am 03.10.2026). Bei Modell-/Tarifänderungen ist ein
Bot-Update nötig. Dies ist eine lokale Kostenbegrenzung, kein Google-Billingvertrag.

Aufgaben und ausstehende Zustellungen liegen in der Datenbank. Verschlüsselte
Antworten werden nach erfolgreicher Zustellung aus der Arbeitswarteschlange entfernt;
die normale Transkript-Archivierung bleibt aktiv. Vor der Zustellung prüft der Bot
Ticketzustand, Teamübernahme und neue Nachrichten erneut. Nach einem Neustart wird
eine fertige Antwort zugestellt; eine unklar abgebrochene Generierung geht an Menschen.
Bei Zustellfehlern wird die gespeicherte Antwort erneut zugestellt, ohne die KI noch
einmal aufzurufen. Bereits gesendete Nachrichten werden anhand ihrer Antwortreferenz
und ihres Buttons erkannt.

Zur Beantwortung werden Supportwissen, Ticketthema, Formularantworten und begrenzter
Chatkontext an Google übertragen. Passwörter und Zugangsdaten gehören nicht in diese
Felder. Die Verarbeitung richtet sich nach den Google-Bedingungen des jeweiligen
kostenlosen/bezahlten Zugangs.

## Quellen

- [Google AI Pro: monatliche Cloud-Gutschriften](https://blog.google/innovation-and-ai/technology/developers-tools/gdp-premium-ai-pro-ultra/)
- [Wiederkehrende Gutschriften automatisch zuweisen](https://developers.google.com/profile/help/benefits)
- [Gemini-Abrechnung, separate Projekte und verzögerte Grenzen](https://ai.google.dev/gemini-api/docs/billing)
- [Aktuelle Modellpreise](https://ai.google.dev/gemini-api/docs/pricing)
- [Modellverfügbarkeit für neue Projekte](https://ai.google.dev/gemini-api/docs/deprecations)
