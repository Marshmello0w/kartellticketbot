# Komfortfunktionen in Discord

Nach dem normalen Bot-Update wird die neue Datenbankmigration beim Start angewendet und der Prisma-Client neu erzeugt. Portal-Quellcode und fertiger Build sind enthalten; ein zusätzlicher Web-Build auf dem Bot-Server ist nicht erforderlich.

## Einrichtung

Unter **General → Ticket-Übersichtskanal** einen internen Textkanal auswählen. Er muss zu diesem Server gehören, vor `@everyone` geschützt sein und sich vom Log- und Transkript-Kanal unterscheiden. Der Bot benötigt Kanalzugriff, Nachrichtenverlauf, Senden und Embeds. Die Webseite verändert keine Discord-Berechtigungen.

**Automatischer Antwortstatus** ist standardmäßig eingeschaltet und funktioniert auch ohne Übersichtskanal. Der Bot ergänzt nach fünf Minuten seit der letzten relevanten Nachricht 🛠️ für „Support muss antworten“ oder 👤 für „Nutzer muss antworten“. Eine weitere Nachricht startet diese Frist erneut und entfernt das Warte-Emoji. Ein vorhandenes Prioritäts-Emoji bleibt vor dem Warte-Emoji stehen.

Pro offenem Ticket erscheint eine Übersicht mit Kategorie, Nummer, Ersteller, Supporter, Priorität, Antwortstatus und Ticket-Link. Ticketinhalte werden nicht kopiert und Aktualisierungen lösen keine Erwähnungen aus. Eine Schließanfrage zeigt zusätzlich ihren gespeicherten Abschlusszeitpunkt. Bei deaktivierter automatischer Schließung bleibt diese Frist verborgen. Erst der tatsächliche Abschluss löscht den Eintrag.

Die angepinnte Eröffnungsnachricht enthält **Support-Aktionen**. Berechtigte Kategorie-Supporter und Administratoren erhalten ein privates Menü für Übernahme, Freigabe, Supporter-Übergabe, Priorität und Kategorie-Wechsel. Eine Übergabe ändert den zuständigen Supporter; `/transfer` ändert weiterhin den Ticket-Ersteller. Bereits vergebene Tickets lassen sich nicht durch erneutes Übernehmen stehlen. Andere Kategorie-Supporter verlieren wie bisher den Zugriff bei einer Übernahme.

Unter **Texte** können Server- und Kategorie-Texte für die Übersicht, Schließfrist und das Aktionsmenü angepasst werden. Die Auflösung lautet Kategorie → Server → Standard. Vorhandene Button-Beschriftungen behalten ihre ursprünglichen Texte; neu gesendete Buttons und Dialoge verwenden die neuen Einstellungen.

## Abgleich und Fehlerbehandlung

Ereignisse bündeln Aktualisierungen je Ticket; zusätzlich erfolgt alle 30 Sekunden ein Abgleich. Discord.js berücksichtigt die von Discord gelieferten API-Limits. Deshalb kann die Kanalumbenennung später als nach genau fünf Minuten sichtbar werden. Umbenennungen blockieren weder Übersichtsnachrichten noch den Abschluss eines Tickets.

Offene Tickets laden beim Start die neueste relevante menschliche Nachricht nach. Anhänge zählen ebenfalls; Bot-, Webhook- und Systemmeldungen, Bearbeitungen und Reaktionen ändern den Antwortstatus nicht. Öffentliche `/tag`-Antworten zählen für die auslösende Person, private Antworten nicht.

Fehlgeschlagene Übersicht-Aktualisierungen und Löschungen behalten ihre Datenbankzuordnung und werden nach 1, 5 und anschließend jeweils 15 Minuten erneut versucht. Ein Neustart gleicht sie direkt ab. Manuell gelöschte Einträge offener Tickets werden wiederhergestellt. Eine Suche im Übersichtskanal beim Start und anschließend alle zehn Minuten findet doppelte oder vor einem Absturz noch nicht gespeicherte Einträge. Geschlossene Tickets erhalten keine neuen Einträge.

## Prüfung

Die automatisierten Tests verwenden eine isolierte SQLite-Datenbank und simulierte Discord-Kanäle, Nachrichten und Berechtigungen. Sie prüfen Kategorie-Texte, beide Warterichtungen, Anhänge, öffentliche/private Tags, Schließfristen, Übernahme-Rennen, Übergaben, Kategorie-Wechsel, Neustarts, Wiederherstellung, Fehler und alle Schließwege. MySQL- und PostgreSQL-Schemas werden validiert; deren Migrationen müssen beim Update auf dem jeweiligen Zielsystem angewendet werden.

Die lokale Portal-Vorschau wurde mit dem fertigen Build und den echten Einstellungs-Endpunkten geprüft: auswählen, speichern, neu laden, Status ein-/ausschalten und einen Kategorie-Text für einen neuen Bot-Dialog verwenden. Ein Live-Test im Discord-Server benötigt den laufenden Bot und die tatsächlichen Kanalberechtigungen.
