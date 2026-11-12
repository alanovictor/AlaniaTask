-- Alania Task — etapa 4: tarefas recorrentes.
-- Cada regra gera uma tarefa normal no dia de cada ocorrência (até hoje).
-- Ocorrências não concluídas acumulam (ficam atrasadas). Geração: chamada pelo app ao abrir
-- (com a data local) e por um agendamento diário no banco (pg_cron).

create table if not exists public.recurrences (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title                text not null check (char_length(title) between 1 and 200),
  description          text,
  area_id              uuid references public.areas (id) on delete set null,
  priority             text not null default 'medium' check (priority in ('urgent', 'high', 'medium', 'low')),
  time                 time,
  requires_validation  boolean not null default false,
  -- regra
  freq                 text not null default 'weekly' check (freq in ('daily', 'weekly', 'monthly', 'yearly')),
  every_n              integer not null default 1 check (every_n between 1 and 365),
  weekdays             smallint[] not null default '{}',          -- 0 = segunda … 6 = domingo (semanal)
  month_mode           text not null default 'day' check (month_mode in ('day', 'nth')),
  month_day            smallint check (month_day = -1 or month_day between 1 and 31),   -- -1 = último dia
  nth                  smallint check (nth = -1 or nth between 1 and 4),                -- -1 = última
  nth_weekday          smallint check (nth_weekday between 0 and 6),
  start_date           date not null default current_date,
  end_type             text not null default 'never' check (end_type in ('never', 'until', 'count')),
  until_date           date,
  max_count            integer check (max_count is null or max_count >= 1),
  -- estado
  active               boolean not null default true,
  last_generated       date,
  generated_count      integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.tasks
  add column if not exists recurrence_id uuid references public.recurrences (id) on delete set null,
  add column if not exists occurrence_date date;

-- uma tarefa por ocorrência
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_recurrence_occurrence_key') then
    alter table public.tasks add constraint tasks_recurrence_occurrence_key unique (recurrence_id, occurrence_date);
  end if;
end;
$$;

alter table public.recurrences enable row level security;
drop policy if exists "own rows" on public.recurrences;
create policy "own rows" on public.recurrences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.recurrences to authenticated;
revoke all on public.recurrences from anon;

-- ---------- regra: a data d é uma ocorrência? ----------
create or replace function public.recurrence_matches(r public.recurrences, d date)
returns boolean
language plpgsql
stable
as $$
declare
  wd        int := extract(isodow from d)::int - 1;            -- 0 = segunda
  last_day  int := extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int;
  dd        int := extract(day from d)::int;
  months    int;
  target    int;
begin
  if d < r.start_date then return false; end if;
  if r.end_type = 'until' and r.until_date is not null and d > r.until_date then return false; end if;

  if r.freq = 'daily' then
    return (d - r.start_date) % r.every_n = 0;

  elsif r.freq = 'weekly' then
    if coalesce(array_length(r.weekdays, 1), 0) = 0 then
      if wd <> extract(isodow from r.start_date)::int - 1 then return false; end if;
    elsif not (wd = any (r.weekdays)) then
      return false;
    end if;
    return ((date_trunc('week', d)::date - date_trunc('week', r.start_date)::date) / 7) % r.every_n = 0;

  elsif r.freq = 'monthly' then
    months := (extract(year from d)::int * 12 + extract(month from d)::int)
            - (extract(year from r.start_date)::int * 12 + extract(month from r.start_date)::int);
    if months < 0 or months % r.every_n <> 0 then return false; end if;
    if r.month_mode = 'nth' then
      if wd <> coalesce(r.nth_weekday, extract(isodow from r.start_date)::int - 1) then return false; end if;
      if coalesce(r.nth, 1) = -1 then
        return dd + 7 > last_day;
      end if;
      return (dd - 1) / 7 + 1 = coalesce(r.nth, 1);
    end if;
    target := coalesce(r.month_day, extract(day from r.start_date)::int);
    if target = -1 or target > last_day then target := last_day; end if;
    return dd = target;

  else -- yearly: mesmo dia e mês da data de início
    if (extract(year from d)::int - extract(year from r.start_date)::int) % r.every_n <> 0 then return false; end if;
    if extract(month from d) <> extract(month from r.start_date) then return false; end if;
    target := extract(day from r.start_date)::int;
    if target > last_day then target := last_day; end if;
    return dd = target;
  end if;
end;
$$;

-- ---------- gera as tarefas pendentes até p_today ----------
-- Pelo app: só as regras do usuário logado. Pelo agendamento (sem usuário): todas.
create or replace function public.generate_recurring_tasks(p_today date default null)
returns integer
language plpgsql
as $$
declare
  r     public.recurrences;
  d     date;
  upto  date;
  made  int := 0;
begin
  for r in
    select * from public.recurrences
     where active and (auth.uid() is null or user_id = auth.uid())
     for update skip locked
  loop
    upto := coalesce(p_today, (now() at time zone 'America/Sao_Paulo')::date);
    if r.end_type = 'until' and r.until_date is not null and r.until_date < upto then
      upto := r.until_date;
    end if;
    -- recomeça do dia seguinte ao último gerado; no máximo 1 ano para trás
    d := greatest(r.start_date, coalesce(r.last_generated + 1, r.start_date), upto - 366);

    while d <= upto loop
      exit when r.end_type = 'count' and r.generated_count >= coalesce(r.max_count, 0);
      if public.recurrence_matches(r, d) then
        insert into public.tasks (user_id, area_id, title, description, priority, date, time,
                                  requires_validation, recurrence_id, occurrence_date)
        values (r.user_id, r.area_id, r.title, r.description, r.priority, d, r.time,
                r.requires_validation, r.id, d)
        on conflict (recurrence_id, occurrence_date) do nothing;
        if found then
          r.generated_count := r.generated_count + 1;
          made := made + 1;
        end if;
      end if;
      d := d + 1;
    end loop;

    update public.recurrences
       set last_generated = greatest(coalesce(last_generated, upto), upto),
           generated_count = r.generated_count
     where id = r.id;
  end loop;
  return made;
end;
$$;

grant execute on function public.generate_recurring_tasks(date) to authenticated;
revoke execute on function public.generate_recurring_tasks(date) from anon;

-- ---------- agendamento diário (00:05 de Brasília = 03:05 UTC) ----------
create extension if not exists pg_cron;
select cron.schedule('alania-recurring', '5 3 * * *', $cron$select public.generate_recurring_tasks()$cron$);
