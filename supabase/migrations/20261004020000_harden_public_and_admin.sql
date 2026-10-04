-- Harden the demo boundary before real customer/order data is used.
-- Public traffic receives a deliberately small storefront projection. Admin
-- traffic must have a Supabase Auth session and a store membership.

create table if not exists public.store_members (
  store_id text not null default 'default' check (store_id = 'default'),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (store_id, user_id)
);

alter table public.store_state drop constraint if exists store_state_version_check;
alter table public.store_state add constraint store_state_version_check check (version >= 1);

create or replace function public.is_store_member(p_store_id text default 'default')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.store_members as member
      where member.store_id = p_store_id
        and member.user_id = (select auth.uid())
    );
$$;

create or replace function public.is_store_owner(p_store_id text default 'default')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.store_members as member
      where member.store_id = p_store_id
        and member.user_id = (select auth.uid())
        and member.role = 'owner'
    );
$$;

alter table public.store_members enable row level security;
alter table public.store_state enable row level security;
alter table public.store_events enable row level security;

drop policy if exists "members can read store members" on public.store_members;
create policy "members can read store members"
on public.store_members for select
to authenticated
using (public.is_store_member(store_id));

drop policy if exists "owners can manage store members" on public.store_members;
create policy "owners can manage store members"
on public.store_members for all
to authenticated
using (public.is_store_owner(store_id))
with check (public.is_store_owner(store_id));

drop policy if exists "public can read the default storefront state" on public.store_state;
drop policy if exists "demo clients can insert the default state" on public.store_state;
drop policy if exists "demo clients can update the default state" on public.store_state;
drop policy if exists "members can read the default admin state" on public.store_state;
create policy "members can read the default admin state"
on public.store_state for select
to authenticated
using (public.is_store_member(id));

drop policy if exists "members can insert the default admin state" on public.store_state;
create policy "members can insert the default admin state"
on public.store_state for insert
to authenticated
with check (public.is_store_member(id));

drop policy if exists "members can update the default admin state" on public.store_state;
create policy "members can update the default admin state"
on public.store_state for update
to authenticated
using (public.is_store_member(id))
with check (public.is_store_member(id));

drop policy if exists "public can read state events" on public.store_events;
drop policy if exists "demo clients can append state events" on public.store_events;
drop policy if exists "members can read state events" on public.store_events;
create policy "members can read state events"
on public.store_events for select
to authenticated
using (public.is_store_member(state_id));

drop policy if exists "members can append state events" on public.store_events;
create policy "members can append state events"
on public.store_events for insert
to authenticated
with check (public.is_store_member(state_id));

revoke all on public.store_members from anon, authenticated;
grant select, insert, update, delete on public.store_members to authenticated;
revoke all on public.store_state from anon, authenticated;
grant select, insert, update on public.store_state to authenticated;
revoke all on public.store_events from anon, authenticated;
grant select, insert on public.store_events to authenticated;

create or replace function public.claim_default_store()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_member public.store_members%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Đăng nhập để truy cập admin.';
  end if;

  select * into current_member
  from public.store_members
  where store_id = 'default' and user_id = current_user_id;
  if found then
    return jsonb_build_object('member', true, 'role', current_member.role);
  end if;

  if exists (select 1 from public.store_members where store_id = 'default') then
    return jsonb_build_object('member', false);
  end if;

  insert into public.store_members (store_id, user_id, role)
  values ('default', current_user_id, 'owner');
  return jsonb_build_object('member', true, 'role', 'owner', 'claimed', true);
end;
$$;

create or replace function public.admin_state_v1(p_state_id text default 'default')
returns table (id text, payload jsonb, version integer, updated_at timestamptz, updated_by text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_store_member(p_state_id) then
    raise exception using errcode = '42501', message = 'Tài khoản chưa có quyền quản trị cửa hàng.';
  end if;
  return query
    select state.id, state.payload, state.version, state.updated_at, state.updated_by
    from public.store_state as state
    where state.id = p_state_id;
end;
$$;

create or replace function public.admin_state_update_v1(
  p_state_id text,
  p_payload jsonb,
  p_expected_version integer,
  p_event_type text default 'state.sync'
)
returns table (version integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if not public.is_store_member(p_state_id) then
    raise exception using errcode = '42501', message = 'Tài khoản chưa có quyền quản trị cửa hàng.';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Dữ liệu cửa hàng phải là JSON object.';
  end if;
  update public.store_state as state
  set payload = p_payload,
      version = state.version + 1,
      updated_by = (select auth.uid())::text
  where state.id = p_state_id and state.version = p_expected_version
  returning state.version, state.updated_at into next_version, updated_at;
  if next_version is null then
    raise exception using errcode = '40001', message = 'Dữ liệu cửa hàng đã thay đổi. Tải lại trước khi lưu tiếp.';
  end if;
  insert into public.store_events (state_id, event_type, detail)
  values (p_state_id, left(coalesce(p_event_type, 'state.sync'), 120), 'admin state update');
  version := next_version;
  return next;
end;
$$;

-- Only this projection is exposed to the public storefront. It deliberately
-- omits customers, orders, activity, draft theme data and admin settings.
create or replace function public.storefront_public_v1()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'store', jsonb_build_object(
      'name', coalesce(state.payload->'settings'->>'name', 'Crocs UK'),
      'currency', coalesce(state.payload->'settings'->>'currency', 'GBP')
    ),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', product->>'id',
        'title', product->>'title',
        'sku', product->>'sku',
        'price', coalesce((product->>'price')::integer, 0),
        'stock', greatest(coalesce((product->>'stock')::integer, 0), 0),
        'status', 'Active',
        'image', product->>'image',
        'imageAlt', product->>'imageAlt',
        'brand', product->>'brand',
        'slug', product->>'slug',
        'category', product->>'category',
        'description', product->>'description',
        'seo', coalesce(product->'seo', '{}'::jsonb),
        'options', coalesce(product->'options', '[]'::jsonb),
        'variants', coalesce(product->'variants', '[]'::jsonb),
        'colour', product->>'colour',
        'sizes', product->'sizes'
      ) order by product->>'title')
      from jsonb_array_elements(coalesce(state.payload->'products', '[]'::jsonb)) as item(product)
      where product->>'status' = 'Active'
    ), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(collection order by collection->>'title')
      from jsonb_array_elements(coalesce(state.payload->'collections', '[]'::jsonb)) as item(collection)
      where collection->>'status' = 'Active'
    ), '[]'::jsonb),
    'theme', coalesce(state.payload->'theme'->'published', '{}'::jsonb),
    'menus', coalesce(state.payload->'menus', '[]'::jsonb)
  )
  from public.store_state as state
  where state.id = 'default';
$$;

create or replace function public.storefront_theme_v1()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'store', jsonb_build_object(
      'name', coalesce(state.payload->'settings'->>'name', 'Crocs UK'),
      'currency', coalesce(state.payload->'settings'->>'currency', 'GBP')
    ),
    'theme', coalesce(state.payload->'theme'->'published', '{}'::jsonb),
    'menus', coalesce(state.payload->'menus', '[]'::jsonb)
  )
  from public.store_state as state
  where state.id = 'default';
$$;

create or replace function public.storefront_catalog_v1()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.storefront_public_v1();
$$;

alter function public.create_storefront_order(text, text, text, text, text, text, text, jsonb)
  set search_path = '';

revoke all on function public.claim_default_store() from public, anon, authenticated;
grant execute on function public.claim_default_store() to authenticated;
revoke all on function public.is_store_member(text) from public, anon, authenticated;
grant execute on function public.is_store_member(text) to authenticated;
revoke all on function public.is_store_owner(text) from public, anon, authenticated;
grant execute on function public.is_store_owner(text) to authenticated;
revoke all on function public.admin_state_v1(text) from public, anon, authenticated;
grant execute on function public.admin_state_v1(text) to authenticated;
revoke all on function public.admin_state_update_v1(text, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.admin_state_update_v1(text, jsonb, integer, text) to authenticated;
revoke all on function public.storefront_public_v1() from public, anon, authenticated;
grant execute on function public.storefront_public_v1() to anon, authenticated;
revoke all on function public.storefront_theme_v1() from public, anon, authenticated;
grant execute on function public.storefront_theme_v1() to anon, authenticated;
revoke all on function public.storefront_catalog_v1() from public, anon, authenticated;
grant execute on function public.storefront_catalog_v1() to anon, authenticated;
