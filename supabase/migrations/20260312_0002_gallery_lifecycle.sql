do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'galleries'
      and column_name = 'archive_after_days'
  ) then
    alter table galleries
      add column archive_after_days integer not null default 90;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'galleries'
      and column_name = 'never_auto_archive'
  ) then
    alter table galleries
      add column never_auto_archive boolean not null default false;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_galleries_archive_after_days_range'
  ) then
    alter table galleries
      add constraint chk_galleries_archive_after_days_range
      check (archive_after_days between 7 and 3650);
  end if;
end
$$;
