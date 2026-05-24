# ITSM ITRAMOS — Índice de Especificações

**Projeto:** Sistema interno de gestão de chamados B2B  
**Stack:** Next.js 15 (App Router) · Supabase · Resend · Vercel  
**Fase atual:** Fase 1 — Substituição do Freshdesk

---

## Referência

| Arquivo | Descrição | Status |
|---|---|---|
| [itsm-itramos-design.md](2026-05-21-itsm-itramos-design.md) | Spec original completo — visão geral de todos os módulos | Aprovado |
| [email-templates-design.md](2026-05-21-email-templates-design.md) | Gerenciamento de templates de e-mail | Aprovado |

---

## Sub-specs por módulo

| # | Spec | Módulos | Spec Status | Plano |
|---|---|---|---|---|
| 1 | [01-fundacao-design.md](2026-05-22-01-fundacao-design.md) | Autenticação & Perfis · Configurações da Plataforma · Clientes, Contatos e Contratos | Aprovado | [plano criado](../plans/2026-05-22-01-fundacao.md) |
| 2 | [02-chamados-sla-design.md](2026-05-22-02-chamados-sla-design.md) | Chamados (Tickets) · Engine de SLA · Canais de Entrada | Aprovado | Pendente |
| 3 | [03-email-notificacoes-design.md](2026-05-22-03-email-notificacoes-design.md) | Notificações por E-mail · Calendário de Feriados · Comunicados | Aprovado | Pendente |
| 4 | [04-conhecimento-tarefas-reunioes-design.md](2026-05-22-04-conhecimento-tarefas-reunioes-design.md) | Base de Conhecimento · Tarefas e Lembretes · Reuniões | Aprovado | Pendente |
| 5 | [05-gmud-custos-design.md](2026-05-22-05-gmud-custos-design.md) | Gestão de Mudanças (GMUD) · Custos e Atendimento Presencial | Aprovado | Pendente |
| 6 | [06-monitoramento-integracoes-design.md](2026-05-22-06-monitoramento-integracoes-design.md) | Monitoramento (Zabbix · Azure Monitor · URLs) · Integrações Microsoft 365 | Aprovado | Pendente |
| 7 | [07-relatorios-dashboards-design.md](2026-05-22-07-relatorios-dashboards-design.md) | Relatórios · Dashboards · Alertas de recorrência | Aprovado | Pendente |

---

## Dependências entre sub-specs

```
[1 Fundação]
    └── [2 Chamados & SLA]
            └── [3 E-mail & Notificações]
            └── [4 Conhecimento, Tarefas & Reuniões]
            └── [5 GMUD & Custos]
            └── [6 Monitoramento & Integrações]
                    └── [7 Relatórios & Dashboards]
```

Sub-specs 3, 4, 5 e 6 podem ser desenvolvidos em paralelo após o sub-spec 2 estar concluído.  
Sub-spec 7 depende de todos os anteriores (consolida dados de todos os módulos).

---

## Planos de implementação

Os planos são criados e executados **um por vez** em sessões separadas, respeitando os limites de contexto. Criar o próximo plano apenas quando a implementação do plano anterior estiver concluída.

| # | Plano | Status |
|---|---|---|
| 1 | [2026-05-22-01-fundacao.md](../plans/2026-05-22-01-fundacao.md) | Criado — aguardando execução |
| 2 | Plano do sub-spec 2 | A criar (após conclusão do plano 1) |
| 3 | Plano do sub-spec 3 | A criar (após conclusão do plano 2) |
| 4 | Plano do sub-spec 4 | A criar (após conclusão do plano 2) |
| 5 | Plano do sub-spec 5 | A criar (após conclusão do plano 2) |
| 6 | Plano do sub-spec 6 | A criar (após conclusão do plano 2) |
| 7 | Plano do sub-spec 7 | A criar (após conclusão dos planos 3–6) |

---

## Templates de e-mail

O módulo de templates ([email-templates-design.md](2026-05-21-email-templates-design.md)) é transversal — afeta sub-specs 2, 3, 4, 5 e 6. Deve ser implementado junto ou imediatamente após o sub-spec 2.

| Plano | Link | Status |
|---|---|---|
| E-mail Templates | [2026-05-24-email-templates.md](../plans/2026-05-24-email-templates.md) | Implementado |
