-- A função "notify" fica com Verify JWT ligado: o agendamento a chama com a chave anon legada (JWT público).
select cron.unschedule('alania-notify');
select cron.schedule(
  'alania-notify',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url     := 'https://wfovajoqmmocmkpwkyer.supabase.co/functions/v1/notify',
    body    := '{"action":"tick"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indmb3Zham9xbW1vY21rcHdreWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNDMxMTMsImV4cCI6MjEwOTgxOTExM30.vZDzGKDv5UCOJR4cvMCvxbeMQZowbI_j9iPWuWCZDGE')
  );
  $cron$
);
