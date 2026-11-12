-- Alania Task — etapa 3: validação.
-- Tarefa com "Requer validação" que chega em Done gera sozinha uma tarefa de validação, sem data.
-- Quando a tarefa de validação chega em Done, a original passa para Validated.

alter table public.tasks
  add column if not exists validation_of uuid references public.tasks (id) on delete cascade;

-- no máximo uma tarefa de validação por tarefa original
create unique index if not exists tasks_validation_of_key on public.tasks (validation_of) where validation_of is not null;

create or replace function public.handle_validation()
returns trigger
language plpgsql
as $$
declare
  closed  constant text[] := array['done', 'validated'];
  lang    text;
  prefix  text;
begin
  -- 1) original concluída -> cria a tarefa de validação (sem data)
  if new.validation_of is null
     and new.requires_validation
     and new.status = 'done'
     and not (old.status = any (closed))
     and not exists (select 1 from public.tasks v where v.validation_of = new.id)
  then
    select s.language into lang from public.user_settings s where s.user_id = new.user_id;
    prefix := case when lang = 'en' then 'Validate: ' else 'Validar: ' end;
    insert into public.tasks (user_id, area_id, title, priority, status, validation_of, requires_validation)
    values (new.user_id, new.area_id, left(prefix || new.title, 200), new.priority, 'todo', new.id, false);
  end if;

  -- 2) original reaberta -> descarta a validação que ainda não foi feita
  if new.validation_of is null
     and old.status = any (closed)
     and not (new.status = any (closed))
  then
    delete from public.tasks v
     where v.validation_of = new.id
       and not (v.status = any (closed));
  end if;

  -- 3) validação concluída -> original vira Validated; validação reaberta -> original volta a Done
  if new.validation_of is not null then
    if new.status = any (closed) and not (old.status = any (closed)) then
      update public.tasks set status = 'validated' where id = new.validation_of and status = 'done';
    elsif not (new.status = any (closed)) and old.status = any (closed) then
      update public.tasks set status = 'done' where id = new.validation_of and status = 'validated';
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists tasks_validation on public.tasks;
create trigger tasks_validation
  after update of status on public.tasks
  for each row
  when (old.status is distinct from new.status)
  execute function public.handle_validation();
