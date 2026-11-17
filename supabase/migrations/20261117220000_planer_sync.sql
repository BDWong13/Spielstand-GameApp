-- Planer: Sync zwischen Geräten und Zugriff für Claude-Agenten.
-- Jede Aufgabe, jeder Termin, jedes Projekt und jede Vorlage ist eine Zeile; die Felder stehen in `data` (JSON).
create table if not exists public.planer_items (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('task', 'event', 'project', 'template', 'settings')),
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);
create index if not exists planer_items_user_updated on public.planer_items (user_id, updated_at);

-- Zeitstempel immer vom Server setzen (auch bei Änderungen per SQL durch einen Agenten).
create or replace function public.planer_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists planer_items_touch on public.planer_items;
create trigger planer_items_touch before insert or update on public.planer_items
  for each row execute function public.planer_touch();

alter table public.planer_items enable row level security;
create policy "planer_items: eigene lesen"    on public.planer_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "planer_items: eigene anlegen"  on public.planer_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "planer_items: eigene ändern"   on public.planer_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "planer_items: eigene löschen"  on public.planer_items for delete to authenticated using ((select auth.uid()) = user_id);

-- Geheimer Link für das Kalender-Abo (ein Link pro Person).
create table if not exists public.planer_feeds (
  token      text        primary key check (length(token) >= 24),
  user_id    uuid        not null unique default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.planer_feeds enable row level security;
create policy "planer_feeds: eigene lesen"   on public.planer_feeds for select to authenticated using ((select auth.uid()) = user_id);
create policy "planer_feeds: eigene anlegen" on public.planer_feeds for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "planer_feeds: eigene löschen" on public.planer_feeds for delete to authenticated using ((select auth.uid()) = user_id);

-- Live-Änderungen an alle Geräte verteilen.
alter publication supabase_realtime add table public.planer_items;

-- Lesefreundliche Sicht für Agenten (respektiert RLS über security_invoker).
create or replace view public.planer_tasks with (security_invoker = true) as
select user_id, id,
       data->>'title'      as title,
       (data->>'due')      as due,
       data->>'dueTime'    as due_time,
       (data->>'plan')     as plan,
       data->>'planTime'   as plan_time,
       (data->>'prio')::int as prio,
       (data->>'est')::int  as est_min,
       data->>'status'     as status,
       data->>'waitingFor' as waiting_for,
       (data->>'done')::boolean as done,
       data->>'project'    as project_id,
       updated_at
from public.planer_items where kind = 'task' and not deleted;

create or replace view public.planer_events with (security_invoker = true) as
select user_id, id,
       data->>'title' as title, data->>'date' as date, data->>'endDate' as end_date,
       data->>'start' as start_time, data->>'end' as end_time,
       (data->>'allDay')::boolean as all_day, data->>'source' as source, updated_at
from public.planer_items where kind = 'event' and not deleted;
