alter table photographers
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists postal_address text,
  add column if not exists mail_salutation_mode text;

update photographers
set mail_salutation_mode = coalesce(mail_salutation_mode, 'first_name')
where mail_salutation_mode is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'photographers_mail_salutation_mode_check'
      and conrelid = 'public.photographers'::regclass
  ) then
    alter table photographers
      add constraint photographers_mail_salutation_mode_check
      check (mail_salutation_mode in ('first_name', 'full_name'));
  end if;
end $$;

create table if not exists photographer_email_settings (
  photographer_id uuid primary key references photographers(id) on delete cascade,
  smtp_host text not null,
  smtp_port integer not null check (smtp_port > 0 and smtp_port <= 65535),
  smtp_secure boolean not null default false,
  smtp_user text not null,
  smtp_password text not null,
  smtp_from text not null,
  smtp_reply_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_photographer_email_settings_updated_at on photographer_email_settings;
create trigger trg_photographer_email_settings_updated_at
before update on photographer_email_settings
for each row execute function set_updated_at();
