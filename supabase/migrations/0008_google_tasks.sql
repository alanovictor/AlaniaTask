-- Alania Task — etapa 8: sincronização com o Google Tasks (lista padrão "Minhas tarefas").
-- A cada 5 min a função "gtasks" envia as tarefas do Hoje e traz as conclusões feitas no Google.
-- As tabelas abaixo guardam o token do Google: ficam FECHADAS (só a função, com a chave de serviço, acessa).

create table if not exists public.google_links (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  refresh_token  text not null,
  list_id        text not null default '@default',
  connected_at   timestamptz not null default now(),
  last_sync_at   timestamptz,
  last_error     text,
  sync_lock      timestamptz
);

-- tarefa do app ↔ tarefa criada no Google (sem FK: tarefa apagada no app é limpa na sincronização)
create table if not exists public.gtask_map (
  task_id        uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  google_id      text,               -- null = apagada no Google pelo usuário (não recriar no mesmo dia)
  day            date not null,      -- dia em que foi enviada
  synced_status  text not null check (synced_status in ('open', 'done')),
  synced_hash    text not null default '',
  synced_at      timestamptz not null default now()
);
create index if not exists gtask_map_user_idx on public.gtask_map (user_id);

-- "state" do login com o Google (vale 15 minutos)
create table if not exists public.google_oauth_states (
  state       text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.google_links        enable row level security;
alter table public.gtask_map           enable row level security;
alter table public.google_oauth_states enable row level security;
revoke all on public.google_links, public.gtask_map, public.google_oauth_states from anon, authenticated;

-- a cada 5 minutos
select cron.unschedule('alania-gtasks') where exists (select 1 from cron.job where jobname = 'alania-gtasks');
select cron.schedule(
  'alania-gtasks',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url     := 'https://wfovajoqmmocmkpwkyer.supabase.co/functions/v1/gtasks',
    body    := '{"action":"tick"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indmb3Zham9xbW1vY21rcHdreWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNDMxMTMsImV4cCI6MjEwOTgxOTExM30.vZDzGKDv5UCOJR4cvMCvxbeMQZowbI_j9iPWuWCZDGE')
  );
  $cron$
);
