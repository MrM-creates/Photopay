create table if not exists photographer_sender_emails (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographers(id) on delete cascade,
  email text not null,
  email_normalized text not null,
  verified_at timestamptz,
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photographer_sender_emails_email_check check (position('@' in email) > 1),
  constraint photographer_sender_emails_unique_per_photographer unique (photographer_id, email_normalized)
);

create index if not exists idx_photographer_sender_emails_photographer
  on photographer_sender_emails (photographer_id);

drop trigger if exists trg_photographer_sender_emails_updated_at on photographer_sender_emails;
create trigger trg_photographer_sender_emails_updated_at
before update on photographer_sender_emails
for each row execute function set_updated_at();

insert into photographer_sender_emails (photographer_id, email, email_normalized)
select
  settings.photographer_id,
  extracted.email_value,
  lower(extracted.email_value)
from photographer_email_settings as settings
cross join lateral (
  select trim(regexp_replace(settings.smtp_from, '.*<([^>]+)>.*', '\1')) as email_value
) as extracted
where extracted.email_value <> ''
  and position('@' in extracted.email_value) > 1
on conflict (photographer_id, email_normalized) do nothing;
