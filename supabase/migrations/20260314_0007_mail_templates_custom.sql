do $$
declare
  row_record record;
begin
  for row_record in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'notification_templates'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%template_key%'
  loop
    execute format('alter table public.notification_templates drop constraint if exists %I', row_record.conname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notification_templates_template_key_format'
      and conrelid = 'public.notification_templates'::regclass
  ) then
    alter table public.notification_templates
      add constraint notification_templates_template_key_format
      check (template_key ~ '^[a-z0-9_]{3,120}$');
  end if;
end $$;
