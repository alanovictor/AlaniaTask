# Alania Task

App pessoal de tarefas (um único usuário). Roda como site no PC e como PWA instalado no celular.
Custo zero: frontend no GitHub Pages, dados no Supabase gratuito. Sem IA, sem integração com Google Tasks.

Vamos construir por etapas e melhorar aos poucos. Não implemente etapas futuras sem o usuário pedir.

## Stack

- Frontend estático: Vite + React + TypeScript, publicado no GitHub Pages por GitHub Actions.
  - Roteamento com `HashRouter` (GitHub Pages não tem fallback de SPA).
  - PWA com `vite-plugin-pwa` (manifest, service worker, instalável).
- Supabase: Postgres, Auth (só login com Google), Storage (anexos), Edge Functions + `pg_cron` (notificações e recorrências).
- Segredos: nenhuma chave secreta no frontend nem no repositório. Só a URL e a chave pública (anon) do Supabase vão para o front. A proteção dos dados é feita por RLS em todas as tabelas (`user_id = auth.uid()`).
- Variáveis em `.env` (fora do Git); `.env.example` documenta os nomes.

## Visual e navegação

- Design moderno. Paleta: preto/grafite com destaque em laranja quente. Tema escuro e claro (escolha do usuário; padrão segue o sistema).
- Idioma: português ou inglês, escolhido pelo usuário; o app inteiro troca (i18n, sem texto fixo nos componentes).
- Mobile-first e responsivo. Boa navegação tanto no PC quanto no celular.
- Menu lateral expansível (no PC recolhe para ícones; no celular vira gaveta). Ordem:
  1. **Doing** (tela inicial)
  2. **Tasks**
  3. **Planning**
  4. **Validation**
  5. **Recorrentes / Recurring**
  6. **Configurações / Settings** (tema, idioma, notificações, áreas)

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
  (Implementação sugerida: calcular na consulta — data < hoje e status não finalizado = atrasada; não precisa de job para "mover".)
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
- Quando a tarefa de validação chega em Done, a original passa para Validated (a confirmar com o usuário).

### Recorrentes
- Cadastro completo: diária, dias da semana escolhidos, semanal, quinzenal, mensal (dia do mês ou "Nª dia-da-semana"), anual, a cada X dias/semanas/meses; data de início; fim (nunca, em data, após N vezes); horário opcional.
- Cada ocorrência vira uma tarefa normal no seu dia e entra no Doing nesse dia.
- Ocorrências não concluídas acumulam (cada uma com aviso de atrasada).

### Notificações
- Web Push (PWA instalado no celular e no PC).
- Configurável: resumo do Doing de manhã (horário escolhido), aviso no horário da tarefa (antecedência escolhida), aviso de atrasadas.
- Botão "Ativar notificações" que reage ao estado da permissão (default → pede; granted → mostra ativo + teste; denied → explica como desbloquear).

## Rotinas (GitHub Actions)
- Backup semanal dos dados.
- Ping periódico para o projeto gratuito do Supabase não pausar (pausa após 7 dias sem uso).

## Ordem de construção
1. Projeto base, login com Google, áreas, CRUD de tarefas, seção Tasks e Doing.
2. Planning (calendário semana/mês, drag and drop).
3. Validation.
4. Recorrentes.
5. PWA instalável + notificações push.
6. Backup e ping via GitHub Actions.
