# Schließen und Löschen

Das Team schließt ein Ticket mit dem Schließen-Button oder `/close`. Der Ersteller
und weitere Teilnehmer verlieren den Kanalzugriff. Die bisherige individuelle
Zuweisung und der Zugriff des Teams bleiben erhalten; Teammitglieder können weiter
schreiben und Commands ausführen. Der Übersichtseintrag verschwindet. Nachrichten
und erreichbare Dateien werden gesichert, HTML und Drive-ZIP wie bisher erstellt.

Der Kanal wird nicht automatisch gelöscht. Die Abschlussnachricht enthält
„Löschen“ und bei aktivierter Archivierung „Transkript“. `/delete` ist die alternative
Aktion für den aktuellen Kanal. Nur zuständige Kategorie-Supporter und Administratoren
dürfen löschen. Ein offenes Ticket muss zuerst geschlossen werden.

`/faq-analyze`, Transkript-Download, Anheften und Tags bleiben im geschlossenen Kanal
verwendbar. Das Team kann Namen und Priorität weiter ändern. Änderungen am
Teilnehmerzugriff, Zuweisungen, Kategorie-Wechsel und `/transfer` benötigen ein
offenes Ticket. Die Archivkopie enthält den Support-Verlauf bis zum Schließzeitpunkt,
keine danach gesendeten Teamnachrichten.

Schließanfragen des Erstellers inklusive Feedback und Bestätigung bleiben erhalten.
Bestätigte, erzwungene und automatische Schließungen benutzen denselben Ablauf.
Die Schließfrist schließt das Ticket, sie löscht den Kanal nicht.

Löschen wartet auf die abgeschlossene Nachrichtensicherung und lokal gesicherte
Drive-Dateien. Der Drive-Upload darf danach im Hintergrund weiterlaufen. Bei
Sicherungs- oder Discord-Fehlern bleibt der Kanal bestehen, mit dauerhaft gespeichertem
Auftrag und Wiederholungen nach einem Neustart. Bereits als verloren markierte Dateien
blockieren nicht dauerhaft; das Archiv kennzeichnet die fehlenden Dateien.

Die Migrationen für SQLite, MySQL und PostgreSQL trennen Schließ- und Löschaufträge.
Alte, noch ausstehende automatische Kanallöschungen werden in erhaltene geschlossene
Kanäle umgewandelt. Bereits entfernte Kanäle werden nicht neu erstellt.

Neue Buttonbeschriftungen und Meldungen sind unter „Texte“ anpassbar, mit der
Auflösung Kategorie → Server → Standard. Die Webseite braucht keinen neuen Build;
der vorhandene Texteditor liest den Textkatalog des aktualisierten Bots.
