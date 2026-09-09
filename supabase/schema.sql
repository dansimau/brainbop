-- BrainBop cloud sync schema. Run once in the Supabase SQL editor.
-- One append-only table. Each row is one immutable record (a play, or the one-time
-- legacy baseline). All stats are derived client-side from the set of records,
-- so there is nothing to update or reconcile and no update/delete policies exist.

create table public.recs (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  t bigint not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index recs_user_created on public.recs (user_id, created_at, id);

alter table public.recs enable row level security;
create policy recs_select on public.recs for select using (auth.uid() = user_id);
create policy recs_insert on public.recs for insert with check (auth.uid() = user_id);

-- Signed-in users need table privileges as well as RLS policies. Supabase normally
-- grants these by default; this makes it explicit and is safe to re-run.
grant select, insert on public.recs to authenticated;
