# Alania Task

App pessoal de tarefas (um único usuário). Roda como site no PC e como PWA instalado no celular.
Custo zero: frontend no GitHub Pages, dados no Supabase gratuito. Sem IA, sem integração com Google Tasks.

Vamos construir por etapas e melhorar aos poucos. Não implemente etapas futuras sem o usuário pedir.

## Stack

- Frontend estático: Vite + React + TypeScript, publicado no GitHub Pages por GitHub Actions.
  - Roteamento com `HashRouter` (GitHub Pages não tem fallback de SPA).
  - PWA com `vite-plugin-pwa` (manifest, service worker, instalável).
- Supabase: Postgres, Auth (login com e-mail e senha; sem Google — o app não tem nenhum vínculo com Google), Storage (anexos), Edge Functions + `pg_cron` (notificações e recorrências).
- Segredos: nenhuma chave secreta no frontend nem no repositório. Só a URL e a chave pública (anon) do Supabase vão para o front. A proteção dos dados é feita por RLS em todas as tabelas (`user_id = auth.uid()`).
- Variáveis em `.env` (fora do Git); `.env.example` documenta os nomes.

## Visual e navegação

- Design moderno. Paleta: preto/grafite com destaque em laranja quente. Tema escuro e claro (escolha do usuário; padrão segue o sistema).
- Idioma: português ou inglês, escolhido pelo usuário; o app inteiro troca (i18n, sem texto fixo nos componentes).
- Sem zoom no celular (viewport user-scalable=no + bloqueio de pinça no iOS + campos com 16px), para parecer app.
- Mobile-first e responsivo. Boa navegação tanto no PC quanto no celular.
- Menu lateral expansível (no PC recolhe para ícones; no celular vira gaveta). Ordem:
  1. **Doing** (tela inicial)
  2. **Tasks**
  3. **Planning**
  4. **Projetos / Projects** (lista de projetos e página de cada projeto; não aparecem no menu lateral)
  5. **Validation**
  6. **Recorrentes / Recurring**
  7. **Configurações / Settings** (tema, idioma, notificações, áreas)

## Modelo de tarefa

- Campos: título, área, prioridade, status, data (opcional), horário (opcional), descrição, subtarefas (checklist), etiquetas, anexos, "Requer validação" (padrão desligado), flag "no Doing" (escolhida manualmente).
- Áreas: criadas pelo usuário.
- Prioridade: Urgente / Alta / Média / Baixa, cada uma com sua cor.
- Status: To do → In progress → Waiting → Done → Validated.
  - "In progress" é um status; não confundir com a seção Doing.
  - Waiting = esperando algo ou alguém.

## Seções

### Doing (home)
- Tarefas de hoje: as escolhidas manualmente (a partir de Tasks) e as com data de hoje.
- Virou o dia sem concluir nem remarcar: a tarefa continua no Doing do dia seguinte com aviso de **atrasada**.
  (Implementado: a tarefa tem um único campo `date`. "Adicionar ao Doing" = date de hoje; "Tirar do Doing" = limpa a data.
  Doing = status aberto e date <= hoje; atrasada = date < hoje. Calculado no app, sem job.)
- A tarefa sai do Doing ao chegar em Done ou Validated.

### Tasks
- Todas as tarefas em listagem estilo tabela.
- Filtros: área, prioridade, data, status. Daqui dá para mandar uma tarefa para o Doing.

### Planning
- Painel "Sem data" (tarefas sem dia) + calendário com visões Semana e Mês.
- PC: arrastar a tarefa para um dia ou entre dias. Celular: tocar na tarefa e escolher o dia. Horário opcional.

### Validation
- Quando uma tarefa com "Requer validação" chega em Done, o app cria automaticamente uma tarefa de validação **sem data**, ligada à original.
- A seção lista essas tarefas até o usuário definir a data; depois seguem o fluxo normal (Planning, Doing).
- Quando a tarefa de validação chega em Done, a original passa para Validated. Reabrir a validação volta a original para Done; reabrir a original descarta a validação pendente.
- Implementado por gatilho no banco (supabase/migrations/0002_validation.sql), coluna tasks.validation_of.

### Recorrentes
- Cadastro completo: diária, dias da semana escolhidos, semanal, quinzenal, mensal (dia do mês ou "Nª dia-da-semana"), anual, a cada X dias/semanas/meses; data de início; fim (nunca, em data, após N vezes); horário opcional.
- Cada ocorrência vira uma tarefa normal no seu dia e entra no Doing nesse dia.
- Ocorrências não concluídas acumulam (cada uma com aviso de atrasada).
- Implementado: tabela recurrences + public.generate_recurring_tasks(p_today) (supabase/migrations/0003_recurring.sql). O app chama a função a cada carga com a data local; pg_cron roda todo dia 03:05 UTC. A mesma regra existe em TS (src/lib/recurrence.ts) para prévia e para as ocorrências futuras tracejadas no Planejamento — manter as duas iguais. Pausar e retomar não gera o que ficou para trás.

### Notificações
- Web Push (PWA instalado no celular e no PC).
- Aviso de cada tarefa é definido NA TAREFA, ao criar/editar (campo "Avisar": não avisar, na hora, 5/10/15/30 min, 1/2 h, 1 dia antes; exige data e horário) — coluna tasks.reminder_minutes (também em recurrences, herdado pelas tarefas geradas).
- Gerais (Configurações): resumo do Hoje de manhã e aviso de atrasadas, com horários escolhidos.
- Botão "Ativar notificações" que reage ao estado da permissão (default → pede; granted → mostra ativo + teste; denied → explica como desbloquear).

### Notificações — como foi implementado
- Edge Function `notify` (supabase/functions/notify/index.ts), publicada pelo painel do Supabase (Edge Functions → notify → Code → Deploy). Verify JWT fica LIGADO: o app e o pg_cron chamam com a chave anon legada (JWT público, VITE_SUPABASE_ANON_JWT); o login do usuário vai em `x-user-token`.
- Chaves VAPID geradas pela própria função na 1ª execução e guardadas em public.app_secrets (sem acesso para anon/authenticated). Nenhuma chave secreta no repositório.
- pg_cron `alania-notify` a cada 5 min (migrations 0004 e 0005); `notification_log` evita repetir envios.
- Service worker: public/push-sw.js importado via workbox.importScripts.

## Rotinas (GitHub Actions)
- Backup semanal dos dados.
- Ping periódico para o projeto gratuito do Supabase não pausar (pausa após 7 dias sem uso).

Nomes em português no app: Hoje (Doing), Tarefas, Planejamento, Projetos, Validação, Recorrentes; status A fazer, Em andamento, Aguardando, Concluída, Validada.

## Ordem de construção
1. Projeto base, login (e-mail e senha), áreas, CRUD de tarefas, seção Tasks e Doing. ✅ feito (+ PWA instalável)
2. Planning (calendário semana/mês, drag and drop). ✅ feito
3. Validation. ✅ feito
4. Recorrentes. ✅ feito
5. PWA instalável + notificações push. ✅ feito
6. Backup e ping via GitHub Actions. ✅ feito. Edge Function `backup` (Verify JWT ligado, chamada com a anon JWT pública):
   - `{"action":"ping"}`: consulta real no banco. Workflow `keepalive.yml` diário; também reativa os agendamentos (o GitHub desliga cron de repo público sem atividade há 60 dias).
   - `{"action":"backup"}`: todas as tabelas de dados (sem push_subscriptions/segredos), gzip + AES-256-GCM, chave AES cifrada com RSA-OAEP 4096 (chave pública embutida na função). Workflow `backup.yml` semanal guarda como artefato por 90 dias. Resposta pública é segura porque só sai cifrada.
   - Chave privada fica FORA do repo em D:\Dev\AlaniaTask-backup\ (com LEIA-ME). Abrir: `node scripts/decrypt-backup.mjs backup.json chave-privada-backup.pem`.
   - Nenhum segredo no GitHub (não há gh CLI e segredos não são digitados por agentes).
7. Projetos. ✅ feito (migração 0007). Detalhes:
   - Projeto: nome, cor, descrição, prazo, status ativo/pausado/concluído. Excluir projeto deixa as tarefas sem projeto.
   - Tarefa tem no máximo um projeto (`tasks.project_id`), independente da área. Criar tarefa já no projeto ou "Vincular tarefas" existentes.
   - "Depende de" (`task_deps`): só tarefas do mesmo projeto, sem ciclo (validado por trigger no banco). Trocar a tarefa de projeto apaga as dependências dela.
   - Bloqueada = alguma dependência não está Concluída/Validada → cadeado em todas as telas (inclusive Hoje; continua lá, o usuário decide tirar).
   - Ao passar uma tarefa bloqueada para Em andamento/Concluída/Validada aparece o aviso com as pendências (BlockGuard); "Fazer mesmo assim" segue e o projeto mostra alerta. O alerta é calculado (não há tabela): some sozinho quando as pendências são concluídas. Contagem de alertas no item Projetos do menu.
   - Página do projeto: Disponíveis (sem pendências, ou já iniciadas fora de ordem), Todas (por etapa) e Fluxograma (linhas por etapa, setas SVG).
8. Sincronização com Google Tasks. ✅ código pronto (migração 0008, função `gtasks`, cartão em Configurações). Regras combinadas:
   - Lista padrão "Minhas tarefas" (`@default`). A cada 5 min (pg_cron `alania-gtasks`) e no botão "Sincronizar agora".
   - Tarefas do Hoje (abertas, data ≤ hoje) são criadas no Google: título (com "HH:MM · " só se tiver horário), descrição nas notas, data.
   - Concluir no app → conclui no Google; concluir no Google → conclui no app (só as criadas pelo app). Desmarcar/reabrir também espelha.
   - Saiu do Hoje (sem data, outra data, excluída) → apaga do Google. Apagada no Google pelo usuário → não recria no mesmo dia.
   - Tarefa criada direto no Google é ignorada.
   - OAuth: escopo só `tasks`, redirect `https://alanovictor.github.io/AlaniaTask/google.html` (repassa code/state no hash para #/settings; fora do fallback do service worker). GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET nos secrets da função (o usuário cola o secret). Refresh token em `google_links` (tabela fechada); vínculo em `gtask_map`.
