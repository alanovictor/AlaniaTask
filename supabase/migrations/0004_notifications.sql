-- Alania Task — etapa 5: notificações push.
-- O app registra a inscrição do aparelho; a Edge Function "notify" (a cada 5 min, via pg_cron + pg_net)
-- envia: resumo da manhã, lembrete antes do horário da tarefa e aviso de atrasadas.

-- ---------- inscrições (um registro por aparelho/navegador) ----------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "own rows" on public.push_subscriptions;
create policy "own rows" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;

-- ---------- preferências ----------
alter table public.user_settings
  add column if not exists timezone          text    not null default 'America/Sao_Paulo',
  add column if not exists notify_morning    boolean not null default true,
  add column if not exists morning_time      time    not null default '08:00',
  add column if not exists notify_reminders  boolean not null default true,
  add column if not exists reminder_minutes  integer not null default 15 check (reminder_minutes between 0 and 1440),
  add column if not exists notify_overdue    boolean not null default true,
  add column if not exists overdue_time      time    not null default '18:00';

-- ---------- registro do que já foi enviado (evita repetir) — só a função acessa ----------
create table if not exists public.notification_log (
  user_id  uuid not null references auth.users (id) on delete cascade,
  kind     text not null,
  ref      text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;

-- ---------- chaves VAPID geradas pela função — só a função acessa ----------
create table if not exists public.app_secrets (
  name   text primary key,
  value  jsonb not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- limpeza: registros com mais de 30 dias
create or replace function public.prune_notification_log()
returns void language sql as $$
  delete from public.notification_log where sent_at < now() - interval '30 days';
$$;

-- ---------- agendamento: chama a função a cada 5 minutos ----------
create extension if not exists pg_net;

select cron.schedule(
  'alania-notify',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url     := 'https://wfovajoqmmocmkpwkyer.supabase.co/functions/v1/notify',
    body    := '{"action":"tick"}'::jsonb,
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_7O8d0AvW3xrVb406k4ofdw_4v729ho2"}'::jsonb
  );
  $cron$
);

select cron.schedule('alania-prune-log', '30 4 * * *', $cron$select public.prune_notification_log()$cron$);
