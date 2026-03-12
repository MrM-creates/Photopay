# PhotoPay UI/UX Blueprint

## 1) Zielbild

PhotoPay führt Fotografen klar, ruhig und ohne technische Sprache durch den Ablauf:

- Galerie anlegen
- Bilder hinzufügen
- Pakete festlegen
- Link freigeben
- Ergebnis sehen

Pro Bildschirm gibt es genau eine Hauptaktion. Der Nutzer weiss jederzeit:

- Wo bin ich?
- Was ist der nächste Schritt?
- Was ist bereits erledigt?

## 2) Sprachregeln

- Schreibe kurz, konkret, alltagstauglich.
- Nutze keine internen Fachwörter im sichtbaren UI.
- Nutze klare Verben: `Starten`, `Speichern`, `Freigeben`, `Ansehen`.
- Nutze Umlaute (ä, ö, ü), aber kein deutsches doppel-s.
- Fehlermeldungen sind ruhig, hilfreich und lösungsorientiert.

Beispiele:

- Gut: `Ich konnte den Server gerade nicht erreichen. Bitte versuche es in ein paar Sekunden erneut.`
- Nicht gut: `NETWORK_ERROR` oder `Fetch failed`.

## 3) Navigation und Fortschritt

### Hauptlogik

- Reihenfolge: `Start -> Galerie -> Bilder -> Pakete -> Freigabe -> Übersicht`
- Maximal 5 sichtbare Hauptschritte gleichzeitig in der Step-Navigation.
- Pro Schritt ein klarer Zustand:
- `offen`
- `aktiv`
- `erledigt` (mit Check-Icon)

### Verhaltensregeln

- Schrittklick nur erlauben, wenn fachlich sinnvoll.
- Der nächste sinnvolle Schritt wird als Empfehlung markiert.
- Die Navigation springt nicht unvorhersehbar.

## 4) Startseite (Onboarding)

### Ziel

Sofort klar machen, was PhotoPay löst, und den Nutzer in den geführten Ablauf bringen.

### Copy

- Eyebrow: `PhotoPay für Fotografen`
- Titel: `Verkaufe dein Shooting in 4 klaren Schritten`
- Text: `Du legst eine Galerie an, fügst Bilder hinzu, definierst Pakete und teilst den Kundenlink.`

### Aktionen

- Primär: `Jetzt starten`
- Sekundär: `Bestehende Galerie öffnen`

Regel: Keine gleichwertigen Zusatzaktionen direkt neben der Primäraktion.

## 5) Studio: Texte pro Schritt

## Schritt 1: Galerie

- Titel: `Schritt 1: Galerie anlegen`
- Hilfetext: `Lege zuerst die Galerie für dein Shooting an.`

Felder:

- `Galeriename`
- `Kurzbeschreibung (optional)`
- `Passwort für Kunden`

Button:

- `Galerie speichern`

Erfolg:

- `Fertig. Deine Galerie ist erstellt.`

Fehler:

- `Die Galerie konnte nicht erstellt werden. Bitte prüfe deine Eingaben.`

## Schritt 2: Bilder

- Titel: `Schritt 2: Bilder hinzufügen`
- Hilfetext: `Wähle die Galerie und füge die gewünschten Bilder hinzu.`

Felder:

- `Galerie`
- `Bilder auswählen`

Button:

- `Bilder speichern`

Erfolg:

- `Fertig. {anzahl} Bilder wurden hinzugefügt.`

Fehler:

- `Die Bilder konnten nicht gespeichert werden. Bitte versuche es erneut.`

## Schritt 3: Pakete

- Titel: `Schritt 3: Paket festlegen`
- Hilfetext: `Definiere Preis, enthaltene Bilder und optional den Preis für Zusatzbilder.`

Felder:

- `Paketname`
- `Paketpreis (CHF)`
- `Enthaltene Bilder`
- `Zusatzbilder erlauben`
- `Preis pro Zusatzbild (CHF)` (nur wenn aktiviert)

Button:

- `Paket speichern`

Erfolg:

- `Fertig. Das Paket wurde gespeichert.`

Fehler:

- `Das Paket konnte nicht gespeichert werden. Bitte prüfe die Eingaben.`

## Schritt 4: Freigabe

- Titel: `Schritt 4: Kundenlink freigeben`
- Hilfetext: `Wenn alles passt, schaltest du die Galerie live und teilst den Link mit deinen Kunden.`

Elemente:

- Label: `Persönlicher Kundenlink`

Buttons:

- Primär: `Jetzt freigeben`
- Sekundär: `Kundenseite öffnen`

Erfolg:

- `Fertig. Die Galerie ist jetzt live.`

Fehler:

- `Die Freigabe hat nicht geklappt. Bitte versuche es in einem Moment erneut.`

## Schritt 5: Übersicht

- Titel: `Übersicht`
- Hilfetext: `Hier siehst du den aktuellen Status deiner Galerie.`

Statuszeilen:

- `Galerie: erledigt/offen`
- `Bilder: erledigt/offen`
- `Pakete: erledigt/offen`
- `Freigabe: erledigt/offen`

Primäre Aktion:

- `Kundenseite öffnen`

Sekundär:

- `Zurück zu Paketen`

## 6) Microcopy: Ersetzen und vereinheitlichen

Diese Formulierungen sollten vereinheitlicht werden:

- `Dateinamen (Demo)` -> `Bilder auswählen`
- `Paketpreis (Rappen)` -> `Paketpreis (CHF)`
- `Einzelpreis pro Extra-Bild (Rappen)` -> `Preis pro Zusatzbild (CHF)`
- `publiziert` -> `live`
- `publicSlug`-Sichtbarkeit vermeiden -> `Persönlicher Kundenlink`

## 7) Fehlermeldungen (freundlich und klar)

Standardtexte:

- Netzwerk:
  - `Ich konnte den Server gerade nicht erreichen. Bitte versuche es in ein paar Sekunden erneut.`
- Validierung:
  - `Bitte prüfe deine Eingaben. Ein Feld ist noch unvollständig.`
- Nicht gefunden:
  - `Diese Galerie wurde nicht gefunden. Bitte wähle eine Galerie aus der Liste.`
- Unbekannt:
  - `Es ist ein technischer Fehler aufgetreten. Bitte versuche es erneut.`

## 8) Visuelle Regeln

- Eine klare Primärfarbe für Hauptaktionen.
- Sekundäraktionen visuell ruhiger.
- Kontrast für Lesbarkeit priorisieren.
- Abstände grosszügig und konsistent.
- Gleiche Komponenten verhalten sich überall gleich.

## 9) Component-Verhalten

- Buttons:
  - Primär immer eindeutig.
  - Disabled eindeutig sichtbar und ohne Hover-Effekte.
- Inputs:
  - Deutlicher Fokuszustand.
  - Labels immer sichtbar.
- Notices:
  - Maximal eine Hauptmeldung pro Schritt.
  - Erfolg, Hinweis, Fehler klar unterscheidbar.

## 10) Release-Checkliste (UX)

1. Ist pro Screen genau eine Hauptaktion sichtbar?
2. Sind alle Texte in Alltagssprache formuliert?
3. Sind Schrittzustände klar als offen, aktiv, erledigt sichtbar?
4. Gibt es auf jedem Screen einen klaren Rückweg?
5. Sind Fehlermeldungen hilfreich statt technisch?
6. Sind Begriffe konsistent (z. B. immer `live`, nie gemischt mit `publiziert`)?
7. Ist der Nutzerfluss vom Start bis zur Freigabe ohne Sackgassen möglich?

## 11) Kurzfassung für Produktentscheidungen

- Einfachheit vor Funktionsfülle.
- Führung vor Freiheit in frühen Schritten.
- Sprache für Nutzer, nicht für Entwickler.
- Ein Schritt, eine Entscheidung, eine Hauptaktion.

## 12) Paketmanagement (Bibliothek)

### Warum dieser Bereich nötig ist

Nutzer wollen Pakete nicht bei jedem neuen Projekt neu erfassen. Deshalb braucht PhotoPay eine zentrale Paketbibliothek.

### Ziel

- Pakete einmal definieren
- Bei neuen Projekten mit einem Klick übernehmen
- Danach projektspezifisch anpassen

### Struktur im UI

- Menüpunkt: `Pakete`
- Tabs:
  - `Projektpakete`
  - `Bibliothek`

### Flow A: Vorlage erstellen

Ort: `Pakete -> Bibliothek`

Felder:

- `Vorlagenname`
- `Paketname`
- `Preis (CHF)`
- `Enthaltene Bilder`
- `Zusatzbilder erlauben`
- `Preis pro Zusatzbild (CHF)`

Aktionen:

- Primär: `Vorlage speichern`

Meldungen:

- Erfolg: `Vorlage wurde gespeichert.`
- Fehler: `Vorlage konnte nicht gespeichert werden. Bitte prüfe die Eingaben.`

### Flow B: Vorlage auf Projekt anwenden

Ort: `Schritt 3: Paket festlegen`

UI-Block:

- Titel: `Aus Paketbibliothek übernehmen`
- Hilfetext: `Wähle eine Vorlage und passe sie bei Bedarf für dieses Projekt an.`

Aktionen:

- Primär: `Vorlage übernehmen`
- Sekundär: `Leeres Paket erstellen`

Hinweistext:

- `Vorlagen werden in dieses Projekt kopiert. Änderungen hier gelten nur für dieses Projekt.`

### Flow C: Projektpakete bearbeiten

Ort: `Pakete -> Projektpakete`

Aktionen:

- Primär: `Änderungen speichern`
- Optional: `Als neue Vorlage speichern`

Meldungen:

- Erfolg: `Projektpaket wurde aktualisiert.`
- Fehler: `Projektpaket konnte nicht gespeichert werden.`

### Wichtige Regel (Datenmodell)

- Bei Übernahme aus der Bibliothek wird kopiert, nicht verlinkt.
- Änderungen in Projekt A dürfen nie Bibliothekswerte oder andere Projekte überschreiben.

### Empty State

- `Noch keine Vorlagen vorhanden. Erstelle deine erste Vorlage.`
