-- Loop Phase 1 place index. Source data is independent of Loop community reviews.
-- Overture places: https://docs.overturemaps.org/guides/places/
create extension if not exists postgis with schema extensions;

create table if not exists public.loop_place_index (
  overture_id text primary key,
  name text not null check (length(btrim(name)) > 0),
  basic_category text,
  taxonomy_primary text,
  taxonomy_hierarchy text[] not null default '{}',
  full_address text,
  locality text,
  region text,
  country text,
  website text,
  confidence real check (confidence between 0 and 1),
  operating_status text,
  position extensions.geography(Point, 4326) not null,
  source_release text not null,
  source_datasets text[] not null default '{}',
  fetched_at timestamptz not null default now()
);
create index if not exists loop_place_index_spatial_idx
  on public.loop_place_index using gist (position);
create index if not exists loop_place_index_taxonomy_idx
  on public.loop_place_index (taxonomy_primary);
create index if not exists loop_place_index_basic_category_idx
  on public.loop_place_index (basic_category);
create index if not exists loop_place_index_source_release_idx
  on public.loop_place_index (source_release);

alter table public.loop_place_index enable row level security;
-- Server-only index. Community profiles/reviews will be kept separately.
revoke all on public.loop_place_index from anon, authenticated;
grant select, insert, update on public.loop_place_index to service_role;

create or replace function public.loop_search_index(
  in_lat double precision,
  in_lon double precision,
  in_radius_miles double precision,
  in_terms text[],
  in_limit integer default 35
)
returns table (
  overture_id text,
  name text,
  basic_category text,
  taxonomy_primary text,
  taxonomy_hierarchy text[],
  full_address text,
  locality text,
  region text,
  country text,
  website text,
  confidence real,
  operating_status text,
  latitude double precision,
  longitude double precision,
  distance_miles double precision,
  source_release text
)
language sql stable security invoker
set search_path = ''
as $$
  select p.overture_id, p.name, p.basic_category, p.taxonomy_primary,
    p.taxonomy_hierarchy, p.full_address, p.locality, p.region, p.country,
    p.website, p.confidence, p.operating_status,
    extensions.st_y(p.position::extensions.geometry),
    extensions.st_x(p.position::extensions.geometry),
    extensions.st_distance(
      p.position,
      extensions.st_setsrid(extensions.st_makepoint(in_lon, in_lat), 4326)::extensions.geography
    ) / 1609.344,
    p.source_release
  from public.loop_place_index as p
  where in_lat between -90 and 90
    and in_lon between -180 and 180
    and in_radius_miles between 0.1 and 100
    and p.operating_status is distinct from 'permanently_closed'
    and exists (
      select 1 from unnest(coalesce(in_terms, array[]::text[])) as term
      where length(btrim(term)) between 2 and 64
        and (
          p.name ilike '%' || term || '%'
          or p.taxonomy_primary ilike '%' || term || '%'
          or p.basic_category ilike '%' || term || '%'
          or exists (
            select 1 from unnest(p.taxonomy_hierarchy) as segment
            where segment ilike '%' || term || '%'
          )
        )
    )
    and extensions.st_dwithin(
      p.position,
      extensions.st_setsrid(extensions.st_makepoint(in_lon, in_lat), 4326)::extensions.geography,
      in_radius_miles * 1609.344
    )
  order by
    (case when p.taxonomy_primary = any(coalesce(in_terms,array[]::text[])) then 0 else 1 end),
    (case when p.name ilike '%' || coalesce(in_terms[1], '') || '%' then 0 else 1 end),
    extensions.st_distance(
      p.position,
      extensions.st_setsrid(extensions.st_makepoint(in_lon, in_lat), 4326)::extensions.geography
    ),
    p.confidence desc nulls last
  limit least(greatest(coalesce(in_limit, 35), 1), 60);
$$;
revoke all on function public.loop_search_index(double precision,double precision,double precision,text[],integer)
  from public, anon, authenticated;
grant execute on function public.loop_search_index(double precision,double precision,double precision,text[],integer)
  to service_role;
comment on table public.loop_place_index is
  'Server-only Overture place discovery index. Does not contain Loop reviews, scores, or private profiles.';
