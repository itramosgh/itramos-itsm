# Sub-spec 1: Fundação

**Data:** 2026-05-22  
**Status:** Pendente revisão  
**Depende de:** nenhum  
**Bloqueia:** todos os demais sub-specs

---

## Objetivo

Definir a camada base do sistema: autenticação e controle de acesso por papel, configurações centrais da plataforma e o modelo de dados de clientes, contatos e contratos. Todos os demais módulos dependem das tabelas e regras aqui estabelecidas.

---

## Módulos

### 1. Autenticação e Perfis

- Login por e-mail e senha gerenciado pelo Supabase Auth
- **Redefinição de senha:** qualquer usuário (Analista, Gestor, Admin ou Cliente) solicita pelo link "Esqueci minha senha"; o sistema envia e-mail com link tokenizado de uso único com validade de 1 hora; após o uso, o link é invalidado
- Cada usuário pode escolher entre **tema claro**, **tema escuro** ou **sistema** (respeita `prefers-color-scheme` como padrão inicial); a preferência é salva por usuário
- Flag **"Notificar abertura de chamados"** disponível no cadastro de usuários internos (Gestor e Admin); quando ativa, o usuário recebe e-mail a cada novo chamado aberto, independentemente do cliente ou analista; não recebe notificações de interações subsequentes

**Quatro papéis com permissões distintas:**

| Papel | Permissões |
|---|---|
| **Administrador** | Acesso total — configurações, usuários, empresas, contratos, categorias, SLA rules, feriados |
| **Gestor** | Visualização de todos os chamados, dashboards e relatórios; sem acesso às configurações do sistema |
| **Analista** | Atendimento e atualização de chamados; sem acesso a contratos ou relatórios globais |
| **Cliente** | Abertura e acompanhamento dos próprios chamados via portal; sem visibilidade de dados de outros clientes |

> SSO com Microsoft (Azure AD / Entra ID) para usuários internos é tratado no sub-spec 6 (Integrações Microsoft 365).

---

### 2. Configurações da Plataforma

Acessível exclusivamente por Administrador e Gestor. Centraliza as informações institucionais da ITRAMOS usadas em todo o sistema.

**Identidade visual:**
- Upload de duas versões do logotipo — uma para tema claro e uma para tema escuro; o sistema exibe automaticamente a versão correta conforme o tema ativo
- O logo é usado em e-mails, relatório PDF e portal do cliente

**Dados da empresa:**
- Nome da empresa, site institucional, endereço, telefone/WhatsApp de contato da ITRAMOS
- O WhatsApp é exibido na tela de auto-cadastro do portal e no botão flutuante do portal

**E-mail da plataforma:**
- Endereço de envio (ex: `suporte@itramos.com.br`) e nome exibido no remetente

**Configurações de notificação:**
- Antecedência padrão para aviso de feriado (número de dias úteis, padrão: 7)

**Configurações de alerta de recorrência:**
- Número mínimo de chamados similares para disparar alerta (padrão: 3)
- Janela de tempo em dias para a verificação (padrão: 30)

**Horário de atendimento:**
- Dias da semana e horário (padrão: seg–sex, 9h–18h)
- Usado pela Engine de SLA para calcular prazos de primeira resposta

**Tabela de custos padrão:**
- Valor da hora técnica (ex: R$ 250,00/h)
- Valor por km rodado
- Prazo para alerta de cobrança pendente em dias (padrão: 7)

---

**Logs do sistema:**

Tela de monitoramento operacional acessível por Administrador e Gestor.

- Eventos exibidos em ordem cronológica decrescente
- Cada entrada exibe: data/hora, categoria, status (sucesso ou falha), descrição resumida e detalhes expandíveis em caso de erro
- Logs de falha destacados em vermelho
- Filtros: categoria, status e período
- Retenção de 45 dias; entradas mais antigas removidas automaticamente por cron job

| Categoria | Exemplos |
|---|---|
| **E-mail enviado** | Notificação de chamado, relatório mensal, aviso de feriado, lembrete de agendamento |
| **E-mail recebido** | Abertura de chamado via e-mail, resposta de cliente, resposta de aprovação |
| **Webhook recebido** | Alerta Zabbix, alerta Azure Monitor |
| **Monitoramento de URL** | Verificação executada, URL caiu, URL voltou |
| **Cron jobs** | Relatório mensal gerado, lembretes de feriado disparados, fechamento automático |
| **Aprovações** | Solicitação enviada, aprovação/reprovação recebida, expiração por timeout |
| **Autenticação** | Login, logout, redefinição de senha, SSO |

---

**Dashboard de uso do sistema:**

- Tamanho atual do banco de dados
- Espaço utilizado no Supabase Storage e número total de arquivos
- Percentual de uso em relação aos limites do plano
- Breakdown do storage por tipo: anexos de chamados, anexos de comunicados, documentos da base de conhecimento, logotipos de clientes

---

**Limpeza de armazenamento:**

- Filtros antes de executar: chamados fechados há mais de X meses (6, 12 ou 24) e/ou por cliente específico
- Antes de confirmar: resumo com quantidade de arquivos e espaço a ser liberado
- Remove apenas arquivos do Supabase Storage; histórico e mensagens são preservados; referência ao arquivo marcada como removida
- Anexos vinculados a artigos da base de conhecimento não são afetados
- Operação irreversível; exige confirmação explícita do Administrador

---

### 3. Clientes e Contatos

**Empresas:**
- Campos: nome, CNPJ, segmento, endereço, logotipo
- Cada empresa pode ter um ou mais **domínios de e-mail cadastrados** (ex: `empresa.com.br`, `grupoempresa.com`) — usados para validar auto-cadastro no portal e abertura de chamados por e-mail
- Flag **"Bloqueado"** por empresa — quando ativada por Administrador ou Gestor:
  - Impede abertura de novos chamados por qualquer canal (portal, e-mail, Zabbix, Azure Monitor, monitoramento de URL)
  - Chamados já abertos continuam em atendimento normalmente
  - Portal: mensagem informando bloqueio temporário com WhatsApp da ITRAMOS
  - E-mail: resposta automática com a mesma informação
  - Chamados automáticos de monitoramento são descartados silenciosamente

**Contatos:**
- Campos: nome, e-mail, telefone, departamento — vinculado a uma empresa no cadastro
- Cada número de telefone pode ser marcado como **WhatsApp** — exibe botão de atalho na tela do chamado direcionando para `wa.me/<numero>`
- Flag **"responsável pelo contrato"** — recebe relatório mensal e avisos de feriado; somente Administrador e Gestor podem alterar
- Flag **"receber cópia de notificações de chamados"** — recebe cópia de todos os e-mails de notificação dos chamados da empresa; somente Administrador e Gestor podem alterar
- Um contato pode ter acesso ao portal (usuário cliente) — quando ativado, uma conta Supabase Auth é criada e vinculada ao contato

---

### 4. Contratos

- Vinculado a uma empresa cliente
- Campos: data de início, data de fim, data de renovação, serviços contratados (lista de texto livre), responsáveis (contatos da empresa), status
- Status possíveis: `Ativo`, `Expirado`, `Renovação Pendente`
- Um cliente pode ter mais de um contrato ativo simultaneamente

**Dispositivos contratados:**
- Lista com tipo de dispositivo e quantidade; múltiplas entradas por contrato (ex: 30 Notebooks, 3 Servidores Windows)
- Tipos de dispositivo cadastrados pelo Administrador e disponíveis como opção na lista

**SLA por prioridade:**
- O contrato define diretamente os prazos de primeira resposta por prioridade
- Quatro prioridades: Crítica, Alta, Média, Baixa
- Cada cliente tem seus próprios valores — sem abstração de tiers

**Flag 24x7:**
- Quando marcada, o cronômetro de SLA corre continuamente sem pausas por horário comercial, feriados ou finais de semana

---

## Schema do Banco de Dados

### Tabelas

#### `public.profiles`
Estende `auth.users` para usuários internos (Admin, Gestor, Analista).

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK | Igual ao `auth.users.id` |
| `full_name` | `text` NOT NULL | Nome completo |
| `role` | `text` NOT NULL | `admin` \| `gestor` \| `analista` |
| `notify_new_tickets` | `boolean` DEFAULT `false` | Flag de notificação de abertura |
| `theme` | `text` DEFAULT `'system'` | `light` \| `dark` \| `system` |
| `is_active` | `boolean` DEFAULT `true` | Soft delete |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

> Clientes (portal) não têm registro em `profiles` — são identificados pela presença de `contacts.user_id` preenchido.

---

#### `public.platform_settings`
Tabela singleton (sempre uma única linha, `id = 1`).

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `integer` PK DEFAULT `1` | Sempre 1 |
| `company_name` | `text` | Nome da empresa |
| `company_website` | `text` | Site institucional |
| `company_address` | `text` | Endereço |
| `company_phone` | `text` | Telefone de contato |
| `company_whatsapp` | `text` | Número WhatsApp (usado no portal) |
| `logo_light_url` | `text` | URL do logo para tema claro (Supabase Storage) |
| `logo_dark_url` | `text` | URL do logo para tema escuro (Supabase Storage) |
| `email_from_address` | `text` | Endereço de envio dos e-mails |
| `email_from_name` | `text` | Nome exibido no remetente |
| `holiday_notice_days` | `integer` DEFAULT `7` | Dias de antecedência para aviso de feriado |
| `recurrence_min_tickets` | `integer` DEFAULT `3` | Mínimo de chamados similares para alerta |
| `recurrence_window_days` | `integer` DEFAULT `30` | Janela de tempo para detecção de recorrência |
| `business_hours_start` | `time` DEFAULT `'09:00'` | Início do horário comercial |
| `business_hours_end` | `time` DEFAULT `'18:00'` | Fim do horário comercial |
| `business_hours_days` | `integer[]` DEFAULT `'{1,2,3,4,5}'` | Dias da semana (1=seg … 7=dom) |
| `hourly_rate` | `numeric(10,2)` | Valor da hora técnica |
| `km_rate` | `numeric(10,2)` | Valor por km rodado |
| `billing_alert_days` | `integer` DEFAULT `7` | Prazo para alerta de cobrança pendente |
| `updated_at` | `timestamptz` | Data da última alteração |
| `updated_by` | `uuid` FK → `profiles.id` | Usuário que fez a última alteração |

---

#### `public.system_logs`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `category` | `text` NOT NULL | `email_sent` \| `email_received` \| `webhook_received` \| `url_monitoring` \| `cron_job` \| `approval` \| `auth` |
| `status` | `text` NOT NULL | `success` \| `failure` |
| `description` | `text` NOT NULL | Resumo legível do evento |
| `details` | `jsonb` | Detalhes expandíveis (stack trace, payload, etc.) |
| `created_at` | `timestamptz` DEFAULT `now()` | |

---

#### `public.companies`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `name` | `text` NOT NULL | Nome da empresa |
| `cnpj` | `text` | CNPJ |
| `segment` | `text` | Segmento de atuação |
| `address` | `text` | Endereço completo |
| `logo_url` | `text` | URL do logo (Supabase Storage) |
| `is_blocked` | `boolean` DEFAULT `false` | Flag de bloqueio |
| `is_active` | `boolean` DEFAULT `true` | Soft delete |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

#### `public.company_email_domains`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `company_id` | `uuid` NOT NULL FK → `companies.id` | |
| `domain` | `text` NOT NULL | Ex: `empresa.com.br` |
| `created_at` | `timestamptz` DEFAULT `now()` | |

---

#### `public.contacts`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `company_id` | `uuid` NOT NULL FK → `companies.id` | |
| `user_id` | `uuid` FK → `auth.users.id` | Preenchido quando o contato tem acesso ao portal |
| `full_name` | `text` NOT NULL | |
| `email` | `text` NOT NULL | |
| `phone` | `text` | |
| `is_whatsapp` | `boolean` DEFAULT `false` | Telefone é WhatsApp |
| `department` | `text` | Departamento |
| `is_contract_responsible` | `boolean` DEFAULT `false` | Recebe relatório mensal e avisos de feriado |
| `receives_ticket_cc` | `boolean` DEFAULT `false` | Recebe cópia das notificações de chamados |
| `is_active` | `boolean` DEFAULT `true` | Soft delete |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

#### `public.contracts`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `company_id` | `uuid` NOT NULL FK → `companies.id` | |
| `start_date` | `date` NOT NULL | Data de início |
| `end_date` | `date` | Data de término |
| `renewal_date` | `date` | Data de renovação |
| `services` | `text[]` | Lista de serviços contratados |
| `status` | `text` DEFAULT `'ativo'` | `ativo` \| `expirado` \| `renovacao_pendente` |
| `is_24x7` | `boolean` DEFAULT `false` | SLA corre continuamente |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | |

---

#### `public.device_types`
Cadastro de tipos de dispositivo, gerenciado pelo Administrador.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `name` | `text` NOT NULL | Ex: `Notebook`, `Servidor Windows` |
| `is_active` | `boolean` DEFAULT `true` | Soft delete |
| `created_at` | `timestamptz` DEFAULT `now()` | |

---

#### `public.contract_devices`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `contract_id` | `uuid` NOT NULL FK → `contracts.id` | |
| `device_type_id` | `uuid` NOT NULL FK → `device_types.id` | |
| `quantity` | `integer` NOT NULL | |

---

#### `public.contract_sla_rules`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` PK DEFAULT `gen_random_uuid()` | |
| `contract_id` | `uuid` NOT NULL FK → `contracts.id` | |
| `priority` | `text` NOT NULL | `critica` \| `alta` \| `media` \| `baixa` |
| `response_hours` | `numeric(5,2)` NOT NULL | Prazo de primeira resposta em horas |

Constraint: `UNIQUE (contract_id, priority)`

---

### RLS Policies

O papel do usuário é armazenado em `auth.users.raw_app_meta_data -> 'role'` e acessado nas policies via função auxiliar:

```sql
create or replace function public.get_user_role()
returns text as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    'cliente'
  );
$$ language sql stable security definer;
```

---

#### `profiles`

| Operação | Quem pode |
|---|---|
| SELECT | Todos os autenticados (analistas precisam ver nomes de colegas) |
| INSERT | Service role (via API — Admin cria usuários pelo painel) |
| UPDATE | Admin atualiza qualquer registro; Gestor e Analista atualizam apenas o próprio |
| DELETE | Service role |

---

#### `platform_settings`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor, Analista |
| INSERT / UPDATE | Admin, Gestor |
| DELETE | Ninguém (singleton — nunca deletado) |

---

#### `system_logs`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor |
| INSERT | Service role |
| UPDATE / DELETE | Ninguém |

---

#### `companies`

| Operação | Quem pode |
|---|---|
| SELECT | Admin/Gestor/Analista veem todas; Cliente vê apenas a própria empresa (`contacts.company_id = companies.id` onde `contacts.user_id = auth.uid()`) |
| INSERT | Admin |
| UPDATE | Admin, Gestor |
| DELETE | Admin (soft delete via `is_active`) |

---

#### `company_email_domains`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor, Analista |
| INSERT / UPDATE / DELETE | Admin |

---

#### `contacts`

| Operação | Quem pode |
|---|---|
| SELECT | Admin/Gestor/Analista veem todos; Cliente vê apenas o próprio registro |
| INSERT | Admin, Gestor |
| UPDATE | Admin e Gestor atualizam qualquer campo; Analista não atualiza; Cliente atualiza apenas tema (via `profiles` — não em `contacts`) |
| DELETE | Admin (soft delete via `is_active`) |

> Flags `is_contract_responsible` e `receives_ticket_cc` só podem ser alteradas por Admin e Gestor — garantido na policy de UPDATE.

---

#### `contracts`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor |
| INSERT / UPDATE | Admin, Gestor |
| DELETE | Admin |

> Analistas não têm acesso direto a contratos. A Engine de SLA lê contratos via service role nas API routes.

---

#### `device_types`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor, Analista |
| INSERT / UPDATE | Admin |
| DELETE | Admin (soft delete via `is_active`) |

---

#### `contract_devices` e `contract_sla_rules`

| Operação | Quem pode |
|---|---|
| SELECT | Admin, Gestor |
| INSERT / UPDATE / DELETE | Admin, Gestor |

---

## Critérios de Conclusão

- [ ] Login e logout funcionando via Supabase Auth
- [ ] Redefinição de senha com link tokenizado e expiração de 1 hora
- [ ] Quatro papéis implementados com RLS aplicado em todas as tabelas
- [ ] CRUD de usuários internos (Admin/Gestor/Analista) funcional
- [ ] Tela de Configurações da Plataforma com todos os campos salvando corretamente
- [ ] Dashboard de uso do sistema exibindo dados reais do Supabase
- [ ] Limpeza de storage com preview e confirmação funcionando
- [ ] Logs do sistema registrando eventos e exibindo na tela com filtros
- [ ] CRUD de empresas com upload de logo e gestão de domínios de e-mail
- [ ] Flag de bloqueio por empresa implementada com mensagens nos canais corretos
- [ ] CRUD de contatos com todas as flags e link opcional ao portal
- [ ] CRUD de contratos com dispositivos e regras de SLA por prioridade
- [ ] Todas as 10 tabelas criadas via migration com constraints e indexes corretos
- [ ] RLS ativo e testado para todos os papéis em todas as tabelas
