# Gerenciamento de Templates de E-mail — Especificação de Design

**Data:** 2026-05-21  
**Status:** Aprovado  
**Módulo:** Configurações da Plataforma → Templates de E-mail

---

## Objetivo

Centralizar todos os e-mails automáticos do sistema em templates editáveis via interface, permitindo que Administrador e Gestor personalizem o conteúdo sem necessidade de alteração de código ou redeploy.

---

## Contexto

O sistema ITSM ITRAMOS dispara aproximadamente 35 e-mails automáticos distintos — notificações de chamado, alertas de SLA, avisos de feriado, relatórios mensais, atas de reunião, entre outros. Sem um módulo de gerenciamento, esses textos ficam hardcoded no código, impossibilitando ajustes de tom, correções e personalizações sem intervenção técnica.

---

## Escopo — Categorias de Templates

Todos os templates são editáveis. Organizados por categoria na interface:

| Categoria | Templates incluídos |
|---|---|
| **Chamados** | Chamado aberto, analista respondeu, status alterado, chamado fechado, chamado reaberto, fechamento automático por falta de retorno do cliente (lembrete de 24h + encerramento), lembrete de agendamento (15min antes) |
| **SLA** | Prazo de SLA próximo de vencer, SLA violado |
| **Aprovações** | Solicitação de aprovação (chamado), chamado aprovado, chamado reprovado, alerta de escalonamento por ausência de resposta, encerramento automático por ausência de aprovação, solicitação de aprovação (GMUD), GMUD aprovada, GMUD reprovada |
| **Base de Conhecimento** | Artigo vinculado ao chamado ("Isso resolveu seu problema?") |
| **Feriados e Contratos** | Aviso de feriado, alerta de contrato próximo de vencer (30, 60 e 90 dias) |
| **Financeiro** | Alerta de cobrança pendente |
| **GMUD** | Comunicado de início de janela de manutenção, comunicado de conclusão com sucesso, comunicado de reversão |
| **Reuniões** | Ata de reunião |
| **Tarefas** | Lembrete de vencimento (X dias antes), lembrete no dia do vencimento |
| **Acesso e Senha** | Boas-vindas para novo contato (criado via e-mail), link de definição de senha, lembrete de definição de senha (1º e 2º envio), redefinição de senha |
| **Relatórios** | Relatório mensal PDF (e-mail de envio com o PDF anexo) |
| **Monitoramento** | URL indisponível (notificação para analista e gestor), alerta de problema recorrente detectado |

---

## Interface

### Localização

A tela de gerenciamento de templates fica dentro de **Configurações da Plataforma**, acessível por **Administrador e Gestor**.

### Layout — dois painéis

**Painel esquerdo — lista de templates**
- Templates agrupados por categoria em acordeão expansível
- Campo de busca por nome de template
- Cada template exibe um indicador visual:
  - **Padrão** — texto nunca foi alterado
  - **Personalizado** — foi modificado pelo admin/gestor (exibe data e usuário da última edição)

**Painel direito — editor**

Exibido ao selecionar um template na lista:

- **Nome do template** e **descrição de quando é disparado** (somente leitura — orienta o admin sobre o contexto de envio)
- **Campo Assunto** — texto simples, editável
- **Editor TipTap** — corpo do e-mail com suporte a: negrito, itálico, listas ordenadas e não-ordenadas, links e tabelas
- **Painel "Variáveis disponíveis"** — abaixo do editor, lista todos os placeholders disponíveis para o template atual:
  - Cada variável exibida como chip clicável com nome (`{{chave}}`) e descrição curta
  - Variáveis **obrigatórias** marcadas com asterisco (`*`)
  - Clicar em um chip insere a variável na posição atual do cursor no editor
  - Digitar `{{` no editor abre autocomplete inline com as variáveis disponíveis
  - Variáveis são renderizadas como chips coloridos no interior do editor (distintos do texto comum), evitando edição acidental parcial
- **Botão "Pré-visualizar"** — abre modal com o e-mail renderizado com dados fictícios, já com a identidade visual da ITRAMOS (logo, cores)
- **Botão "Restaurar padrão"** — exige confirmação; restaura `subject` e `body` ao conteúdo original definido no seed; marca o template como **Padrão**
- **Botão "Salvar"** — ao salvar, o sistema verifica se alguma variável obrigatória está ausente no corpo e exibe aviso (não bloqueia o save)

---

## Modelo de Dados

**Tabela: `email_templates`**

| Campo | Tipo | Descrição |
|---|---|---|
| `slug` | `text` (PK) | Identificador único do template (ex: `chamado_aberto`) |
| `category` | `text` | Categoria para agrupamento na UI |
| `name` | `text` | Nome amigável exibido na lista |
| `trigger_description` | `text` | Descrição somente leitura — quando este e-mail é disparado |
| `subject` | `text` | Assunto do e-mail (editável) |
| `body_rich_text` | `jsonb` | Conteúdo TipTap em formato JSON (estado interno do editor) |
| `body_html` | `text` | HTML gerado a partir do rich text — usado no envio real |
| `default_subject` | `text` | Assunto padrão para restauração |
| `default_body_rich_text` | `jsonb` | Corpo padrão para restauração |
| `default_body_html` | `text` | HTML padrão para restauração |
| `available_variables` | `jsonb` | Array de `{ key, label, description, required }` |
| `is_customized` | `boolean` | `true` se editado; controla o indicador na lista |
| `updated_at` | `timestamp` | Data da última edição |
| `updated_by` | `uuid` (FK → users) | Usuário que fez a última edição |

### Seed

Na primeira instalação (via migration), todos os ~35 templates são populados com textos padrão nos campos `subject`, `body_rich_text`, `body_html` e seus equivalentes `default_*`. `is_customized` começa como `false` para todos.

### Restaurar padrão

Copia `default_subject → subject`, `default_body_rich_text → body_rich_text`, `default_body_html → body_html` e redefine `is_customized = false`.

---

## Variáveis por Template (exemplos)

Cada template define seu próprio conjunto de variáveis disponíveis. Exemplos:

**`chamado_aberto`**
| Variável | Descrição | Obrigatória |
|---|---|---|
| `{{numero_chamado}}` | Número único do chamado | Sim |
| `{{titulo_chamado}}` | Título do chamado | Sim |
| `{{nome_cliente}}` | Nome do contato solicitante | Sim |
| `{{nome_analista}}` | Analista responsável | Não |
| `{{prioridade}}` | Prioridade do chamado | Não |
| `{{link_chamado}}` | Link direto para o chamado no portal | Sim |

**`sla_proximo_vencer`**
| Variável | Descrição | Obrigatória |
|---|---|---|
| `{{numero_chamado}}` | Número do chamado | Sim |
| `{{titulo_chamado}}` | Título do chamado | Sim |
| `{{prazo_restante}}` | Tempo restante até vencer o SLA | Sim |
| `{{nome_analista}}` | Analista responsável | Sim |
| `{{link_chamado}}` | Link direto para o chamado | Sim |

*(Cada template terá sua lista completa definida no código e populada no campo `available_variables` do banco.)*

---

## Integração com o Envio de E-mails

Nenhuma lógica de disparo muda. A única alteração é a **origem do conteúdo**:

1. A função de envio recebe o `slug` do template e os valores das variáveis do contexto (ex: `{ numero_chamado: '1234', nome_cliente: 'João Silva', ... }`)
2. Busca o registro no banco pelo `slug`
3. Pega o `body_html` e substitui os placeholders `{{chave}}` pelos valores reais
4. Envia via Resend

O layout externo do e-mail (wrapper HTML com logo ITRAMOS, cabeçalho e rodapé) é aplicado em tempo de envio sobre o `body_html` do template, garantindo identidade visual consistente independentemente de como o admin editar o conteúdo.

---

## Permissões

| Ação | Administrador | Gestor | Analista | Cliente |
|---|---|---|---|---|
| Visualizar templates | Sim | Sim | Não | Não |
| Editar templates | Sim | Sim | Não | Não |
| Restaurar padrão | Sim | Sim | Não | Não |

---

## Fora do Escopo

- Templates de notificação do Teams (Adaptive Cards) — gerenciados separadamente
- Templates de comunicados manuais (módulo Comunicados tem seu próprio editor)
- Criação de novos templates pelo admin (templates são definidos pelo sistema; o admin edita, não cria)
- Versionamento histórico de templates (sem histórico de revisões — apenas a versão atual e o padrão)
