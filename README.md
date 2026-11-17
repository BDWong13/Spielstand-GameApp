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
Im Ordner `planer/` liegt eine eigene kleine Offline-App zum Planen von Aufgaben:
- **Heute**: Überfälliges, was heute fällig oder eingeplant ist, und was bald fällig, aber noch nicht eingeplant ist.
- **Woche**: Wochenplan (KW) mit Aufwand pro Tag, Deadlines als Markierung und ein Pool „Noch nicht eingeplant“.
- **Alle**: Suche, Filter nach Projekt und Status, gruppiert nach Deadline.
- **Projekte**: Fortschritt pro Projekt sowie Backup als Export und Import (JSON).

Jede Aufgabe hat eine **Deadline** (bis wann fertig) und einen **Plan-Tag** (wann du daran arbeitest).
Dazu kommen Priorität, geschätzter Aufwand, Teilschritte, Notizen und Wiederholung (täglich, wöchentlich, monatlich).
Schnelleingabe: `#Projekt` ordnet die Aufgabe zu, `!` steht für wichtig, `!!` für dringend.

Lokal: `python3 -m http.server 8765` und dann http://localhost:8765/planer/ öffnen.
Nach Änderungen in `planer/sw.js` die `VERSION` erhöhen.
