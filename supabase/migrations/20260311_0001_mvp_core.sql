-- PhotoPay MVP core schema
-- Date: 2026-03-11

begin;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'gallery_status') then
    create type gallery_status as enum ('draft', 'published', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'cart_status') then
    create type cart_status as enum ('open', 'checkout_pending', 'checked_out', 'abandoned', 'expired');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_provider') then
    create type payment_provider as enum ('stripe', 'payrexx');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('pending', 'paid', 'failed', 'canceled', 'refunded');
  end if;
end
$$;

create table if not exists photographers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id text not null unique,
  display_name text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists galleries (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographers(id) on delete cascade,
  title text not null,
  description text,
  public_slug text not null unique,
  access_password_hash text not null,
  status gallery_status not null default 'draft',
  cover_asset_id uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_galleries_photographer_status on galleries (photographer_id, status);

create table if not exists gallery_assets (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references galleries(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  storage_key_original text not null,
  storage_key_preview text not null,
  watermark_applied boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gallery_id, storage_key_original)
);

create index if not exists idx_gallery_assets_gallery_sort on gallery_assets (gallery_id, sort_order, created_at);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_name = 'fk_galleries_cover_asset'
      and table_name = 'galleries'
  ) then
    alter table galleries
      add constraint fk_galleries_cover_asset
      foreign key (cover_asset_id) references gallery_assets(id) on delete set null;
  end if;
end
$$;

create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references galleries(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  currency char(3) not null default 'CHF' check (currency = 'CHF'),
  included_count integer not null check (included_count >= 1),
  allow_extra boolean not null default false,
  extra_unit_price_cents integer,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packages_extra_rule check (
    (allow_extra = true and extra_unit_price_cents is not null and extra_unit_price_cents >= 0)
    or
    (allow_extra = false and extra_unit_price_cents is null)
  )
);

create index if not exists idx_packages_gallery_active_sort on packages (gallery_id, active, sort_order);

create table if not exists carts (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references galleries(id) on delete cascade,
  status cart_status not null default 'open',
  customer_name text,
  customer_email text not null,
  access_token uuid not null default gen_random_uuid() unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (position('@' in customer_email) > 1)
);

create index if not exists idx_carts_gallery_status on carts (gallery_id, status, created_at);

create table if not exists cart_package_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  package_id uuid not null references packages(id) on delete restrict,
  base_price_cents integer not null check (base_price_cents >= 0),
  included_count integer not null check (included_count >= 1),
  allow_extra boolean not null default false,
  extra_unit_price_cents integer,
  line_position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_package_items_extra_rule check (
    (allow_extra = true and extra_unit_price_cents is not null and extra_unit_price_cents >= 0)
    or
    (allow_extra = false and extra_unit_price_cents is null)
  )
);

create index if not exists idx_cart_package_items_cart on cart_package_items (cart_id, line_position, created_at);

create table if not exists cart_package_selections (
  id uuid primary key default gen_random_uuid(),
  cart_package_item_id uuid not null references cart_package_items(id) on delete cascade,
  asset_id uuid not null references gallery_assets(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (cart_package_item_id, asset_id)
);

create index if not exists idx_cart_package_selections_asset on cart_package_selections (asset_id);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  gallery_id uuid not null references galleries(id) on delete restrict,
  photographer_id uuid not null references photographers(id) on delete restrict,
  cart_id uuid unique references carts(id) on delete set null,
  currency char(3) not null default 'CHF' check (currency = 'CHF'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  payment_provider payment_provider not null,
  payment_status payment_status not null default 'pending',
  payment_reference text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_gallery_status on orders (gallery_id, payment_status, created_at desc);
create index if not exists idx_orders_photographer_created on orders (photographer_id, created_at desc);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  package_id uuid references packages(id) on delete set null,
  package_name text not null,
  selected_count integer not null check (selected_count >= 1),
  included_count integer not null check (included_count >= 1),
  base_price_cents integer not null check (base_price_cents >= 0),
  allow_extra boolean not null default false,
  extra_unit_price_cents integer,
  extra_count integer not null default 0 check (extra_count >= 0),
  extra_total_cents integer not null default 0 check (extra_total_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  created_at timestamptz not null default now(),
  constraint order_items_extra_rule check (
    (
      allow_extra = true
      and extra_unit_price_cents is not null
      and extra_unit_price_cents >= 0
      and selected_count >= included_count
      and extra_count = greatest(0, selected_count - included_count)
      and extra_total_cents = extra_count * extra_unit_price_cents
      and line_total_cents = base_price_cents + extra_total_cents
    )
    or
    (
      allow_extra = false
      and extra_unit_price_cents is null
      and extra_count = 0
      and extra_total_cents = 0
      and selected_count = included_count
      and line_total_cents = base_price_cents
    )
  )
);

create index if not exists idx_order_items_order on order_items (order_id, created_at);

create table if not exists order_item_assets (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  asset_id uuid not null references gallery_assets(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (order_item_id, asset_id)
);

create index if not exists idx_order_item_assets_asset on order_item_assets (asset_id);

create table if not exists download_grants (
  id uuid primary key default gen_random_uuid(),
  order_item_asset_id uuid not null references order_item_assets(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  expires_at timestamptz not null default (now() + interval '14 days'),
  download_limit integer not null default 5 check (download_limit >= 1),
  download_count integer not null default 0 check (download_count >= 0),
  last_downloaded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_item_asset_id),
  check (download_count <= download_limit)
);

create table if not exists download_events (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references download_grants(id) on delete cascade,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_download_events_grant_created on download_events (grant_id, created_at desc);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_photographers_updated_at on photographers;
create trigger trg_photographers_updated_at
before update on photographers
for each row execute function set_updated_at();

drop trigger if exists trg_galleries_updated_at on galleries;
create trigger trg_galleries_updated_at
before update on galleries
for each row execute function set_updated_at();

drop trigger if exists trg_gallery_assets_updated_at on gallery_assets;
create trigger trg_gallery_assets_updated_at
before update on gallery_assets
for each row execute function set_updated_at();

drop trigger if exists trg_packages_updated_at on packages;
create trigger trg_packages_updated_at
before update on packages
for each row execute function set_updated_at();

drop trigger if exists trg_carts_updated_at on carts;
create trigger trg_carts_updated_at
before update on carts
for each row execute function set_updated_at();

drop trigger if exists trg_cart_package_items_updated_at on cart_package_items;
create trigger trg_cart_package_items_updated_at
before update on cart_package_items
for each row execute function set_updated_at();

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at
before update on orders
for each row execute function set_updated_at();

create or replace function validate_cart_package_item_integrity()
returns trigger
language plpgsql
as $$
declare
  v_cart_gallery_id uuid;
  v_package_gallery_id uuid;
begin
  select gallery_id into v_cart_gallery_id
  from carts
  where id = new.cart_id;

  if v_cart_gallery_id is null then
    raise exception 'Invalid cart_id: %', new.cart_id;
  end if;

  select gallery_id into v_package_gallery_id
  from packages
  where id = new.package_id;

  if v_package_gallery_id is null then
    raise exception 'Invalid package_id: %', new.package_id;
  end if;

  if v_cart_gallery_id <> v_package_gallery_id then
    raise exception 'Package and cart must belong to the same gallery';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_cart_package_item_integrity on cart_package_items;
create trigger trg_validate_cart_package_item_integrity
before insert or update on cart_package_items
for each row execute function validate_cart_package_item_integrity();

create or replace function validate_cart_selection_integrity()
returns trigger
language plpgsql
as $$
declare
  v_cart_id uuid;
  v_cart_gallery_id uuid;
  v_asset_gallery_id uuid;
  v_item_allow_extra boolean;
  v_item_included_count integer;
  v_current_count integer;
begin
  select cpi.cart_id, c.gallery_id, cpi.allow_extra, cpi.included_count
    into v_cart_id, v_cart_gallery_id, v_item_allow_extra, v_item_included_count
  from cart_package_items cpi
  join carts c on c.id = cpi.cart_id
  where cpi.id = new.cart_package_item_id;

  if v_cart_id is null then
    raise exception 'Invalid cart_package_item_id: %', new.cart_package_item_id;
  end if;

  select ga.gallery_id
    into v_asset_gallery_id
  from gallery_assets ga
  where ga.id = new.asset_id;

  if v_asset_gallery_id is null then
    raise exception 'Invalid asset_id: %', new.asset_id;
  end if;

  if v_asset_gallery_id <> v_cart_gallery_id then
    raise exception 'Asset does not belong to the same gallery as the cart';
  end if;

  select count(*)
    into v_current_count
  from cart_package_selections cps
  where cps.cart_package_item_id = new.cart_package_item_id;

  if v_item_allow_extra = false and v_current_count >= v_item_included_count then
    raise exception 'Package selection limit exceeded for cart_package_item %', new.cart_package_item_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_cart_selection_integrity on cart_package_selections;
create trigger trg_validate_cart_selection_integrity
before insert on cart_package_selections
for each row execute function validate_cart_selection_integrity();

commit;
