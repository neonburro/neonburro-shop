-- supabase/migrations/20260918080727_shop_order_receipts.sql
-- SENTINEL: NB_SHOP_ORDER_RECEIPTS_V1
--
-- One durable order receipt per payment rail. The browser can disappear after
-- a redirect or wallet handoff, so Stripe and direct Solana both write here
-- before they return a payable request. Public API roles get no access. Tyler
-- can inspect and edit the rows in Supabase Table Editor.
--
-- This migration also makes the shirt inventory complete at the design level.
-- Every new row starts at zero, so applying it never opens a shirt for sale.
-- Tyler must enter a fresh positive count before checkout will accept it.
--
-- No oxford commas, no em dashes.

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  checkout_key text not null,
  rail text not null,
  provider_reference text not null,
  status text not null default 'pending',
  currency text not null,
  amount_usd numeric(12, 2) not null,
  amount_token numeric(30, 9),
  discount_bps integer not null default 0,
  price_source text,
  price_quoted_at timestamptz,
  customer jsonb not null default '{}'::jsonb,
  items jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  fulfilled_at timestamptz,
  constraint shop_orders_rail_check check (rail in ('stripe', 'solana_direct')),
  constraint shop_orders_status_check check (status in ('pending', 'processing', 'paid', 'expired', 'failed', 'fulfilled', 'refunded')),
  constraint shop_orders_currency_check check (currency in ('USD', 'USDC', 'SOL')),
  constraint shop_orders_amount_usd_check check (amount_usd > 0),
  constraint shop_orders_amount_token_check check (amount_token is null or amount_token > 0),
  constraint shop_orders_discount_bps_check check (discount_bps between 0 and 5000),
  constraint shop_orders_customer_check check (jsonb_typeof(customer) = 'object'),
  constraint shop_orders_items_check check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  constraint shop_orders_rail_provider_unique unique (rail, provider_reference),
  constraint shop_orders_rail_checkout_unique unique (rail, checkout_key)
);

comment on table public.shop_orders is
  'One idempotent shop receipt per checkout rail. Service role only through the API, editable by Tyler in Table Editor.';

alter table public.shop_orders enable row level security;
revoke all on table public.shop_orders from anon, authenticated;
grant all on table public.shop_orders to service_role;

create or replace function public.touch_shop_order_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_shop_order_updated_at() from public, anon, authenticated;
grant execute on function public.touch_shop_order_updated_at() to service_role;

drop trigger if exists shop_orders_touch_updated_at on public.shop_orders;
create trigger shop_orders_touch_updated_at
before update on public.shop_orders
for each row execute function public.touch_shop_order_updated_at();

alter table public.solana_payments
  add column if not exists checkout_key text,
  add column if not exists price_source text,
  add column if not exists price_quoted_at timestamptz,
  add column if not exists price_crosscheck_usd numeric,
  add column if not exists price_spread_bps integer,
  add column if not exists order_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'solana_payments_order_id_fkey'
      and conrelid = 'public.solana_payments'::regclass
  ) then
    alter table public.solana_payments
      add constraint solana_payments_order_id_fkey
      foreign key (order_id) references public.shop_orders(id) on delete set null;
  end if;
end;
$$;

create unique index if not exists solana_payments_signature_unique
  on public.solana_payments(signature)
  where signature is not null;

create unique index if not exists solana_payments_checkout_key_unique
  on public.solana_payments(checkout_key)
  where checkout_key is not null;

update public.shop_inventory
set variant_id = 'milk'
where product_id = 'blanks'
  and variant_id is null
  and not exists (
    select 1
    from public.shop_inventory existing
    where existing.product_id = 'blanks'
      and existing.variant_id = 'milk'
  );

insert into public.shop_inventory (product_id, variant_id, on_hand)
values
  ('theburroship', 'milk', 0),
  ('theburroship', 'oat', 0),
  ('theburroship', 'wheat', 0),
  ('theburroship', 'sage', 0),
  ('theburroship', 'greengage', 0),
  ('theburroship', 'persimmon', 0),
  ('theburroship', 'serviceberry', 0),
  ('theburroship', 'pinyon', 0),
  ('neonburro-tee', 'milk', 0),
  ('neonburro-tee', 'salt', 0),
  ('neonburro-tee', 'sage', 0),
  ('neonburro-tee', 'greengage', 0),
  ('neonburro-tee', 'serviceberry', 0),
  ('neonburro-tee', 'persimmon', 0),
  ('neonburro-tee', 'pinyon', 0),
  ('blanks', 'milk', 0),
  ('blanks', 'salt', 0),
  ('blanks', 'sage', 0),
  ('blanks', 'greengage', 0),
  ('blanks', 'serviceberry', 0),
  ('blanks', 'persimmon', 0),
  ('blanks', 'pinyon', 0),
  ('horizon', 'greengage', 0),
  ('horizon', 'indigo', 0),
  ('editions', 'prairie-dog', 0),
  ('editions', 'prairie-dog-pocket', 0),
  ('editions', 'diver', 0),
  ('editions', 'diver-pocket', 0),
  ('editions', 'warbleur', 0),
  ('editions', 'warbleur-pocket', 0),
  ('editions', 'crab', 0),
  ('editions', 'crab-pocket', 0),
  ('editions', 'airship-over-the-rocks', 0),
  ('editions', 'airship-night', 0),
  ('editions', 'canyon-doorway', 0)
on conflict (product_id, variant_id) do nothing;
