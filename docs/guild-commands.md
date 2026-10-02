# Commands pro Discord-Server

Commands werden als Guild-Commands direkt im jeweiligen Server registriert. Die Registrierung beim Start wird abgewartet, bevor Command-Links verwendet werden.

```env
PUBLISH_COMMANDS=true
GUILD_ID=DEINE_DISCORD_SERVER_ID
```

GUILD_ID ist optional. Ohne GUILD_ID registriert der Bot die Commands einzeln in allen verbundenen Servern. Die ID muss eine numerische Discord-Server-ID sein, kein Servername und keine Kanal-ID.

PUBLISH_COMMANDS=false deaktiviert weiterhin die automatische Registrierung. Ohne diese Variable ist sie standardmäßig aktiv. Bestehende Installationen mit false müssen sie auf true ändern.

Manuell in der Bot-Konsole: commands publish oder commands publish SERVER_ID.

Alte globale Commands werden erst entfernt, wenn die Registrierung in allen verbundenen Servern erfolgreich war. Bei einem Fehler bleiben sie erhalten. Fehlerprotokolle nennen die betroffene Guild-ID. Der Bot muss Mitglied des Servers sein und mit dem applications.commands-Scope autorisiert sein.
