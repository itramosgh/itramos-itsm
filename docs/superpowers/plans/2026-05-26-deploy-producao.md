# Deploy em Produção — ITSM ITRAMOS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar o sistema ITSM ITRAMOS em produção com Supabase + Vercel + Resend, criando o primeiro usuário admin e configurando a plataforma para uso imediato.

**Architecture:** A aplicação Next.js 16 é hospedada na Vercel com cron jobs nativos. O banco de dados e autenticação ficam no Supabase Cloud. E-mails transacionais e inbound são processados pelo Resend. O SSO Microsoft é opcional e configurado via Supabase OAuth (Azure AD).

**Tech Stack:** Next.js 16 (App Router), Supabase Cloud, Resend, Vercel, Supabase CLI, Azure AD (opcional para SSO)

---

## Pré-requisitos

Antes de começar, você precisa ter:

- **Conta Supabase** (supabase.com) — plano Free ou Pro
- **Conta Vercel** (vercel.com) — plano Hobby ou Pro
- **Conta Resend** (resend.com) — plano Free ($0) já suporta 100 e-mails/dia
- **Supabase CLI** instalado: `npm install -g supabase`
- **Vercel CLI** instalado: `npm install -g vercel`
- **Git** com o repositório já commitado (branch `master`)
- Domínio próprio para e-mail (ex: `itramos.com.br`) — necessário para Resend enviar de `suporte@itramos.com.br`

---

## Mapa de Arquivos

Nenhum arquivo de código será criado ou modificado neste plano. Todos os passos são de configuração de infraestrutura, variáveis de ambiente e dados iniciais via painel web e CLI.

---

## Task 1: Criar projeto Supabase em produção

**Objetivo:** Ter o projeto Supabase de produção criado e as credenciais em mãos.

- [ ] **Step 1: Acessar o Supabase Dashboard**

  Acesse https://supabase.com/dashboard e clique em **New project**.

- [ ] **Step 2: Preencher os dados do projeto**

  - **Name:** `itsm-itramos` (ou nome de sua preferência)
  - **Database Password:** escolha uma senha forte e **salve em local seguro** — você precisará dela depois
  - **Region:** `South America (São Paulo)` — reduz latência para usuários no Brasil
  - **Plan:** Free (pode migrar para Pro depois)

  Clique em **Create new project** e aguarde ~2 minutos.

- [ ] **Step 3: Salvar as credenciais**

  No painel do projeto recém-criado, vá em **Settings → API** e copie:

  | Variável | Onde encontrar |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | Project URL (ex: `https://xyzxyz.supabase.co`) |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key |
  | `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (seção "Project API keys") |

  **Atenção:** a `service_role` key tem acesso total ao banco — nunca exponha no frontend.

- [ ] **Step 4: Anotar o Project Reference ID**

  No painel, vá em **Settings → General** e copie o **Reference ID** (ex: `abcdefghij`). Você precisará para o próximo passo.

---

## Task 2: Habilitar extensões e aplicar migrations

**Objetivo:** Configurar as extensões necessárias e aplicar todas as 22 migrations no banco de produção.

- [ ] **Step 1: Habilitar `pg_trgm` no Supabase**

  No painel do projeto, vá em **Database → Extensions**. Procure por `pg_trgm` e habilite-a. Isso é necessário para a detecção de chamados recorrentes.

  Alternativamente, no **SQL Editor** execute:

  ```sql
  create extension if not exists pg_trgm;
  ```

- [ ] **Step 2: Linkar o projeto local ao Supabase de produção**

  No terminal, na raiz do repositório:

  ```bash
  supabase link --project-ref SEU_PROJECT_REF_ID
  ```

  Quando pedir a senha do banco, use a senha escolhida na Task 1, Step 2.

  Saída esperada:
  ```
  Finished supabase link.
  ```

- [ ] **Step 3: Aplicar todas as migrations**

  ```bash
  supabase db push
  ```

  Saída esperada (pode demorar 30–60s):
  ```
  Applying migration 20260522000001_foundation_schema.sql...
  Applying migration 20260522000002_rls_policies.sql...
  ...
  Applying migration 20260527000001_dashboard_reporting.sql...
  Finished supabase db push.
  ```

  Se aparecer erro de extensão `pg_trgm not found`, volte ao Step 1 e habilite a extensão pelo painel antes de rodar `db push` novamente.

- [ ] **Step 4: Verificar no SQL Editor**

  No painel do Supabase, vá em **Table Editor** e confirme que as seguintes tabelas existem:

  - `profiles`, `companies`, `contacts`, `contracts`
  - `tickets`, `ticket_categories`, `ticket_attachments`
  - `email_templates` (deve ter 36 templates já populados)
  - `platform_settings`
  - `monitoring_integrations`, `monitored_urls`
  - `change_requests`, `meetings`, `tasks`

- [ ] **Step 5: Inserir a linha inicial de `platform_settings`**

  No **SQL Editor**, execute:

  ```sql
  insert into public.platform_settings (id, company_name, business_hours_start, business_hours_end)
  values (1, 'ITRAMOS', '09:00', '18:00')
  on conflict (id) do nothing;
  ```

---

## Task 3: Configurar autenticação e criar primeiro usuário admin

**Objetivo:** Criar o primeiro usuário com role `admin` para acessar o sistema.

- [ ] **Step 1: Configurar URL de redirecionamento no Supabase**

  No painel, vá em **Authentication → URL Configuration**.

  - **Site URL:** `https://SEU-DOMINIO-VERCEL.vercel.app` (você obterá esse domínio na Task 5; por enquanto deixe `http://localhost:3000`)
  - **Redirect URLs:** adicione `https://SEU-DOMINIO-VERCEL.vercel.app/auth/callback`

  Você voltará aqui após o deploy na Vercel (Task 5) para atualizar com o domínio real.

- [ ] **Step 2: Criar o primeiro usuário admin via Supabase Dashboard**

  No painel, vá em **Authentication → Users** e clique em **Add user → Create new user**.

  - **Email:** seu e-mail corporativo (ex: `admin@itramos.com.br`)
  - **Password:** escolha uma senha forte
  - Marque **Auto Confirm User**

  Clique em **Create User** e copie o UUID gerado (ex: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

- [ ] **Step 3: Criar o perfil admin no banco**

  No **SQL Editor**, substitua `SEU_UUID` pelo UUID copiado no Step 2:

  ```sql
  insert into public.profiles (id, full_name, role, is_active)
  values (
    'SEU_UUID'::uuid,
    'Administrador ITRAMOS',
    'admin',
    true
  )
  on conflict (id) do update set role = 'admin', is_active = true;
  ```

---

## Task 4: Configurar Resend

**Objetivo:** Configurar envio de e-mail transacional e recebimento de e-mails para abertura de chamados.

- [ ] **Step 1: Criar conta e verificar domínio no Resend**

  Acesse https://resend.com e crie uma conta.

  Em **Domains**, clique em **Add Domain** e adicione seu domínio (ex: `itramos.com.br`).

  O Resend mostrará registros DNS (TXT e MX) para adicionar no seu provedor de DNS. Adicione-os e aguarde a verificação (pode levar até 24h, geralmente 5–15 minutos).

- [ ] **Step 2: Gerar API Key**

  Em **API Keys**, clique em **Create API Key**.

  - **Name:** `itsm-producao`
  - **Permission:** `Full access`

  Copie a chave gerada (começa com `re_`). Esta é a `RESEND_API_KEY`.

- [ ] **Step 3: Configurar e-mail de envio nos templates**

  Após o deploy (Task 5), acesse `/configuracoes` no sistema e configure:
  - **E-mail de envio:** `suporte@itramos.com.br` (ou o endereço do domínio verificado)
  - **Nome do remetente:** `ITRAMOS Suporte`

- [ ] **Step 4: Configurar inbound webhook (recebimento de chamados por e-mail)**

  > **Opcional — só necessário se quiser que clientes abram chamados enviando e-mail.**

  No Resend, vá em **Inbound** e configure o endpoint de inbound apontando para:

  ```
  https://SEU-DOMINIO-VERCEL.vercel.app/api/email/inbound
  ```

  Copie o **Signing Secret** gerado (esta é a `RESEND_INBOUND_SECRET`).

  No DNS do seu domínio, adicione o registro MX que o Resend indicar (geralmente `MX inbound.resend.com`).

---

## Task 5: Deploy na Vercel

**Objetivo:** Publicar a aplicação na Vercel com todas as variáveis de ambiente configuradas.

- [ ] **Step 1: Conectar o repositório à Vercel**

  Acesse https://vercel.com/new e clique em **Import Git Repository**.

  Selecione o repositório do ITSM. Se não aparecer, conecte o GitHub/GitLab pela primeira vez.

  - **Framework Preset:** Next.js (detectado automaticamente)
  - **Root Directory:** `.` (raiz do projeto)
  - **Build Command:** `npm run build` (padrão)
  - **Output Directory:** `.next` (padrão)

  **Não clique em Deploy ainda** — primeiro configure as variáveis de ambiente.

- [ ] **Step 2: Configurar variáveis de ambiente na Vercel**

  Na tela de configuração do projeto, na seção **Environment Variables**, adicione:

  | Nome | Valor | Environments |
  |---|---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase (Task 1) | Production, Preview, Development |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (Task 1) | Production, Preview, Development |
  | `SUPABASE_SERVICE_ROLE_KEY` | Service role key (Task 1) | Production, Preview, Development |
  | `RESEND_API_KEY` | API key do Resend (Task 4) | Production, Preview, Development |
  | `NEXT_PUBLIC_APP_URL` | `https://SEU-DOMINIO.vercel.app` | Production |
  | `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Development |
  | `CRON_SECRET` | String aleatória segura (veja Step 3) | Production, Preview |
  | `RESEND_INBOUND_SECRET` | Signing secret do Resend inbound (Task 4, Step 4) | Production |

- [ ] **Step 3: Gerar um CRON_SECRET seguro**

  No terminal local, gere uma string aleatória:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

  Use o valor gerado como `CRON_SECRET`. Este valor autentica os cron jobs da Vercel.

- [ ] **Step 4: Fazer o primeiro deploy**

  Clique em **Deploy**. Aguarde o build completar (~2–4 minutos).

  Saída esperada no log de build:
  ```
  ✓ Compiled successfully
  ✓ Linting and checking validity of types
  Route (app) ...
  ```

  Se falhar, veja os logs. Os erros mais comuns são variáveis de ambiente faltando.

- [ ] **Step 5: Anotar o domínio gerado**

  Após o deploy, a Vercel mostra o domínio de produção (ex: `itsm-itramos.vercel.app`). Anote-o.

- [ ] **Step 6: Atualizar NEXT_PUBLIC_APP_URL e URLs de callback**

  No painel da Vercel → **Settings → Environment Variables**, atualize `NEXT_PUBLIC_APP_URL` com o domínio real:

  ```
  https://itsm-itramos.vercel.app
  ```

  No Supabase → **Authentication → URL Configuration**, atualize:
  - **Site URL:** `https://itsm-itramos.vercel.app`
  - **Redirect URLs:** `https://itsm-itramos.vercel.app/auth/callback`

  Após essas mudanças, faça um **Redeploy** na Vercel (Settings → Deployments → botão Redeploy no último deploy).

---

## Task 6: Verificar cron jobs

**Objetivo:** Confirmar que os 6 cron jobs estão cadastrados e funcionando na Vercel.

- [ ] **Step 1: Verificar crons no painel da Vercel**

  No painel do projeto na Vercel, vá em **Settings → Cron Jobs**.

  Você deve ver os 6 crons definidos em `vercel.json`:

  | Path | Schedule | Descrição |
  |---|---|---|
  | `/api/cron/sla-alerts` | `*/5 * * * *` | Alertas de SLA a cada 5 min |
  | `/api/cron/ticket-automations` | `*/30 * * * *` | Automações de chamados |
  | `/api/cron/agendamento` | `*/5 * * * *` | Chamados agendados |
  | `/api/cron/url-check` | `*/5 * * * *` | Verificação de URLs monitoradas |
  | `/api/cron/process-pending-alerts` | `*/5 * * * *` | Alertas de monitoramento pendentes |
  | `/api/cron/monthly-report` | `0 8 * * *` | Relatório mensal (8h todo dia) |

  > **Nota:** Cron jobs só funcionam em plano Vercel **Pro**. No plano Hobby, você precisará de um serviço externo como o [cron-job.org](https://cron-job.org) para acionar os endpoints manualmente.

- [ ] **Step 2: Testar um cron manualmente**

  No painel da Vercel → **Cron Jobs**, clique em **Run** ao lado de `/api/cron/sla-alerts` e confirme que retorna HTTP 200.

  Se retornar 401, o `CRON_SECRET` não está configurado corretamente na variável de ambiente.

- [ ] **Step 3: Para usuários Hobby — configurar cron externo**

  Se estiver no plano Hobby, acesse https://cron-job.org e crie jobs para cada endpoint:

  - URL: `https://itsm-itramos.vercel.app/api/cron/sla-alerts`
  - Header: `Authorization: Bearer SEU_CRON_SECRET`
  - Schedule: a cada 5 minutos

  Repita para cada cron listado na tabela acima.

---

## Task 7: Configurar domínio customizado (opcional mas recomendado)

**Objetivo:** Usar `itsm.itramos.com.br` em vez de `itsm-itramos.vercel.app`.

- [ ] **Step 1: Adicionar domínio na Vercel**

  No painel do projeto → **Settings → Domains**, clique em **Add** e digite o domínio desejado (ex: `itsm.itramos.com.br`).

  A Vercel mostrará os registros DNS a adicionar no seu provedor (geralmente um CNAME ou A record).

- [ ] **Step 2: Configurar DNS**

  No painel do seu provedor de DNS, adicione o registro indicado pela Vercel. Aguarde a propagação (5–30 minutos).

- [ ] **Step 3: Atualizar variáveis e URLs de callback**

  Atualize `NEXT_PUBLIC_APP_URL` na Vercel para `https://itsm.itramos.com.br`.

  No Supabase → **Authentication → URL Configuration**, atualize Site URL e Redirect URLs com o novo domínio.

  No Resend → Inbound, atualize o endpoint para `https://itsm.itramos.com.br/api/email/inbound`.

  Faça Redeploy na Vercel após as mudanças.

---

## Task 8: Configurar SSO Microsoft (opcional)

**Objetivo:** Permitir que o time interno faça login com conta Microsoft (Azure AD / Microsoft 365).

> **Pule esta task** se não usar Microsoft 365 na empresa.

- [ ] **Step 1: Registrar aplicativo no Azure AD**

  Acesse https://portal.azure.com → **Azure Active Directory → App registrations → New registration**.

  - **Name:** `ITRAMOS ITSM`
  - **Supported account types:** `Accounts in this organizational directory only`
  - **Redirect URI:** `https://SEU-PROJECT-REF.supabase.co/auth/v1/callback`
    (Substitua `SEU-PROJECT-REF` pelo Reference ID do Supabase — Task 1, Step 4)

  Clique em **Register**.

- [ ] **Step 2: Criar Client Secret**

  No app registrado → **Certificates & secrets → New client secret**.

  - **Description:** `itsm-supabase`
  - **Expires:** 24 months

  Copie o **Value** do secret gerado (some após sair da tela).

- [ ] **Step 3: Copiar Application (client) ID e Tenant ID**

  Na tela **Overview** do app, copie:
  - **Application (client) ID**
  - **Directory (tenant) ID**

- [ ] **Step 4: Habilitar Azure provider no Supabase**

  No painel do Supabase → **Authentication → Providers → Azure**.

  Habilite e preencha:
  - **Application (client) ID:** o valor do Step 3
  - **Application (client) secret:** o valor do Step 2
  - **Azure Tenant:** o Tenant ID do Step 3

  Salve.

- [ ] **Step 5: Verificar login SSO**

  Acesse a URL de produção e clique em **Entrar com Microsoft**. Se a autenticação funcionar e redirecionar para `/dashboard`, está correto.

  Se houver erro de redirect URI, confirme que a URI no Azure App Registration bate exatamente com `https://SEU-PROJECT-REF.supabase.co/auth/v1/callback`.

---

## Task 9: Configuração inicial da plataforma

**Objetivo:** Configurar os dados básicos da plataforma para que o sistema esteja operacional.

- [ ] **Step 1: Acessar o sistema pela primeira vez**

  Acesse `https://SEU-DOMINIO/login` e faça login com o usuário admin criado na Task 3.

  Você deve ser redirecionado para `/dashboard`.

- [ ] **Step 2: Configurar identidade visual e e-mail**

  Vá em `/configuracoes` e preencha:

  - **Nome da empresa:** `ITRAMOS`
  - **E-mail de envio:** `suporte@itramos.com.br`
  - **Nome do remetente:** `ITRAMOS Suporte`
  - **Logo (tema claro):** faça upload do arquivo PNG da logo (usado nos PDFs e e-mails)
  - **Horário comercial:** `09:00` às `18:00`
  - **Dias úteis:** segunda a sexta

- [ ] **Step 3: Importar feriados nacionais**

  Vá em `/configuracoes/feriados` e clique em **Importar feriados** para o ano atual.

  O sistema buscará automaticamente os feriados nacionais da API BrasilAPI.

  Verifique se os feriados foram importados corretamente na listagem.

- [ ] **Step 4: Configurar parâmetros de SLA**

  Vá em `/configuracoes` e configure os prazos de SLA por prioridade:

  | Prioridade | Primeira resposta | Resolução |
  |---|---|---|
  | Crítica | 1h | 4h |
  | Alta | 2h | 8h |
  | Média | 4h | 24h |
  | Baixa | 8h | 72h |

  Ajuste conforme o contrato com seus clientes.

- [ ] **Step 5: Configurar detecção de recorrência**

  Ainda em `/configuracoes`, configure:
  - **Mínimo de chamados similares para alerta:** `3`
  - **Janela de tempo (dias):** `30`

- [ ] **Step 6: Revisar templates de e-mail**

  Vá em `/configuracoes/email-templates` e revise os templates mais usados:

  - `chamado_aberto` — confirmação para o cliente quando um chamado é aberto
  - `chamado_resolvido` — notificação de resolução
  - `sla_violado` — alerta de SLA violado
  - `relatorio_mensal` — e-mail que acompanha o PDF mensal
  - `problema_recorrente` — alerta de chamados recorrentes

  Edite o conteúdo substituindo textos genéricos pela identidade da ITRAMOS. Salve cada template.

---

## Task 10: Cadastrar primeiro cliente e analista

**Objetivo:** Validar o fluxo completo criando um cliente e um analista de teste.

- [ ] **Step 1: Criar usuário analista**

  Vá em `/usuarios` e clique em **Novo usuário**.

  - **Nome:** seu nome
  - **E-mail:** e-mail do analista
  - **Role:** `analista`

  O sistema enviará um e-mail de boas-vindas com link para definição de senha.

  Verifique na caixa de entrada se o e-mail chegou. Se não chegar, verifique os logs em `/configuracoes/logs` e confirme que o `RESEND_API_KEY` está correto.

- [ ] **Step 2: Criar empresa cliente**

  Vá em `/clientes` e clique em **Nova empresa**.

  - **Nome:** `Cliente Teste`
  - **Domínio de e-mail:** `clienteteste.com.br` (para abertura de chamados por e-mail)

- [ ] **Step 3: Criar contato do cliente**

  Na tela da empresa recém-criada, clique em **Novo contato**.

  - **Nome:** `João Teste`
  - **E-mail:** um e-mail seu (para testar o portal)
  - **Responsável pelo contrato:** ✓

- [ ] **Step 4: Criar contrato ativo**

  Na tela da empresa, clique em **Novo contrato** e configure:

  - **Tipo:** escolha um
  - **Status:** `ativo`
  - **Início:** hoje
  - **Vencimento:** daqui a 1 ano

- [ ] **Step 5: Abrir um chamado de teste**

  Vá em `/chamados` e clique em **Novo chamado**.

  Selecione a empresa `Cliente Teste`, preencha título e descrição, defina prioridade e salve.

  Verifique:
  - O chamado aparece na lista com número sequencial
  - O SLA foi calculado e aparece no card do chamado
  - O contato recebeu e-mail de confirmação de abertura

- [ ] **Step 6: Testar o portal do cliente**

  Acesse `/portal/chamados` com as credenciais do contato criado no Step 3 (ele deve ter recebido e-mail de boas-vindas com link de senha).

  Verifique se o chamado aberto no Step 5 aparece no portal.

---

## Task 11: Smoke test dos dashboards e relatórios

**Objetivo:** Confirmar que todas as páginas principais carregam sem erro.

- [ ] **Step 1: Testar dashboards de gestão**

  Logado como admin, acesse cada página e confirme que carrega sem erro 500:

  - [ ] `/dashboard`
  - [ ] `/relatorios/operacional`
  - [ ] `/relatorios/mudancas`
  - [ ] `/relatorios/monitoramento`
  - [ ] `/relatorios/mensal`
  - [ ] `/relatorios/custos`

- [ ] **Step 2: Testar geração de PDF**

  Em `/relatorios/mensal`:
  1. Selecione a empresa `Cliente Teste`
  2. Defina o período (mês anterior)
  3. Clique em **Baixar PDF**

  O download deve iniciar. Abra o arquivo e confirme que o PDF contém o nome do cliente e os dados.

- [ ] **Step 3: Testar envio de relatório por e-mail**

  Na mesma tela, clique em **Enviar por e-mail**.

  Confirme que o responsável de contrato (cadastrado na Task 10) recebe o e-mail com o PDF em anexo.

- [ ] **Step 4: Confirmar cron de SLA em produção**

  Em **Vercel → Cron Jobs**, execute manualmente o `/api/cron/sla-alerts`.

  No Supabase → **Table Editor → system_logs**, confirme que apareceu um log com `category = 'cron_job'`.

---

## Pós-deploy: checklist de monitoramento

Após ir ao ar, monitore os seguintes itens na primeira semana:

- [ ] **Logs de erro:** Vercel → Functions → Logs (buscar por `error` ou `500`)
- [ ] **Logs de e-mail:** `/configuracoes/logs` no sistema — confirme que e-mails estão sendo entregues
- [ ] **SLA dos cron jobs:** Vercel → Cron Jobs → confirme execuções bem-sucedidas
- [ ] **Quota do Resend:** painel Resend → Usage — se ultrapassar o free tier (100/dia), upgrade para o plano pago

---

## Self-Review

### Cobertura dos requisitos de deploy

| Requisito | Task |
|---|---|
| Banco de dados em produção | Task 1 + 2 |
| Extensão pg_trgm | Task 2, Step 1 |
| Todas as 22 migrations aplicadas | Task 2, Step 3 |
| Linha inicial de platform_settings | Task 2, Step 5 |
| Primeiro usuário admin | Task 3 |
| Resend configurado com domínio | Task 4 |
| E-mail inbound para abertura de chamados | Task 4, Step 4 |
| Deploy Vercel + env vars | Task 5 |
| CRON_SECRET configurado | Task 5, Step 3 |
| Domínio customizado | Task 7 |
| SSO Microsoft | Task 8 |
| Feriados importados | Task 9, Step 3 |
| Configurações de SLA | Task 9, Step 4 |
| Templates de e-mail revisados | Task 9, Step 6 |
| Smoke test de todas as páginas | Task 11 |
| PDF e envio por e-mail validados | Task 11, Steps 2–3 |

### Observações importantes

1. **Plano Vercel Hobby:** cron jobs não funcionam nativamente — use cron-job.org como alternativa (Task 6, Step 3).
2. **`platform_settings` não tem seed automático** — o insert na Task 2, Step 5 é obrigatório para que os e-mails sejam enviados corretamente.
3. **SSO Microsoft é opcional** — o time pode usar email/senha enquanto o Azure AD não for configurado.
4. **Resend inbound** requer registro MX no DNS — dependente do provedor de domínio. Pode ser configurado depois, sem impacto no restante do sistema.
