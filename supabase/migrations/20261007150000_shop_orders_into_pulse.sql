-- supabase/migrations/20261007150000_shop_orders_into_pulse.sql
-- SENTINEL: NB_SHOP_ORDERS_INTO_PULSE_V1
--
-- The shop's sales show up in Pulse. Tyler, 2026-10-07: "we got to make this
-- interactive with Pulse because our shop will get our sales and stuff in
-- Pulse." Both live in the one shared project (sspbripimqvfdkfbpubq), so Pulse
-- reads the shop's own receipts directly. No copy, no sync job, nothing to
-- drift.
--
-- Apply AFTER 20260918080727_shop_order_receipts.sql, which makes shop_orders
-- and locks it to the service role. This file opens exactly three things on
-- top of that and nothing else.
--
-- ── 1. PULSE STAFF READ EVERY ORDER AND MARK A PAID ONE SHIPPED ─────────────
-- public.is_staff() is the house helper, STABLE SECURITY DEFINER, role in
-- super_admin, admin, manager or team (see neonburro-pulse
-- supabase/migrations/20260927170000_staff_scope_the_twelve.sql). An anonymous
-- session minted by the public send-a-burro page carries the authenticated
-- role, which is why every policy here asks is_staff() and never just
-- "authenticated".
--
-- Staff may change two columns, status and fulfilled_at, and only between
-- paid and fulfilled. pending, processing, failed, expired and refunded belong
-- to Stripe and the chain, which write them through the service role. Pulse
-- shows those and never argues with them (Warbleur, 2026-10-07). The column
-- grant and the policy both hold that line, so a bug in the Pulse page cannot
-- move an order Stripe owns.
--
-- ── 2. STOCK IS COUNTED IN PULSE ────────────────────────────────────────────
-- shop_inventory was made by hand in the dashboard and no repo holds its
-- schema. Code only ever relies on product_id, variant_id, on_hand and
-- updated_at, and so does this file. Checkout refuses a shipped piece whose
-- row is older than seven days (_shop-catalog.js, INVENTORY_FRESH_MS), so a
-- count is a write of on_hand and updated_at together, and Pulse is now where
-- Tyler does it.
--
-- Row level security is switched on here. If it was off, Supabase's default
-- grants let anybody holding the public anon key write stock, and this closes
-- that. Reads stay public on purpose: shop-inventory.js serves counts to the
-- product pages and says so in its header. Staff may update on_hand and
-- updated_at and nothing else. Nobody but the service role inserts or deletes.
--
-- BEFORE APPLYING, read what is already there, because nobody has seen it:
--   select policyname, cmd, roles, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename = 'shop_inventory';
-- Any existing policy that lets anon or authenticated write must go. The
-- policies below are created only when absent, so they never replace one.
--
-- ── 3. A SALE TAKES ITS STOCK, ONCE ─────────────────────────────────────────
-- Until now nothing ever lowered on_hand. Three shirts on the shelf and five
-- buyers would all have passed the stock check. shop_take_stock(order) lowers
-- each shipped line by its quantity, never below zero, the moment an order is
-- paid. It is idempotent inside the database: it stamps stock_taken_at and
-- does nothing if the stamp is already there, so a replayed Stripe event or a
-- second chain sweep cannot take stock twice. It leaves updated_at alone, a
-- sale is not a count. If a trigger on shop_inventory stamps updated_at on
-- every write, a sale would look like a fresh count, so check for one when
-- reading the policies above.
--
-- Callers: markOrderPaid in netlify/functions/_shop-catalog.js, from the Stripe
-- webhook and from settleRow on the direct Solana rail. Service role only.
--
-- ── 4. THE PIECES THE SEPTEMBER SEED MISSED ─────────────────────────────────
-- The September file seeds every shirt design. caps, the halfway nook and the
-- nibble wands sell too (they are in src/data/products-craft.js and
-- products-wearable.js) and had no rows, so checkout refused them as out of
-- stock forever. Every new row starts at zero, so this opens nothing for sale.
--
-- Additive throughout. Nothing is dropped, every create is guarded.
--
-- No oxford commas, no em dashes.

-- 1. orders ------------------------------------------------------------------

alter table public.shop_orders
  add column if not exists stock_taken_at timestamptz;

grant select on table public.shop_orders to authenticated;
grant update (status, fulfilled_at) on table public.shop_orders to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shop_orders' and policyname = 'shop_orders_staff_read'
  ) then
    create policy shop_orders_staff_read on public.shop_orders
      for select to authenticated
      using (public.is_staff());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shop_orders' and policyname = 'shop_orders_staff_ship'
  ) then
    create policy shop_orders_staff_ship on public.shop_orders
      for update to authenticated
      using (public.is_staff() and status in ('paid', 'fulfilled'))
      with check (public.is_staff() and status in ('paid', 'fulfilled'));
  end if;
end;
$$;

-- 2. stock -------------------------------------------------------------------

alter table public.shop_inventory enable row level security;

revoke insert, update, delete, truncate on table public.shop_inventory from anon, authenticated;
grant select on table public.shop_inventory to anon, authenticated;
grant update (on_hand, updated_at) on table public.shop_inventory to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shop_inventory' and policyname = 'shop_inventory_public_read'
  ) then
    create policy shop_inventory_public_read on public.shop_inventory
      for select to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shop_inventory' and policyname = 'shop_inventory_staff_count'
  ) then
    create policy shop_inventory_staff_count on public.shop_inventory
      for update to authenticated
      using (public.is_staff())
      with check (public.is_staff() and on_hand >= 0);
  end if;
end;
$$;

-- 3. a sale takes its stock --------------------------------------------------

create or replace function public.shop_take_stock(p_order uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
  v_line jsonb;
  v_taken integer := 0;
begin
  update public.shop_orders
     set stock_taken_at = now()
   where id = p_order
     and stock_taken_at is null
     and status in ('paid', 'fulfilled')
  returning items into v_items;

  if v_items is null then
    return 0;
  end if;

  for v_line in select value from jsonb_array_elements(v_items) loop
    if coalesce(v_line->>'delivery', 'ship') <> 'ship' then
      continue;
    end if;
    update public.shop_inventory
       set on_hand = greatest(on_hand - coalesce((v_line->>'quantity')::integer, 0), 0)
     where product_id = v_line->>'id'
       and coalesce(variant_id, '') = coalesce(v_line->>'selectedDesignId', '');
    if found then
      v_taken := v_taken + 1;
    end if;
  end loop;

  return v_taken;
end;
$$;

revoke all on function public.shop_take_stock(uuid) from public, anon, authenticated;
grant execute on function public.shop_take_stock(uuid) to service_role;

-- 4. the missing rows, all at zero -------------------------------------------

insert into public.shop_inventory (product_id, variant_id, on_hand)
values
  ('caps', 'neonburro-greengage', 0),
  ('caps', 'neonburro-khaki', 0),
  ('caps', 'neonburro-black', 0),
  ('caps', 'theburroship-serviceberry', 0),
  ('caps', 'theburroship-khaki', 0),
  ('caps', 'theburroship-black', 0),
  ('halfway-nook', 'titanium', 0),
  ('halfway-nook', 'copper', 0)
on conflict (product_id, variant_id) do nothing;

insert into public.shop_inventory (product_id, variant_id, on_hand)
select 'nibble-wands', null, 0
where not exists (
  select 1 from public.shop_inventory
  where product_id = 'nibble-wands' and variant_id is null
);
