# Navigation & Menu Principles (Flider Style)

## Zielbild

Die Navigation soll den User fuehren, nicht belasten:

- jederzeit klar: **Wo bin ich?**
- jederzeit klar: **Was ist der naechste Schritt?**
- jederzeit klar: **Was ist optional?**

---

## 1) Eine primaere Linie, ein Fokus

- Nutze eine klare Hauptnavigation mit max. 5 Top-Level Punkten.
- Pro Screen nur **eine** primaere Aktion visuell hervorheben.
- Sekundaere Aktionen in `Mehr`/Overflow verschieben.

Do:
- `Vorschau` (primaer), `Live schalten` (sekundaer/kontextabhaengig)

Don't:
- 2-3 gleich starke CTA nebeneinander ohne Hierarchie.

---

## 2) Schrittlogik sichtbar, aber nicht technisch

- Wenn der Flow sequenziell ist (z. B. Setup), nutze eine sichtbare Schrittfolge.
- Schrittstatus mit einfacher Semantik:
  - offen
  - erledigt
  - aktiv
- Keine internen Begriffe im UI (kein Tech-Sprech).

Pattern:
- `Start -> Seiten -> Design -> Hosting -> Uebersicht`
- Optional kleines Erledigt-Icon je Schritt.

---

## 3) Progressive Disclosure

- Zeige nur, was jetzt relevant ist.
- Erweiterte Optionen erst bei Bedarf aufklappen.
- Hilfetexte direkt am Ort der Entscheidung platzieren.

Beispiel:
- Hosting-Hilfe hinter einem klaren Trigger:
  - „Du weisst nicht, wo du diese Daten findest?“

---

## 4) Konsistenz vor Cleverness

- Gleiche Aktion = gleiche Position + gleiche Bezeichnung.
- Begriffe nicht wechseln (`Uebersicht` nicht spaeter `Dashboard` nennen).
- Menuezustaende stabil halten (Buttons nicht springen lassen).

---

## 5) Kontext immer sichtbar

- Zeige den aktiven Projektnamen im Header.
- Aktiver Bereich im Menu visuell klar markieren.
- Beim Seitenwechsel Kontext nicht verlieren (kein unerwarteter Reset).

---

## 6) Rueckwege immer klar

- Jeder Deep-Screen braucht einen klaren Rueckweg:
  - Home/Overview Icon
  - „Zur Uebersicht“
- Keine Sackgassen.

---

## 7) Fehler- und Recovery-UX

- Erst automatische Selbstheilung.
- Nur wenn noetig manuelle Eskalation anbieten.
- Fehlermeldungen:
  - kurz
  - menschlich
  - handlungsorientiert

Format:
- Was ist passiert?
- Was tut die App gerade?
- Was kann der User jetzt tun?

---

## 8) Navigation fuer Vertrauen

- User-Aktionen duerfen nie „zufaellig“ Daten ueberschreiben.
- Projektwechsel muss atomar und nachvollziehbar sein.
- Kritische Aktionen (Live schalten) klar getrennt von Editieren.

---

## 9) Mobile/kleine Fenster

- Prioritaeten bleiben gleich, nur Darstellung aendert sich.
- Bei wenig Breite:
  - Primaeraktion sichtbar lassen
  - Sekundaeraktionen in Overflow
- Keine Layout-Brueche durch Sidebar-Ueberladung.

---

## 10) Microcopy-Regeln

- Kurz, konkret, ruhig.
- Positive Handlungsverben:
  - `Projekt starten`
  - `Projekt fortsetzen`
  - `Vorschau`
  - `Live schalten`
- Fehlermeldungen ohne Schuldzuweisung.

---

## 11) Review-Checklist (pro Release)

1. Weiss ein neuer User in 5 Sekunden, wo er starten soll?
2. Gibt es pro Screen genau eine klare Hauptaktion?
3. Sind alle Begriffe konsistent?
4. Gibt es auf jedem Screen einen klaren Rueckweg?
5. Sind Fehlermeldungen in Alltagssprache formuliert?
6. Ist die Sekundaernavigation in `Mehr` gebuendelt?
7. Bleibt der Projektkontext bei Wechseln stabil?

---

## Kurzregel

Wenn ein Menupunkt nicht zur aktuellen Entscheidung beitraegt, gehoert er in den Hintergrund.
