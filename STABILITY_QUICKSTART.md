# Stability Quickstart (PhotoPay)

Nutze diese Datei als Startpunkt in neuen Chats oder bei Übergaben.

## Ziel

Stabilität vor Features:
- keine Datenvermischung zwischen Projekten
- keine stillen Datenverluste
- reproduzierbare Saves und Öffnen-Abläufe

## Pflichtregeln (immer zuerst)

1. Eine Quelle pro Projekt (Single Source of Truth)
2. Jeder Write mit explizitem `projectId` (bei Mismatch: `409 Conflict`)
3. Atomare Saves (Datei: tmp+rename / DB: Transaktion)
4. Save-Lock oder Queue pro Projekt (kein Race zwischen open/save/sync)
5. Kanonisierung beim Öffnen vor dem Rendern

## API-Vertrag (minimal)

- Save-Request enthält mindestens:
  - `projectId`
  - `userId`/`ownerId` (wenn multi-user)
- Save-Response enthält mindestens:
  - `projectId`
  - `status`
- Kein stiller Fallback auf "aktives Projekt"

## Smoke-Test (vor jedem Release)

1. Projekt A öffnen, ändern, speichern
2. Projekt B öffnen, prüfen (unverändert)
3. Zurück zu A, Stand muss exakt stimmen
4. Schnell A/B wechseln während Save
5. Erwartung: keine Duplikate, keine Vermischung, kein Verlust

## Release-Go

Nur releasen, wenn:
- Smoke-Test 1-5 grün
- keine offenen Kontext-Mismatch-Bugs
- Logs ohne neue P0/P1

## Nutzung in anderen Chats

Prompt:

> Arbeite nach `/Users/MrM/Desktop/Own Apps/PhotoPay/STABILITY_QUICKSTART.md` und `/Users/MrM/Desktop/Own Apps/PhotoPay/docs/STABILITY_PLAYBOOK.md`.  
> Stabilität vor Features.  
> Zuerst Save-Kontext, Atomik, Locking und Smoke-Tests absichern.
