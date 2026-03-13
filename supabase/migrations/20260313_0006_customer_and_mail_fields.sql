alter table customers
  add column if not exists customer_number text,
  add column if not exists first_name text,
  add column if not exists last_name text;

update customers
set
  first_name = coalesce(first_name, split_part(trim(full_name), ' ', 1)),
  last_name = coalesce(
    last_name,
    nullif(trim(regexp_replace(trim(full_name), '^\S+\s*', '')), '')
  )
where first_name is null or last_name is null;

with ranked as (
  select
    id,
    photographer_id,
    row_number() over (partition by photographer_id order by created_at asc, id asc) as rn
  from customers
  where customer_number is null
)
update customers c
set customer_number = 'K-' || lpad(r.rn::text, 4, '0')
from ranked r
where c.id = r.id;

create unique index if not exists idx_customers_photographer_customer_number
  on customers (photographer_id, customer_number)
  where customer_number is not null;

alter table notification_templates
  add column if not exists name text;

update notification_templates
set name = case template_key
  when 'gallery_share' then 'Freigabe-Link'
  when 'gallery_reminder' then 'Erinnerung'
  when 'download_ready' then 'Download bereit'
  else template_key
end
where name is null or trim(name) = '';

alter table notification_templates
  alter column name set not null;
