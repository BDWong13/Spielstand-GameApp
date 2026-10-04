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
