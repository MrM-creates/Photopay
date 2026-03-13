create table if not exists package_templates (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographers(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'CHF',
  included_count integer not null check (included_count > 0),
  allow_extra boolean not null default false,
  extra_unit_price_cents integer,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint package_templates_extra_rule check (
    (allow_extra = true and extra_unit_price_cents is not null and extra_unit_price_cents >= 0)
    or
    (allow_extra = false and extra_unit_price_cents is null)
  )
);

create index if not exists idx_package_templates_photographer_sort
  on package_templates (photographer_id, active, sort_order, created_at);

create table if not exists notification_templates (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographers(id) on delete cascade,
  template_key text not null check (template_key in ('gallery_share', 'gallery_reminder', 'download_ready')),
  subject text not null,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (photographer_id, template_key)
);

create index if not exists idx_notification_templates_photographer_key
  on notification_templates (photographer_id, template_key);

drop trigger if exists trg_package_templates_updated_at on package_templates;
create trigger trg_package_templates_updated_at
before update on package_templates
for each row execute function set_updated_at();

drop trigger if exists trg_notification_templates_updated_at on notification_templates;
create trigger trg_notification_templates_updated_at
before update on notification_templates
for each row execute function set_updated_at();
