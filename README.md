# Spielstand

Mini-Game-App (GameApp) als Web-App (PWA): Dart (X01/Cricket), Wizard, Phase 10, Kniffel, Skip-Bo, Rommé und ein freier Zähler.
Läuft nach dem ersten Öffnen komplett offline. Alle Spielstände bleiben auf dem Gerät gespeichert.

## Lokal starten
    python3 -m http.server 8765
Dann http://localhost:8765 öffnen.

## Aufs Handy bringen
Die App muss einmal über HTTPS geladen werden (z. B. GitHub Pages oder Netlify). Danach in Safari auf
„Teilen → Zum Home-Bildschirm“ tippen. Ab dann startet sie wie eine normale App, auch ohne Internet.

## Nach Änderungen
In `sw.js` die `VERSION` erhöhen, sonst behalten installierte Geräte die alte Fassung im Cache.

## Neues Spiel hinzufügen
Neue Datei in `js/games/` nach dem Muster der vorhandenen Spiele anlegen, in `js/games/index.js` eintragen
und in `sw.js` zur `ASSETS`-Liste hinzufügen.

## Planer (Aufgaben & Deadlines)
Im Ordner `planer/` liegt eine eigene Offline-App zum Planen von Aufgaben:
- **Heute**: Liste oder **Zeitplan** (Termine und Aufgaben-Zeitblöcke auf einer Zeitachse; ⚡ legt Aufgaben automatisch in freie Lücken). Dazu Überfälliges, was heute ansteht, Leute zum Nachfassen und was bald fällig, aber noch nicht eingeplant ist. Dazu eine Warnung, wenn mehr geplant ist als die Tageskapazität.
- **Woche**: Wochenplan (KW) mit Auslastungsbalken pro Tag, Deadlines als Markierung und ein Pool „Noch nicht eingeplant“.
- **Alle**: Liste mit Suche und Filtern oder Eisenhower-Matrix (wichtig/dringend).
- **Warten**: Delegiertes und Dinge, auf die du wartest, gruppiert nach Person, mit Nachfass-Datum.
- **Kalender**: Eigene Termine (auch wiederkehrend) sowie Import aus dem iPhone-Kalender per Kurzbefehl oder als .ics-Datei (Outlook, Google, Mac). Termine verringern die freie Zeit pro Tag, ganztägige Termine wie „Urlaub“ blockieren den Tag. Export als .ics mit Deadlines, Zeitblöcken und eigenen Terminen.
- **Mehr**: Wochenrückblick, Vorlagen mit Rückwärtsplanung, Projekte, Einstellungen, Kalender und Backup.

Jede Aufgabe hat eine **Deadline** (bis wann fertig) und einen **Plan-Tag** (wann du daran arbeitest).
Dazu kommen Priorität, geschätzter Aufwand, Fokus-Timer mit erfasster Zeit, Teilschritte, Notizen und Wiederholung.

**Vorlagen**: Pro Zeile ein Schritt, z. B. `T-5 Daten aktualisieren ~2h` (5 Tage vor der Deadline). Schritte am Wochenende werden auf den Freitag davor gelegt.

**Schnelleingabe**: `bis fr` / `bis 15.12. 10:00` setzt die Deadline, `@mo` den Plan-Tag, `~2h` den Aufwand,
`#Projekt` das Projekt, `!` heißt wichtig, `!!` dringend.

### Sync & Claude (Supabase)
Mit Konto (Mehr → Sync & Claude) sind die Daten auf allen Geräten gleich, und Claude-Agenten können Aufgaben und Termine über den Supabase-Connector verwalten (Anleitung: `planer/CLAUDE-AGENT.md`).
- Datenbank-Schema: `supabase/migrations/`, Kalender-Abo-Dienst: `supabase/functions/planer-ics/`
- Verbindung: `planer/config.js` (Projekt-URL und Publishable-Key). Leer = rein lokal.
- Kalender-Abo: In der App einen geheimen Link erzeugen und im Kalender abonnieren. Der Inhalt wird bei jeder Aktualisierung ersetzt, dadurch entstehen keine Dubletten.

Lokal: `python3 -m http.server 8765` und dann http://localhost:8765/planer/ öffnen.
Nach Änderungen in `planer/sw.js` die `VERSION` erhöhen.
