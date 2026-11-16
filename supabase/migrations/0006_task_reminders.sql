-- Alania Task — aviso (notificação) definido em cada tarefa, na criação.
-- reminder_minutes: null = não avisar; 0 = na hora; N = N minutos antes da data+horário da tarefa.

alter table public.tasks
  add column if not exists reminder_minutes integer check (reminder_minutes between 0 and 10080);

alter table public.recurrences
  add column if not exists reminder_minutes integer check (reminder_minutes between 0 and 10080);

-- as tarefas criadas pelas recorrentes herdam o aviso
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
                                  requires_validation, recurrence_id, occurrence_date, reminder_minutes)
        values (r.user_id, r.area_id, r.title, r.description, r.priority, d, r.time,
                r.requires_validation, r.id, d, r.reminder_minutes)
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

