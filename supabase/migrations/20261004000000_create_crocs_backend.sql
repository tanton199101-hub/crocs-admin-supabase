-- Crocs Studio backend state store.
-- The current UI is a static prototype, so the complete validated store model
-- is persisted as JSONB while Supabase provides durable storage, timestamps and
-- an audit trail. Split tables can be introduced later without changing the UI.

create extension if not exists pgcrypto;

create table if not exists public.store_state (
  id text primary key default 'default' check (id = 'default'),
  payload jsonb not null,
  version integer not null default 1 check (version = 1),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,
  constraint store_state_payload_object check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.store_events (
  id uuid primary key default gen_random_uuid(),
  state_id text not null default 'default' references public.store_state(id) on delete cascade,
  event_type text not null default 'state.sync',
  detail text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists store_events_created_at_idx on public.store_events (created_at desc);

create or replace function public.set_store_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists store_state_updated_at on public.store_state;
create trigger store_state_updated_at
before update on public.store_state
for each row execute function public.set_store_state_updated_at();

alter table public.store_state enable row level security;
alter table public.store_events enable row level security;

drop policy if exists "public can read the default storefront state" on public.store_state;
create policy "public can read the default storefront state"
on public.store_state for select
to anon, authenticated
using (id = 'default');

-- This policy keeps the no-login demo deploy usable. Before handling real
-- customer/order data, replace it with authenticated user or team policies.
drop policy if exists "demo clients can insert the default state" on public.store_state;
create policy "demo clients can insert the default state"
on public.store_state for insert
to anon, authenticated
with check (id = 'default');

drop policy if exists "demo clients can update the default state" on public.store_state;
create policy "demo clients can update the default state"
on public.store_state for update
to anon, authenticated
using (id = 'default')
with check (id = 'default');

drop policy if exists "public can read state events" on public.store_events;
create policy "public can read state events"
on public.store_events for select
to anon, authenticated
using (state_id = 'default');

drop policy if exists "demo clients can append state events" on public.store_events;
create policy "demo clients can append state events"
on public.store_events for insert
to anon, authenticated
with check (state_id = 'default');

grant select, insert, update on public.store_state to anon, authenticated;
grant select, insert on public.store_events to anon, authenticated;
