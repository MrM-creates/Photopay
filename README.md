# PhotoPay MVP

Next.js MVP scaffold for a Swiss-first photographer delivery and sales flow:

1. Photographer creates gallery
2. Photographer defines packages
3. Client selects images per package
4. Checkout starts (Twint provider integration pending)
5. Paid items become downloadable

## Setup

```bash
npm install
cp .env.example .env.local
```

Set environment values in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYMENT_PROVIDER` (`stripe` or `payrexx`)
- `APP_BASE_URL` (e.g. `http://localhost:3000`)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CHECKOUT_PAYMENT_METHOD_TYPES` (default `twint,card`)

## Run

```bash
npm run dev
```

Open:

- `http://localhost:3000/` (entry)
- `http://localhost:3000/studio` (Fotografen-GUI)
- `http://localhost:3000/g/<publicSlug>` (Kunden-GUI nach Publish)

## PWA / App install

- The app now ships with:
  - `public/manifest.webmanifest`
  - `public/sw.js`
  - install icons in `public/icons/`
- In compatible browsers, an install prompt appears automatically.
- After install, PhotoPay opens in standalone app mode (desktop + mobile).

## Desktop app shell (Electron)

- Start Next.js + Electron together:
  - `npm run desktop:dev`
- Start only Electron shell (expects app already running on `http://127.0.0.1:3000`):
  - `npm run desktop:start`
- Alternative macOS launch via LaunchServices (often more stable in restricted shells):
  - `npm run desktop:start:open`
- Build macOS app bundle (`.app` in `release/mac-arm64/` or `release/mac/`):
  - `npm run desktop:build:mac`
- Optional target URL override for desktop shell:
  - `PHOTOPAY_DESKTOP_URL=https://your-host.tld npm run desktop:start`
  - or: `npm run desktop:start -- --url=https://your-host.tld`
- Note: the current desktop build is unsigned (intended for local/internal testing).

## Database

Apply migration:

- `supabase/migrations/20260311_0001_mvp_core.sql`

## API Contract

- `docs/mvp-api-contract.md`

## Stripe webhook testing (local)

1. Run app: `npm run dev`
2. Forward Stripe webhooks to local endpoint:
   - `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
3. Copy printed signing secret into `STRIPE_WEBHOOK_SECRET`
