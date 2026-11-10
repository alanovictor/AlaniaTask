-- Alania Task — etapa 1: áreas, tarefas, subtarefas, etiquetas e preferências.
-- Toda tabela tem user_id e RLS: cada usuário só enxerga e altera o que é dele.

-- ---------- Áreas ----------
create table if not exists public.areas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  color       text not null default '#E8743B',
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- Tarefas ----------
create table if not exists public.tasks (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  area_id              uuid references public.areas (id) on delete set null,
  title                text not null check (char_length(title) between 1 and 200),
  description          text,
  priority             text not null default 'medium'
                         check (priority in ('urgent', 'high', 'medium', 'low')),
  status               text not null default 'todo'
                         check (status in ('todo', 'in_progress', 'waiting', 'done', 'validated')),
  -- Dia planejado. "Adicionar ao Doing" define date = hoje.
  -- Atrasada = date < hoje e status ainda aberto (calculado no app, sem job).
  date                 date,
  time                 time,
  requires_validation  boolean not null default false,
  completed_at         timestamptz,
  position             integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists tasks_user_date_idx on public.tasks (user_id, date);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status);

-- ---------- Subtarefas (checklist) ----------
create table if not exists public.subtasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  done        boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists subtasks_task_idx on public.subtasks (task_id);

-- ---------- Etiquetas ----------
create table if not exists public.tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  color       text not null default '#8A8A8A',
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.task_tags (
  task_id  uuid not null references public.tasks (id) on delete cascade,
  tag_id   uuid not null references public.tags (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (task_id, tag_id)
);

-- ---------- Preferências ----------
create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  theme       text not null default 'system' check (theme in ('system', 'dark', 'light')),
  language    text not null default 'pt' check (language in ('pt', 'en')),
  updated_at  timestamptz not null default now()
);

-- ---------- updated_at / completed_at automáticos ----------
create or replace function public.touch_task()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status in ('done', 'validated') and old.status not in ('done', 'validated') then
    new.completed_at := now();
  elsif new.status not in ('done', 'validated') then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch
  before update on public.tasks
  for each row execute function public.touch_task();

-- ---------- RLS ----------
alter table public.areas         enable row level security;
alter table public.tasks         enable row level security;
alter table public.subtasks      enable row level security;
alter table public.tags          enable row level security;
alter table public.task_tags     enable row level security;
alter table public.user_settings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['areas', 'tasks', 'subtasks', 'tags', 'task_tags', 'user_settings'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;
