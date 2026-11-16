-- Alania Task — etapa 7: projetos e dependências entre tarefas ("depende de").
-- Uma tarefa pertence a no máximo um projeto. Dependências só valem dentro do mesmo projeto
-- e não podem formar ciclo. "Bloqueada" e "fora de ordem" são calculados no app.

-- ---------- Projetos ----------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  color        text not null default '#d97757',
  description  text,
  deadline     date,
  status       text not null default 'active' check (status in ('active', 'paused', 'done')),
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.tasks add column if not exists project_id uuid references public.projects (id) on delete set null;
create index if not exists tasks_project_idx on public.tasks (project_id);

-- ---------- Dependências: task_id só deve ser feita depois de depends_on ----------
create table if not exists public.task_deps (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  depends_on  uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (task_id, depends_on),
  check (task_id <> depends_on)
);

create index if not exists task_deps_depends_on_idx on public.task_deps (depends_on);

-- mesmo projeto e sem ciclo
create or replace function public.check_task_dep()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p1 uuid;
  p2 uuid;
begin
  select project_id into p1 from public.tasks where id = new.task_id;
  select project_id into p2 from public.tasks where id = new.depends_on;
  if p1 is null or p1 is distinct from p2 then
    raise exception 'dependency must be in the same project';
  end if;
  if exists (
    with recursive up(id) as (
      select new.depends_on
      union
      select d.depends_on from public.task_deps d join up on d.task_id = up.id
    )
    select 1 from up where id = new.task_id
  ) then
    raise exception 'dependency cycle';
  end if;
  return new;
end;
$$;

drop trigger if exists task_deps_check on public.task_deps;
create trigger task_deps_check
  before insert or update on public.task_deps
  for each row execute function public.check_task_dep();

-- tarefa que muda (ou sai) de projeto perde as dependências
create or replace function public.clear_deps_on_project_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.project_id is distinct from old.project_id then
    delete from public.task_deps where task_id = new.id or depends_on = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_project_deps on public.tasks;
create trigger tasks_project_deps
  after update of project_id on public.tasks
  for each row execute function public.clear_deps_on_project_change();

-- ---------- RLS ----------
alter table public.projects  enable row level security;
alter table public.task_deps enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['projects', 'task_deps'] loop
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
