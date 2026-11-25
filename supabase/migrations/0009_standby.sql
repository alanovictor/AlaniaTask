-- Alania Task — Stand by: tarefa "guardada" fora do fluxo (não é status; mantém o status que tinha).
-- Fica fora de Hoje, Tarefas, Kanban, Planejamento, Validação, notificações e Google Tasks até sair do stand by.
alter table public.tasks add column if not exists standby    boolean not null default false;
alter table public.tasks add column if not exists standby_at timestamptz;
create index if not exists tasks_user_standby_idx on public.tasks (user_id) where standby;
