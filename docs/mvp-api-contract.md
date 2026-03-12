# PhotoPay MVP API Contract (Draft)

**Date:** 2026-03-11  
**Status:** Draft for implementation

## 1. Scope

Dieser Contract deckt den MVP-Flow ab:
1. Fotograf erstellt Galerie + Pakete.
2. Kunde greift via Link + Passwort auf Galerie zu.
3. Kunde wählt Bilder pro Paket.
4. Kunde bezahlt via Twint (Stripe/Payrexx).
5. Nur gekaufte Bilder werden ohne Wasserzeichen downloadbar.

## 2. Conventions

- Base path: `/api`
- IDs: UUID
- Geldbeträge: Integer in Rappen (`*_cents`)
- Währung: `CHF`
- Zeit: ISO-8601 (`timestamptz`)
- Fehlerformat:

```json
{
  "error": {
    "code": "PACKAGE_INCOMPLETE",
    "message": "1 image missing for package item",
    "details": {}
  }
}
```

## 3. Auth Contexts

- Fotograf-Endpoints: Session/JWT erforderlich.
- Public-Client-Endpoints: Galerie-Access-Token erforderlich (aus Passwort-Check).
- Webhooks: Signaturprüfung erforderlich (Stripe/Payrexx).

## 4. Photographer Endpoints

## `POST /api/galleries`

Erstellt eine Galerie.

Request:
```json
{
  "title": "Hochzeit Mueller",
  "description": "Zeremonie + Feier",
  "accessPassword": "plain-text-on-create"
}
```

Response `201`:
```json
{
  "id": "uuid",
  "publicSlug": "hochzeit-mueller-9f4a",
  "status": "draft"
}
```

## `POST /api/galleries/{galleryId}/assets/upload-url`

Erzeugt signierte Upload-URL pro Datei.

## `POST /api/galleries/{galleryId}/assets/finalize`

Persistiert Metadaten nach Upload und erzeugt Vorschau mit Wasserzeichen.

## `POST /api/galleries/{galleryId}/packages`

Erstellt Paket.

Request:
```json
{
  "name": "10er Paket Digital",
  "priceCents": 12000,
  "includedCount": 10,
  "allowExtra": true,
  "extraUnitPriceCents": 1500
}
```

Rules:
1. `includedCount >= 1`
2. `allowExtra=false` -> `extraUnitPriceCents=null`
3. `allowExtra=true` -> `extraUnitPriceCents` ist Pflicht

## `PATCH /api/packages/{packageId}`

Aktualisiert Paket (Preis, Aktivstatus, Regeln).

## `POST /api/galleries/{galleryId}/publish`

Publiziert Galerie und macht Public-Flow nutzbar.

## 5. Public Client Endpoints

## `POST /api/public/galleries/{publicSlug}/access`

Prueft Passwort und liefert Galerie-Access-Token.

Request:
```json
{
  "password": "customer-password"
}
```

Response:
```json
{
  "galleryAccessToken": "jwt-or-random-token",
  "expiresAt": "2026-03-18T10:00:00Z"
}
```

## `GET /api/public/galleries/{publicSlug}`

Liefert Galerie mit Vorschau-Assets (immer mit Wasserzeichen) und aktiven Paketen.

## `POST /api/public/carts`

Erstellt Warenkorb.

Request:
```json
{
  "publicSlug": "hochzeit-mueller-9f4a",
  "customerName": "Anna Mueller",
  "customerEmail": "anna@example.com"
}
```

Response:
```json
{
  "cartId": "uuid",
  "cartAccessToken": "uuid"
}
```

## `POST /api/public/carts/{cartId}/items`

Fuegt Paketposition in Warenkorb ein.

Request:
```json
{
  "packageId": "uuid"
}
```

Response:
```json
{
  "cartPackageItemId": "uuid",
  "includedCount": 10,
  "allowExtra": true,
  "extraUnitPriceCents": 1500
}
```

## `PUT /api/public/carts/{cartId}/items/{cartPackageItemId}/selections`

Setzt komplette Bildauswahl fuer diese Paketposition.

Request:
```json
{
  "assetIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

Response:
```json
{
  "selectedCount": 9,
  "includedCount": 10,
  "allowExtra": true,
  "missingCount": 1,
  "extraCount": 0,
  "extraCostCents": 0,
  "lineTotalCents": 12000,
  "selectionStatus": "INCOMPLETE",
  "checkoutEligible": false,
  "message": "1 Bild fehlt fuer dieses Paket."
}
```

`selectionStatus` Werte:
1. `INCOMPLETE` -> `selectedCount < includedCount` (Checkout gesperrt)
2. `EXACT` -> `selectedCount == includedCount`
3. `EXTRA_BLOCKED` -> `selectedCount > includedCount` und `allowExtra=false`
4. `EXTRA_PRICED` -> `selectedCount > includedCount` und `allowExtra=true`

## `GET /api/public/carts/{cartId}`

Liefert den kompletten Warenkorb inkl. Paketvalidierung, Summen und `checkoutEligible`.

Response (Auszug):
```json
{
  "cartId": "uuid",
  "items": [
    {
      "cartPackageItemId": "uuid",
      "packageName": "10er Paket",
      "selectedAssetIds": ["uuid-1", "uuid-2"],
      "basePriceCents": 12000,
      "extraUnitPriceCents": 1500,
      "selectedCount": 2,
      "includedCount": 10,
      "selectionStatus": "INCOMPLETE",
      "checkoutEligible": false
    }
  ],
  "totalCents": 12000,
  "checkoutEligible": false
}
```

## `POST /api/public/carts/{cartId}/checkout`

Startet Payment (Stripe Checkout oder Payrexx Checkout Link).

Precondition:
1. Jede Paketposition ist `EXACT` oder `EXTRA_PRICED`.
2. Keine Position ist `INCOMPLETE` oder `EXTRA_BLOCKED`.

Response:
```json
{
  "orderId": "uuid",
  "paymentProvider": "stripe",
  "paymentStatus": "pending",
  "checkoutUrl": "https://checkout.stripe.com/...",
  "stripeSessionId": "cs_test_..."
}
```

## 6. Payment Webhooks

## `POST /api/webhooks/stripe`
## `POST /api/webhooks/payrexx`

Stripe webhook endpoint validates `stripe-signature` with `STRIPE_WEBHOOK_SECRET`.

Bei erfolgreicher Zahlung:
1. `orders.payment_status` -> `paid`
2. `carts.status` -> `checked_out`
3. `order_items` + `order_item_assets` finalisieren
4. `download_grants` fuer gekaufte Assets erzeugen

Bei fehlgeschlagener Zahlung:
1. `orders.payment_status` -> `failed`
2. `carts.status` -> `open`

## 7. Download Endpoints

## `GET /api/public/orders/{orderId}/downloads`

Liefert nur gekaufte Assets mit gueltigen Download-Grants.

Response:
```json
{
  "orderId": "uuid",
  "items": [
    {
      "assetId": "uuid",
      "filename": "DSC_1001.jpg",
      "downloadUrl": "signed-url",
      "expiresAt": "2026-03-25T10:00:00Z",
      "remainingDownloads": 4
    }
  ]
}
```

## `POST /api/public/downloads/{grantToken}/consume`

Verbraucht einen Download und liefert eine kurzlebige Signed URL auf das Original ohne Wasserzeichen.

## 8. Server-Side Pricing Rules (Mandatory)

Pricing wird nie aus dem Client uebernommen.

Pro Paketposition:
1. `extraCount = max(0, selectedCount - includedCount)`
2. Wenn `allowExtra=false` und `extraCount > 0` -> Fehler `EXTRA_NOT_ALLOWED`
3. Wenn `selectedCount < includedCount` -> Fehler `PACKAGE_INCOMPLETE`
4. `lineTotalCents = basePriceCents + extraCount * extraUnitPriceCents`

Order total:
1. `subtotalCents = sum(lineTotalCents)`
2. `totalCents = subtotalCents` (MVP ohne Gutscheine/Steuern)

## 9. Minimal Error Codes

1. `GALLERY_NOT_FOUND`
2. `GALLERY_ACCESS_DENIED`
3. `PACKAGE_NOT_FOUND`
4. `PACKAGE_INCOMPLETE`
5. `EXTRA_NOT_ALLOWED`
6. `INVALID_ASSET_SELECTION`
7. `CART_NOT_FOUND`
8. `CHECKOUT_NOT_ELIGIBLE`
9. `PAYMENT_VERIFICATION_FAILED`
10. `DOWNLOAD_GRANT_INVALID`
