# Commands pro Discord-Server

Commands werden als Guild-Commands direkt im jeweiligen Server registriert. Die Registrierung beim Start wird abgewartet, bevor Command-Links verwendet werden. Jeder Command wird einzeln angelegt oder gezielt anhand seiner ID aktualisiert; die gesamte Liste wird nicht mehr ersetzt. Commands anderer Programme mit demselben Discord-Botkonto bleiben erhalten.

```env
PUBLISH_COMMANDS=true
GUILD_ID=DEINE_DISCORD_SERVER_ID
```

GUILD_ID ist optional. Ohne GUILD_ID registriert der Bot die Commands einzeln in allen verbundenen Servern. Die ID muss eine numerische Discord-Server-ID sein, kein Servername und keine Kanal-ID.

PUBLISH_COMMANDS=false deaktiviert weiterhin die automatische Registrierung. Ohne diese Variable ist sie standardmäßig aktiv. Bestehende Installationen mit false müssen sie auf true ändern.

Manuell in der Bot-Konsole: commands publish oder commands publish SERVER_ID.

Die globale Command-Liste wird weder geleert noch automatisch bereinigt. Das schützt globale Commands anderer Programme, die dasselbe Botkonto nutzen. Alte globale Ticket-Commands bleiben gegebenenfalls registriert; Guild-Commands und ihre passenden IDs werden für Ticket-Links bevorzugt. Die Hilfe und Ticket-Links verwenden ausschließlich passende Ticket-Commands, nicht die sonstigen Commands des gemeinsamen Kontos.

Der Bot speichert die IDs und den zuletzt registrierten Definitionsstand seiner Guild-Commands in `user/command-registrations-APPLICATION_ID.json`. Diese Datei wird nicht auf GitHub veröffentlicht und muss bei Bot-Updates und Umzügen erhalten bleiben. Unveränderte Commands benötigen beim Neustart keinen Schreibzugriff auf die Discord-API. Vorhandene Commands mit identischer Definition werden beim ersten Start übernommen. Anschließende Änderungen sind möglich, solange die gespeicherte ID und der bisherige Definitionsstand noch mit Discord übereinstimmen.

Bei einem abweichenden Command mit demselben Namen und Typ, einer fremden Änderung oder einer fremden Ersatz-ID wird `COMMAND_CONFLICT` protokolliert und der betreffende Command erhalten. Andere konfliktfreie Commands werden weiter registriert. Fehlerprotokolle nennen Guild-ID, Typ und Namen. Vor der ersten Discord-Änderung werden Lesbarkeit, Gültigkeit und Schreibzugriff auf die lokale Registrierungsdatei geprüft.

Zwei Programme desselben Kontos können im selben Server keinen gleichnamigen Command desselben Typs mit unterschiedlichen Funktionen registrieren. Dafür unterschiedliche Namen verwenden. Eine andere laufende Version, die weiterhin vollständige Listen ersetzt, kann Commands noch löschen; auch dort die vollständigen Überschreibungen und das pauschale Leeren globaler Commands entfernen. Beide Programme empfangen außerdem die Interaktionen des gemeinsamen Kontos und müssen fremde Commands ignorieren. Siehe [Discords Regeln für Command-Namen und Registrierung](https://docs.discord.com/developers/interactions/application-commands#registering-a-command).

Der Bot muss Mitglied des Servers sein und mit dem `applications.commands`-Scope autorisiert sein. Für diesen Fix sind weder neue Umgebungsvariablen noch eine Datenbankmigration nötig.
