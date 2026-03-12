begin;

-- Normalize existing duplicates so we can enforce uniqueness safely.
with ranked as (
  select
    id,
    photographer_id,
    title,
    row_number() over (
      partition by photographer_id, lower(btrim(title))
      order by created_at asc, id asc
    ) as rn
  from galleries
),
duplicates as (
  select id
  from ranked
  where rn > 1
)
update galleries g
set title = left(g.title, 108) || ' #' || left(g.id::text, 8)
from duplicates d
where g.id = d.id;

create unique index if not exists uq_galleries_photographer_title_normalized
  on galleries (photographer_id, lower(btrim(title)));

commit;
