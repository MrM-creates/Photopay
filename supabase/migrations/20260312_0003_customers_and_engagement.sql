begin;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographers(id) on delete cascade,
  full_name text not null,
  email text not null,
  email_normalized text not null,
  note text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (position('@' in email) > 1)
);

create unique index if not exists idx_customers_photographer_email_normalized
  on customers (photographer_id, email_normalized);

create index if not exists idx_customers_photographer_last_used
  on customers (photographer_id, last_used_at desc, created_at desc);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'galleries'
      and column_name = 'customer_id'
  ) then
    alter table galleries
      add column customer_id uuid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'galleries'
      and constraint_name = 'fk_galleries_customer'
  ) then
    alter table galleries
      add constraint fk_galleries_customer
      foreign key (customer_id) references customers(id) on delete set null;
  end if;
end
$$;

create index if not exists idx_galleries_customer on galleries (customer_id);

create table if not exists gallery_access_events (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references galleries(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_gallery_access_events_gallery_created
  on gallery_access_events (gallery_id, created_at desc);

drop trigger if exists trg_customers_updated_at on customers;
create trigger trg_customers_updated_at
before update on customers
for each row execute function set_updated_at();

commit;
