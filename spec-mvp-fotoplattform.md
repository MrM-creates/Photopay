# Foto-Plattform CH – Spec & MVP

**Version:** 0.1 – Initiales Blueprint  
**Datum:** März 2026  
**Status:** Ideenphase / Pre-Development

---

## 1. Vision

Eine reduzierte, ästhetisch hochwertige Plattform für Schweizer Fotografen. Kein Funktions-Overload, kein amerikanisches oder deutsches Design-Diktat. Helvetica statt Helvetica Neue Overload. Twint statt Kreditkarten-Zwang. Schweiz first.

---

## 2. Problem

Bestehende Lösungen wie Pixieset oder Pic-Time sind:
- Nicht CH-lokalisiert (kein Twint, keine CHF-nativen Flows)
- Überladen mit Funktionen die 90% der Nutzer nie brauchen
- Visuell generisch und nicht auf Qualitätsfotografen ausgerichtet
- Teuer im Verhältnis zum tatsächlichen Nutzen für Schweizer Fotografen

---

## 3. Zielgruppe (MVP)

- Schweizer Fotografen (professionell oder semi-professionell)
- Fokus auf **abgemachte Kunden-Shootings**: Hochzeit, Baby, Familie, Portrait, Event
- Technisch nicht versiert, aber qualitätsbewusst
- Wollen liefern und verkaufen – nicht administrieren

---

## 4. Kernkonzept

MVP-Fokus ist die **Auftragsabwicklung pro Shooting**:

1. Fotograf erstellt eine dedizierte Galerie für ein spezifisches Shooting oder Event.
2. Fotograf lädt Bilder hoch.
3. Kunde erhält einen privaten Link, sieht alle Bilder als Vorschau mit Wasserzeichen.
4. Kunde füllt den Warenkorb über definierte Packages und wählt passende Bilder.
5. Kunde bezahlt via Twint.
6. Nur gekaufte Bilder werden danach ohne Wasserzeichen downloadbar.

**User Journey (MVP):**
> Galerie öffnen → Bilder auswählen → Package in Warenkorb → via Twint bezahlen → gekaufte Bilder ohne Wasserzeichen downloaden

---

## 5. MVP Feature Set

### Must Have
- [ ] Fotograf-Account (Registrierung, Login)
- [ ] Galerie erstellen (Titel, Beschreibung, Bilder hochladen)
- [ ] Passwortgeschützter Galerie-Link für Kunden
- [ ] **Fixes Wasserzeichen** wird automatisch auf alle Galerie-Vorschauen angewendet (nicht deaktivierbar im MVP)
- [ ] **Downloadschutz:** Alle Bilder sind vor Kauf nur als Vorschau mit Wasserzeichen sichtbar
- [ ] **Produktepakete pro Galerie:** Fotograf definiert Pakete (z.B. Einzelbild Digital, 5er-Paket Digital)
- [ ] **Package-basierter Warenkorb:** Kunde legt ein oder mehrere Pakete in den Warenkorb und ordnet ausgewählte Bilder zu
- [ ] **Klare Mengenkontrolle im Warenkorb:** System zeigt fehlende oder zusätzliche Bildanzahl pro Paket transparent an
- [ ] Bestellung/Kauf mit Twint-Zahlung (CHF)
- [ ] Nach Zahlung sind nur die gekauften Bilder als Download ohne Wasserzeichen verfügbar
- [ ] Cleanes, responsives Design (Mobile first)
- [ ] Vercel Hosting / Deployment

### Produktepakete – Logik (MVP)
Jeder Fotograf kann im Dashboard eigene Pakete definieren:

| Pakettyp | Beispiel | Logik |
|----------|---------|-------|
| Einzelbild Digital | CHF 15 | 1 Bild auswählbar, Download nach Zahlung ohne Wasserzeichen |
| Paket Digital | 5 Bilder CHF 60 | Kunde muss genau 5 Bilder auswählen |

**Warenkorb-Logik (MVP):**
1. Kunde wählt ein oder mehrere Pakete.
2. Kunde weist jedem Paket passende Bilder aus der Galerie zu.
3. Das System validiert die Anzahl Bilder pro Paket in Echtzeit.
4. Bei Unterauswahl (z.B. 9 von 10) zeigt das UI eine klare Meldung: wie viele Bilder noch fehlen; Checkout bleibt gesperrt.
5. Bei Überauswahl (z.B. 11 von 10) gilt die vom Fotografen definierte Regel:
   - Standard: Überanzahl nicht erlaubt, Kunde muss auf Paketmenge reduzieren.
   - Optional: Überanzahl ist erlaubt, jedes zusätzliche Bild wird automatisch zum definierten Einzelpreis verrechnet.
6. Checkout ist nur möglich, wenn alle Paketregeln erfüllt sind.
7. Nach erfolgreicher Zahlung werden nur diese Bilder freigeschaltet (Original ohne Wasserzeichen).

### Technische Package-Konfiguration (MVP)

**Package-Felder (pro Galerie):**

| Feld | Typ | Beispiel | Zweck |
|------|-----|----------|-------|
| id | UUID | `pkg_...` | Eindeutige Paket-ID |
| galleryId | UUID | `gal_...` | Zuordnung zur Galerie |
| name | String | `10er Paket Digital` | Anzeigename im Shop |
| priceCents | Integer | `12000` | Paketpreis in Rappen (CHF 120.00) |
| currency | String | `CHF` | Währung |
| includedCount | Integer | `10` | Anzahl Bilder, die im Paket enthalten sind |
| allowExtra | Boolean | `true` | Erlaubt Bilder über `includedCount` hinaus |
| extraUnitPriceCents | Integer \| null | `1500` | Preis pro Zusatzbild in Rappen; Pflicht wenn `allowExtra=true` |
| active | Boolean | `true` | Paket im Kundenshop sichtbar |
| sortOrder | Integer | `1` | Reihenfolge im UI |
| createdAt / updatedAt | Timestamp |  | Nachvollziehbarkeit |

**Validierungsregeln:**
1. `includedCount >= 1`
2. `priceCents >= 0`
3. Wenn `allowExtra = false`, dann muss `selectedCount <= includedCount` sein.
4. Wenn `allowExtra = true`, dann darf `selectedCount > includedCount` sein und  
   `extraCount = selectedCount - includedCount` wird mit `extraUnitPriceCents` berechnet.
5. Wenn `allowExtra = true`, dann ist `extraUnitPriceCents` Pflicht und `>= 0`.
6. Checkout ist blockiert, wenn `selectedCount < includedCount`.

**Preisformel pro Paket im Warenkorb:**

`lineTotal = priceCents + max(0, selectedCount - includedCount) * extraUnitPriceCents`

Bei `allowExtra=false` ist der zweite Term immer `0`.

### Datenmodell (Supabase/PostgreSQL) – MVP

| Tabelle | Zweck | Wichtigste Felder |
|---------|------|-------------------|
| `packages` | Paketdefinition pro Galerie | `id`, `gallery_id`, `name`, `price_cents`, `currency`, `included_count`, `allow_extra`, `extra_unit_price_cents`, `active`, `sort_order` |
| `cart_package_items` | Paketposition im Warenkorb | `id`, `cart_id`, `package_id`, `base_price_cents`, `included_count`, `allow_extra`, `extra_unit_price_cents` |
| `cart_package_selections` | Bildzuweisung zu einer Paketposition | `id`, `cart_package_item_id`, `asset_id` |
| `order_items` | Gekaufte Paketpositionen | `id`, `order_id`, `package_id`, `selected_count`, `base_price_cents`, `extra_count`, `extra_total_cents`, `line_total_cents` |
| `order_item_assets` | Gekaufte Einzelbilder je Paketposition | `id`, `order_item_id`, `asset_id` |

**Warum Snapshot-Felder in `cart_package_items`/`order_items`:**
- Paketpreise können sich später ändern.
- Bereits gestartete Warenkörbe und abgeschlossene Bestellungen müssen historisch korrekt bleiben.

**Bewusst ausgeschlossen im MVP:**
- Print-Produkte → Post-MVP Ausbauschritt
- Exklusivrechte → Post-MVP Ausbauschritt
- Öffentlicher Marketplace
- Komplexe Portfolio-Mechaniken

### Nice to Have (Post-MVP)
- [ ] Favoriten-Funktion für Kunden (Bild-Selektion vor Kauf)
- [ ] Dynamisches Wasserzeichen (on-the-fly via Cloudinary)
- [ ] E-Mail Benachrichtigung bei Bestellung
- [ ] Subdomain pro Fotograf (name.plattform.ch)
- [ ] Portfolio-Seite für öffentliche Arbeiten (Pull-Flow)
- [ ] Print-Produkte (Fulfillment via lokalem Schweizer Anbieter oder API) → Post-MVP

### Bewusst ausgeschlossen
- Templates (mehr als 1-2 Layouts)
- Social Features
- Blog / Texte
- Komplexe Druckoptionen im MVP
- Marketplace zwischen Fotografen

---

## 6. Geschäftsmodell

**SaaS – Monatliches Abo**

| Plan | Preis (CHF/Mt.) | Galerien | Speicher | Portfolio |
|------|----------------|----------|----------|-----------|
| Start | 9 | 3 | 5 GB | ✓ |
| Pro | 19 | unbegrenzt | 50 GB | ✓ |
| Studio | 39 | unbegrenzt | 200 GB | ✓ + Priorität |

> Twint-Transaktionsgebühren werden separat kalkuliert (ca. 1.3% + 0.30 CHF pro Transaktion).

---

## 7. Twint Integration – PSP Entscheidung

Twint hat keine öffentliche API. Die Integration läuft zwingend über einen Payment Service Provider (PSP). Da die App auf Next.js basiert, fallen alle Plugin-Lösungen weg.

**Offene Entscheidung: Stripe vs. Payrexx**

| Kriterium | Stripe | Payrexx |
|-----------|--------|---------|
| Twint Support | ✓ Offiziell | ✓ Offiziell |
| Next.js Dokumentation | Hervorragend | Gut |
| KI-Coding Support | Sehr hoch (viel in Trainingsdaten) | Mittel |
| Schweizer Firma | ✗ (USA) | ✓ |
| Onboarding | Schnell, selbst | Schnell, selbst |
| Konditionen | ~1.5% + 0.25 CHF | ~1.3% + 0.30 CHF |
| Empfehlung | MVP-Favorit wegen Docs | Alternative wenn CH-Firma Prio |

**Empfehlung für MVP:** Stripe – weil die Next.js Integration am besten dokumentiert ist und KI-gestütztes Coding damit am wenigsten fehleranfällig ist. Twint ist offiziell unterstützt.

**Nächster Schritt Tech-Spike:**
1. Stripe Account erstellen (kostenlos, sofort)
2. Twint in Stripe Dashboard aktivieren (CH Merchant Account nötig)
3. Testintegration in Next.js mit Stripe Checkout
4. Twint Zahlung im Testmodus durchspielen

> Diese Docs gehören in NotebookLM: https://stripe.com/docs/payments/twint

---

## 8. Technischer Stack

| Bereich | Technologie | Bemerkung |
|--------|------------|-----------|
| Frontend | Next.js / React | |
| Hosting | Vercel | |
| Authentifizierung | Clerk oder NextAuth | |
| Bilderspeicher | Cloudinary | Wasserzeichen beim Upload, Downloadschutz |
| Zahlung | Stripe + Twint | Favorit MVP |
| Zahlung (Alternative) | Payrexx + Twint | Falls CH-Firma bevorzugt |
| Datenbank | Supabase (PostgreSQL) | |
| Styling | Tailwind CSS | |

---

## 9. Design-Prinzipien

- **Weniger ist mehr** – jede Funktion muss sich rechtfertigen
- **Typografie first** – Helvetica, viel Weissraum, klare Hierarchie
- **Bilder im Zentrum** – UI tritt zurück, Fotografie steht im Vordergrund
- **Schweizer Ästhetik** – International Style, nicht Silicon Valley
- **Mobile first** – Kunden schauen auf dem Handy

---

## 10. Offene Fragen (zu klären vor Entwicklungsstart)

1. **Twint Integration:** Direktintegration oder via PSP (Datatrans, Stripe CH)? PSP ist einfacher im MVP.
2. **Druckerfüllung:** Selbst organisieren oder via API (z.B. Printful, lokaler Schweizer Anbieter)?
3. **Rechtliches:** DSG-konforme Datenhaltung, AGB, Impressum – wann einbinden?
4. **Domain/Branding:** Plattformname, .ch Domain – offen.
5. **Beta-Nutzer:** Welche Fotografen könnten als erste Tester dienen?

---

## 11. Nächste Schritte

1. **Validierung** – Mit 3-5 Schweizer Fotografen sprechen. Problem real? Würden sie zahlen?
2. **NotebookLM Setup** – Twint API Docs, Vercel Docs, Supabase Docs einpflegen
3. **Wireframes** – Erste Skizzen der Galerie-Ansicht und Portfolio-Seite
4. **Tech-Spike** – Twint-Zahlung testen (das ist der kritischste und unbekannteste Teil)
5. **Backend-Basis umsetzen** – Supabase Migration anwenden und API-Routen gemäss Contract implementieren
6. **MVP bauen** – Iterativ mit echten Testshootings

**Technische Artefakte (Stand jetzt):**
- `supabase/migrations/20260311_0001_mvp_core.sql` (MVP-Datenmodell)
- `docs/mvp-api-contract.md` (MVP API-Endpunkte und Regeln)

---

*Dieses Dokument ist ein lebendes Blueprint. Es wird mit jeder Iteration aktualisiert.*
