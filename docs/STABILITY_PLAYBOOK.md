# PhotoPay Stability Playbook

Dieses Playbook fasst die wichtigsten Stabilitäts-Regeln zusammen, die wir aus Flider/PhotoPay gelernt haben.  
Ziel: keine Datenvermischung zwischen Projekten, keine stillen Datenverluste, reproduzierbares Verhalten.

## 1) Single Source of Truth

- Pro Projekt gibt es genau **eine** führende Datenquelle.
- Kein paralleler "Schatten-Status", der unabhängig davon geschrieben wird.
- UI liest den Zustand aus derselben Quelle, in die gespeichert wird.

## 2) Expliziter Kontext bei jedem Write

- Jeder Schreib-Request muss mindestens enthalten:
  - `projectId`
  - `userId`/`ownerId` (wenn multi-user)
- Backend darf nie "raten", welches Projekt gemeint ist.
- Bei Kontext-Mismatch: **`409 Conflict`** zurückgeben, nicht still weiterschreiben.

## 3) Atomare Saves

- Datei-basiert: `tmp -> fsync -> rename` (atomarer Tausch).
- DB-basiert: Transaktion für alle zusammengehörenden Writes.
- Kein Zustand darf "halb geschrieben" sichtbar sein.

## 4) Race-Condition Schutz

- Pro Projekt Save-Queue oder Mutex nutzen.
- Kritische Bereiche:
  - Projekt öffnen
  - Speichern
  - Sync/Import/Export
- Diese Operationen dürfen sich nicht gegenseitig überholen.

## 5) Laden nur nach Kanonisierung

- Beim Öffnen eines Projekts:
  1. Daten lesen
  2. konsistent normalisieren (Duplikate, Artefakte, invalide Referenzen)
  3. erst dann an UI ausliefern
- Nie "rohe" Altlasten direkt rendern.

## 6) Idempotenz als Standard

- Doppelklicks/Retry/Netzwerk-Timeouts dürfen keine Duplikate erzeugen.
- Schreib-Endpoints so bauen, dass wiederholte Requests denselben Endzustand haben.

## 7) Harte API-Verträge

- API-Fehler klar codieren (z. B. `VALIDATION_ERROR`, `CONTEXT_MISMATCH`, `NOT_FOUND`).
- Frontend darf bei Konflikt nicht stillschweigend weitermachen.
- Jede Save-Antwort enthält den relevanten Projektkontext (mind. `projectId`).

## 8) Minimales Observability-Set

- Strukturierte Logs mit:
  - timestamp
  - requestId
  - projectId
  - operation (`open`, `save`, `publish`, ...)
  - result (`ok`, `conflict`, `error`)
- Problemberichte immer mit diesen Feldern erzeugen.

## 9) Smoke-Test Pflicht vor Release

Diese Tests müssen vor jedem Release grün sein:

1. Projekt A öffnen, Seite/Metadaten ändern, speichern.
2. Projekt B öffnen, Daten prüfen (dürfen unverändert sein).
3. Zurück zu A, Daten müssen exakt den letzten Stand zeigen.
4. Schnell zwischen A/B wechseln während Speichern.
5. Keine Duplikate, keine Vermischung, kein Datenverlust.

## 10) Release Gate (Go/No-Go)

Release nur, wenn alle Punkte true sind:

- [ ] Kein bekannter Kontext-Mismatch-Bug offen
- [ ] Smoke-Test 1-5 bestanden
- [ ] Fehlerlog ohne neue P0/P1 in letzter Testsession
- [ ] Rollback-Tag/Release vorhanden

---

## Copy-Paste Prompt für andere Chats

Nutze diesen Prompt in neuen Projekten:

> Arbeite nach `docs/STABILITY_PLAYBOOK.md`.  
> Kein Feature vor Stabilität.  
> Setze zuerst Single Source of Truth, expliziten Save-Kontext (`projectId`), atomare Writes und Save-Locks um.  
> Danach Smoke-Tests für Projekt A/B Wechsel.  
> Bei Konflikten `409 Conflict` statt stiller Fallbacks.
