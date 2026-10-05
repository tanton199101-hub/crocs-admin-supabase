-- Private Amazon channel, intentionally separate from public catalog JSON.
-- Credentials are environment-only for this single-seller private-app MVP.
create table if not exists public.amazon_channel_config (
  id text primary key default 'default' check (id = 'default'),
  seller_id text not null default '',
  enabled boolean not null default false,
  marketplaces jsonb not null default '[]'::jsonb check (jsonb_typeof(marketplaces) = 'array'),
  updated_at timestamptz not null default now()
);
insert into public.amazon_channel_config(id) values ('default') on conflict do nothing;

create table if not exists public.amazon_custom_profiles (
  product_id text primary key,
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  version integer not null default 1 check (version > 0),
  confirmed_version integer,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.amazon_listings (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  variant_id text not null default '',
  marketplace_id text not null,
  seller_sku text not null check (length(seller_sku) between 1 and 80),
  asin text not null default '',
  product_type text not null,
  price_minor integer not null check (price_minor > 0),
  currency text not null check (currency in ('USD','GBP','EUR','JPY','AUD','CAD','SGD')),
  safety_stock integer not null default 2 check (safety_stock >= 0),
  handling_days integer not null default 3 check (handling_days between 1 and 30),
  image_url text not null default '',
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  revision integer not null default 1 check (revision > 0),
  status text not null default 'draft' check (status in ('draft','validated','submitted','live','attention','manual','failed','stale')),
  issues jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  submission_id text,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(product_id, variant_id, marketplace_id),
  unique(seller_sku, marketplace_id)
);

create table if not exists public.amazon_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.amazon_listings(id) on delete restrict,
  operation text not null check (operation in ('validate','publish','refresh','inventory')),
  payload_hash text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  status text not null default 'pending' check (status in ('pending','running','retry','succeeded','failed','stale')),
  attempts integer not null default 0,
  lock_token uuid,
  locked_until timestamptz,
  next_retry_at timestamptz not null default now(),
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists amazon_jobs_active_dedupe on public.amazon_sync_jobs(listing_id, operation, payload_hash)
where status in ('pending','running','retry');
create index if not exists amazon_jobs_due on public.amazon_sync_jobs(next_retry_at) where status in ('pending','retry','running');

alter table public.amazon_channel_config enable row level security;
alter table public.amazon_custom_profiles enable row level security;
alter table public.amazon_listings enable row level security;
alter table public.amazon_sync_jobs enable row level security;

-- Members can read non-secret operational data; all mutations go through the
-- authenticated server API. No client can mark a job successful or set live.
drop policy if exists "members read amazon config" on public.amazon_channel_config;
create policy "members read amazon config" on public.amazon_channel_config for select to authenticated using (public.is_store_member('default'));
drop policy if exists "members read amazon profiles" on public.amazon_custom_profiles;
create policy "members read amazon profiles" on public.amazon_custom_profiles for select to authenticated using (public.is_store_member('default'));
drop policy if exists "members read amazon listings" on public.amazon_listings;
create policy "members read amazon listings" on public.amazon_listings for select to authenticated using (public.is_store_member('default'));
drop policy if exists "members read amazon jobs" on public.amazon_sync_jobs;
create policy "members read amazon jobs" on public.amazon_sync_jobs for select to authenticated using (public.is_store_member('default'));
revoke all on public.amazon_channel_config, public.amazon_custom_profiles, public.amazon_listings, public.amazon_sync_jobs from anon, authenticated;
grant select on public.amazon_channel_config, public.amazon_custom_profiles, public.amazon_listings, public.amazon_sync_jobs to authenticated;
grant all on public.amazon_channel_config, public.amazon_custom_profiles, public.amazon_listings, public.amazon_sync_jobs to service_role;

create or replace function public.amazon_claim_job_v1()
returns setof public.amazon_sync_jobs language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select job.id into v_id from public.amazon_sync_jobs job
  where ((job.status in ('pending','retry') and job.next_retry_at <= now())
     or (job.status = 'running' and job.locked_until < now()))
    and job.attempts < 5
  order by job.created_at for update skip locked limit 1;
  if v_id is not null then
    return query update public.amazon_sync_jobs as job
    set status = 'running', attempts = job.attempts + 1,
        lock_token = gen_random_uuid(), locked_until = now() + interval '3 minutes', updated_at = now()
    where job.id = v_id returning job.*;
  end if;
end;
$$;
revoke all on function public.amazon_claim_job_v1() from public, anon, authenticated;
grant execute on function public.amazon_claim_job_v1() to service_role;

-- Compare revisions and profile versions under row locks. Only the current
-- lease may finish a job; a late worker can never overwrite newer mapping.
create or replace function public.amazon_finish_job_v1(
  p_id uuid, p_lock_token uuid, p_status text, p_result jsonb,
  p_listing_status text default null, p_issues jsonb default '[]'::jsonb,
  p_submission_id text default null, p_error text default null, p_delay_seconds integer default 0
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_job public.amazon_sync_jobs%rowtype; v_listing public.amazon_listings%rowtype; v_profile_version integer;
begin
  if p_status not in ('succeeded','failed','retry','stale') then raise exception 'Invalid job result'; end if;
  select * into v_job from public.amazon_sync_jobs where id = p_id for update;
  if not found or v_job.status <> 'running' or v_job.lock_token is distinct from p_lock_token then return false; end if;
  select * into v_listing from public.amazon_listings where id = v_job.listing_id for update;
  select version into v_profile_version from public.amazon_custom_profiles where product_id = v_listing.product_id;
  if v_listing.revision <> (v_job.snapshot->>'revision')::integer
     or coalesce(v_profile_version,0) <> coalesce((v_job.snapshot->>'profileVersion')::integer,0) then
    p_status := 'stale'; p_listing_status := null; p_error := 'Mapping/profile changed; validate again.';
  end if;
  update public.amazon_sync_jobs set status = p_status, result = p_result,
    last_error = left(p_error,1000), next_retry_at = now() + make_interval(secs => greatest(0,least(p_delay_seconds,3600))),
    lock_token = null, locked_until = null, updated_at = now() where id = p_id;
  if p_listing_status is not null and p_status <> 'retry' then
    update public.amazon_listings set status = p_listing_status, issues = p_issues,
      submission_id = coalesce(p_submission_id,submission_id), last_synced_at = now(), updated_at = now()
    where id = v_listing.id;
  end if;
  return true;
end;
$$;
revoke all on function public.amazon_finish_job_v1(uuid,uuid,text,jsonb,text,jsonb,text,text,integer) from public, anon, authenticated;
grant execute on function public.amazon_finish_job_v1(uuid,uuid,text,jsonb,text,jsonb,text,text,integer) to service_role;
