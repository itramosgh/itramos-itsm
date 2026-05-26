# ITSM ITRAMOS — Especificação de Design (Fase 1)

**Data:** 2026-05-21  
**Status:** Aprovado  
**Fase:** 1 — Substituição do Freshdesk  

---

## Objetivo

Construir um sistema interno para a ITRAMOS gerenciar chamados de clientes B2B, contratos, SLA e relatórios. O sistema substitui o uso atual do Freshdesk (plano gratuito) e serve como base para a Fase 2, que incluirá bot de IA, chat ao vivo e integração com WhatsApp.

---

## Contexto

A ITRAMOS é uma empresa de TI que presta serviços para clientes B2B. Os serviços incluem suporte técnico, gestão de incidentes, solicitações de serviço, mudanças de infraestrutura e novos serviços como criação de sites institucionais, landing pages e agentes de IA. A equipe interna é composta por analistas, gestor de área e administrador do sistema.

---

## Módulos

### 1. Configurações da Plataforma

Acessível exclusivamente pelo Administrador. Centraliza as informações institucionais da ITRAMOS usadas em todo o sistema.

- **Identidade visual:** upload de duas versões do logotipo — uma para **tema claro** e uma para **tema escuro** (o sistema exibe automaticamente a versão correta conforme o tema ativo); o logo é usado em e-mails, relatório PDF e portal do cliente
- **Dados da empresa:** nome da empresa, site institucional, endereço, telefone/WhatsApp de contato da ITRAMOS (exibido na tela de auto-cadastro do portal)
- **E-mail da plataforma:** endereço de envio dos e-mails do sistema (ex: `suporte@itramos.com.br`), nome exibido no remetente
- **Configurações de notificação:** antecedência padrão para aviso de feriado (número de dias úteis)
- **Configurações de alerta de recorrência:** número mínimo de chamados similares e janela de tempo (dias) para disparar o alerta
- **Horário de atendimento:** dias da semana e horário (padrão: seg–sex, 9h–18h) — usado pela Engine de SLA
- **Tabela de custos padrão:** valor da hora técnica (ex: R$ 250,00/h), valor por km rodado, prazo para alerta de cobrança pendente (em dias, padrão: 7)

**Logs do sistema:**
- Tela de monitoramento operacional acessível pelo Administrador e Gestor, exibindo os eventos recentes do sistema em ordem cronológica
- Cada entrada de log exibe de forma simples: data/hora, tipo do evento, status (sucesso ou falha), descrição resumida e detalhes expandíveis em caso de erro
- Categorias de eventos monitorados:

| Categoria | Exemplos |
|---|---|
| **E-mail enviado** | Notificação de chamado, relatório mensal, aviso de feriado, lembrete de agendamento |
| **E-mail recebido** | Abertura de chamado via e-mail, resposta de cliente, resposta de aprovação |
| **Webhook recebido** | Alerta Zabbix, alerta Azure Monitor |
| **Monitoramento de URL** | Verificação executada, URL caiu, URL voltou |
| **Cron jobs** | Relatório mensal gerado, lembretes de feriado disparados, fechamento automático por falta de retorno |
| **Aprovações** | Solicitação enviada, aprovação/reprovação recebida, expiração por timeout |
| **Autenticação** | Login, logout, redefinição de senha, SSO |

- Filtros por categoria, status (sucesso/falha) e período
- Logs de falha ficam destacados em vermelho para fácil identificação
- Retenção de 45 dias de logs; logs mais antigos são removidos automaticamente

**Dashboard de uso do sistema:**
- Painel exibindo em tempo real: tamanho atual do banco de dados, espaço utilizado no storage, número total de arquivos armazenados e percentual de uso em relação aos limites do plano
- Breakdown do storage por tipo: anexos de chamados, anexos de comunicados, documentos da base de conhecimento, logotipos de clientes

**Limpeza de armazenamento:**
- Função de limpeza de anexos de chamados com filtros configuráveis antes de executar: chamados fechados há mais de X meses (ex: 6, 12, 24 meses) e/ou por cliente específico
- Antes de confirmar, o sistema exibe um resumo do que será removido: quantidade de arquivos e espaço que será liberado
- A limpeza remove apenas os arquivos do storage — o histórico e as mensagens do chamado são preservados; apenas a referência ao arquivo é marcada como removida
- Anexos vinculados a artigos da base de conhecimento não são afetados pela limpeza de chamados
- A operação é irreversível e requer confirmação explícita do Administrador

### 2. Autenticação e Perfis


- Login por e-mail e senha gerenciado pelo Supabase Auth
- **Redefinição de senha:** qualquer usuário (Analista, Gestor, Admin ou Cliente) pode solicitar redefinição pelo link "Esqueci minha senha" na tela de login; o sistema envia um e-mail com link tokenizado e de uso único; o token expira automaticamente após 1 hora; após o uso, o link é invalidado
- Cada usuário (interno e cliente) pode escolher entre **tema claro e tema escuro** nas configurações do seu perfil; a preferência é salva por usuário e aplicada automaticamente no próximo acesso
- O sistema respeita também a preferência do sistema operacional do usuário como padrão inicial (via `prefers-color-scheme`), podendo ser sobrescrita manualmente
- No cadastro de usuários internos (Gestor e Administrador), há uma flag **"Notificar abertura de chamados"** — se marcada, o usuário recebe um e-mail sempre que qualquer chamado novo for aberto no sistema, independentemente do cliente ou analista responsável; não recebe notificações de interações subsequentes
- Quatro papéis com permissões distintas:
  - **Administrador:** acesso total — configurações do sistema, usuários, empresas, contratos, categorias, SLA rules, calendário de feriados
  - **Gestor:** visualização de todos os chamados, dashboards e relatórios; sem acesso à configuração do sistema
  - **Analista:** atendimento e atualização de chamados; sem acesso a contratos ou relatórios globais
  - **Cliente:** abertura e acompanhamento dos próprios chamados via portal; sem visibilidade de dados de outros clientes

### 3. Clientes e Contatos

- Cadastro de empresas clientes com: nome, CNPJ, segmento, endereço, logotipo
- Cada empresa pode ter **um ou mais domínios de e-mail cadastrados** (ex: `empresa.com.br`, `grupoempresa.com`) — usados para validar auto-cadastro no portal e abertura de chamados por e-mail
- Flag **"Bloqueado"** por empresa — quando ativada por Administrador ou Gestor, impede a abertura de novos chamados para aquele cliente por qualquer canal (portal, e-mail, Zabbix, Azure Monitor, monitoramento de URL); chamados já abertos continuam em atendimento normalmente
- Quando um cliente bloqueado tenta abrir um chamado pelo portal, vê uma mensagem informando que o cliente está temporariamente bloqueado para abertura de chamados e deve entrar em contato com a ITRAMOS (exibe o WhatsApp configurado na plataforma)
- Tentativas de abertura via e-mail recebem resposta automática com a mesma informação
- Chamados automáticos do Zabbix, Azure Monitor e monitoramento de URL são descartados silenciosamente enquanto o cliente estiver bloqueado
- Cada empresa pode ter múltiplos contatos
- Contato: nome, e-mail, telefone, departamento — cada contato é vinculado a uma empresa no momento do cadastro
- Cada número de telefone pode ser marcado como **WhatsApp** — quando marcado, exibe um botão de atalho na tela do chamado que redireciona o analista diretamente para a conversa com o contato via WhatsApp Web (`wa.me/<numero>`), sem necessidade de integração com API
- Flag **"responsável pelo contrato"** — recebe relatório mensal e avisos de feriado; somente **Administrador e Gestor** podem marcar ou desmarcar esta flag
- Flag **"receber cópia de notificações de chamados"** — se marcada, recebe cópia de todos os e-mails de notificação dos chamados da empresa; somente **Administrador e Gestor** podem marcar ou desmarcar esta flag

### 4. Contratos

- Vinculado a uma empresa cliente
- Campos: data de início, data de fim, data de renovação, serviços contratados (lista), responsáveis (contatos da empresa), status (Ativo, Expirado, Renovação Pendente)
- **Dispositivos contratados:** lista com tipo de dispositivo e quantidade, permitindo múltiplas entradas por contrato (ex: 30 Notebooks, 3 Servidores Windows, 2 Servidores Linux, 5 Switches); os tipos de dispositivo são cadastrados pelo Administrador e ficam disponíveis como opção na lista
- O contrato define diretamente os prazos de primeira resposta por prioridade (Crítica, Alta, Média, Baixa) — sem abstração de tiers
- Flag **"Atendimento 24x7"** no contrato — quando marcada, o cronômetro de SLA corre continuamente, sem pausas por horário comercial, feriados ou finais de semana
- Um cliente pode ter mais de um contrato ativo

### 5. Chamados (Tickets)

**Dados do chamado:**
- Número único gerado automaticamente
- Título e descrição
- Categoria: Suporte Técnico, Incidente, Solicitação de Serviço, Mudança de Infraestrutura, Criação de Site Institucional, Landing Page, Agente de IA
- Prioridade: Crítica, Alta, Média, Baixa
- Status: Aberto, Agendado, Em Andamento, Aguardando Cliente, Aguardando Fornecedor, Aguardando Aprovação, Em Mudança, Resolvido, Fechado, Reaberto
- Canal de entrada: Portal Web, E-mail, Zabbix, Azure Monitor, Monitoramento de URL (Zabbix e Azure Monitor via módulo unificado de Integrações de Monitoramento)
- Empresa e contato vinculados
- Analista responsável (pode ser não atribuído)
- Datas: abertura, última atualização, fechamento
- Histórico completo de interações (mensagens, atualizações de status, trocas de analista)
- **Anexos:** arquivos podem ser anexados na abertura do chamado e em qualquer interação posterior, por qualquer parte (solicitante, responsável, analista); armazenados no Supabase Storage

**Agendamento:**
- Ao selecionar o status **"Agendado"**, o sistema exibe obrigatoriamente um seletor de data e hora para o analista definir quando o atendimento ocorrerá — o status só é salvo após o preenchimento da data/hora
- A data e hora agendada ficam visíveis no chamado e na lista de chamados com destaque visual
- **15 minutos antes do horário agendado**, o sistema envia automaticamente um e-mail de lembrete para o analista responsável e para o solicitante (e para o responsável pelo contrato, se a flag de cópia estiver ativa)
- O lembrete inclui: número e título do chamado, horário agendado e link direto para o chamado
- O envio do lembrete é gerenciado por um job agendado (cron) no servidor
- Quando o horário agendado chegar, o status do chamado muda automaticamente para **"Em Andamento"**

**Fluxo de aprovação:**
- O Administrador pode marcar categorias como **"requer aprovação"** (ex: Liberação de Acesso, Instalação de Software)
- O fluxo é acionado no momento em que o analista **categoriza** o chamado — independente do canal de entrada (portal, e-mail, monitoramento de URL); **chamados originados por integrações de monitoramento (Zabbix, Azure Monitor) estão explicitamente excluídos deste fluxo**
- Ao selecionar uma categoria que requer aprovação, o chamado muda automaticamente para status **"Aguardando Aprovação"** e o analista fica bloqueado de enviar qualquer resposta ao cliente até a aprovação
- Ao acionar o fluxo, o sistema exibe um modal para o analista definir o aprovador com duas opções combinadas:
  - **Selecionar contato cadastrado** — busca entre os contatos ativos daquele cliente
  - **Digitar e-mail manualmente** — para aprovadores externos ou não cadastrados no sistema (ex: gestor terceirizado do cliente)
- O analista deve preencher obrigatoriamente um dos dois antes de confirmar; o sistema então envia o e-mail de solicitação de aprovação para o endereço definido
- O aprovador externo (não cadastrado) recebe o e-mail com os links de Aprovar/Reprovar normalmente — sem precisar ter acesso ao sistema
- **Exceção:** se o e-mail do aprovador selecionado for o mesmo do solicitante que abriu o chamado, o sistema aprova automaticamente sem enviar e-mail, registrando no histórico "Aprovado automaticamente — solicitante e aprovador são a mesma pessoa"
- O aprovador pode **Aprovar** ou **Reprovar** diretamente pelo link no e-mail ou pelo portal
- Se aprovado → analista é notificado e o chamado libera para atendimento
- Se reprovado → analista e cliente são notificados com o motivo; chamado volta para status anterior
- Se sem resposta em X horas (configurável pelo Admin) → alerta de escalonamento enviado ao Gestor
- Se o chamado permanecer **"Aguardando Aprovação" por mais de 2 dias** sem resposta do aprovador → o chamado é encerrado automaticamente com a nota "Chamado encerrado por ausência de aprovação após 2 dias"; solicitante, analista e Gestor são notificados por e-mail
- **Reforço para chamados por e-mail:** o sistema escaneia o título e corpo em busca de palavras-chave como "liberar", "acesso", "instalar", "autorização" e destaca o chamado visualmente para o analista como aviso — sem acionar o fluxo automaticamente, evitando falsos positivos

**Templates de resposta:**
- O Administrador e o Gestor podem criar templates de resposta com texto fixo e **variáveis** marcadas com `{{nome_da_variavel}}` (ex: `{{nome_usuario}}`, `{{senha}}`, `{{validade}}`, `{{nome_cliente}}`)
- Templates são organizados por categoria (ex: Acesso, Instalação, Informativo, Senha Temporária)
- Ao responder um chamado, o analista pode selecionar um template — o sistema exibe um formulário com apenas os campos variáveis para preenchimento, sem expor o texto completo para edição livre
- Após preencher as variáveis, o texto final é gerado com os valores inseridos e adicionado à resposta do chamado; o analista pode revisar antes de enviar
- Algumas variáveis são preenchidas automaticamente pelo sistema: `{{nome_cliente}}`, `{{numero_chamado}}`, `{{nome_analista}}`, `{{data_hoje}}`
- Templates podem ser criados, editados e desativados pelo Admin e Gestor; Analistas apenas utilizam

**Vincular artigo da base de conhecimento ao chamado:**
- Em qualquer momento durante o atendimento, o analista pode buscar e vincular um ou mais artigos da base de conhecimento ao chamado
- Ao vincular, o sistema envia automaticamente um e-mail ao solicitante (e ao responsável com flag de cópia, se ativa) com o título do artigo, um resumo e o link direto para consulta no portal
- O e-mail inclui uma pergunta "Isso resolveu seu problema?" com dois botões de resposta — **Sim, resolvido** ou **Não, ainda preciso de ajuda**
- Se o solicitante clicar em "Sim, resolvido": o chamado é fechado automaticamente com nota "Resolvido via artigo da base de conhecimento"
- Se clicar em "Não, ainda preciso de ajuda": o chamado continua em atendimento e o analista é notificado
- Os artigos vinculados ficam visíveis no histórico do chamado para consulta futura

**Encerramento e base de conhecimento:**
- Ao fechar um chamado, o analista preenche o campo de resolução descrevendo o que foi feito
- Na mesma tela de encerramento, há uma opção **"Salvar na base de conhecimento"** — ao marcar, o analista pode revisar/editar o título e a descrição da solução antes de confirmar
- O artigo é criado na base de conhecimento já vinculado ao chamado de origem, com a categoria herdada do chamado

**Busca e filtros:**
- Barra de pesquisa global que busca por: número do chamado, título, descrição e nome do solicitante
- Filtros combinativos: categoria, prioridade, status, analista responsável, empresa/cliente e período de abertura
- Resultados em tempo real conforme o usuário digita (busca via `pg_trgm` ou full-text search do PostgreSQL)
- Disponível tanto na visão interna (analistas, gestor) quanto no portal do cliente (restrito aos chamados da própria empresa)

**Regras de negócio:**
- Quando o chamado entra em status **"Aguardando Cliente"**, o sistema inicia um ciclo automático:
  - A cada **24 horas**, envia e-mail ao solicitante (e ao responsável com flag de cópia, se ativa) pedindo retorno, com link direto para o chamado
  - Se o cliente não responder em **2 dias**, o chamado é fechado automaticamente com a nota "Chamado encerrado por falta de retorno do cliente após 2 dias de espera"
  - O analista responsável e o Gestor recebem notificação do fechamento automático
  - Se o cliente responder (por e-mail ou pelo portal) antes dos 2 dias, o ciclo é interrompido e o chamado volta ao status "Em Andamento" automaticamente
- Chamado fechado pode ser reaberto pelo cliente ou pelo analista em até **7 dias** após o fechamento
- Após 7 dias, o chamado não pode ser reaberto — um novo chamado deve ser aberto
- Cada reabertura gera um evento no histórico com data, quem reabriu e motivo
- Chamados reabertos voltam ao status "Reaberto" e contam separadamente nas estatísticas

### 6. Notificações por E-mail

O sistema mantém todas as partes informadas por e-mail em tempo real, com comunicação bidirecional.

**Destinatários e flags:**
- **Solicitante:** sempre recebe todas as notificações do chamado
- **Responsável pelo contrato:** campo flag no cadastro do contrato — se marcado, recebe cópia de todos os e-mails que o solicitante recebe
- **Analista responsável:** recebe notificação quando o solicitante ou responsável atualiza o chamado

**Gatilhos de notificação:**

| Evento | Quem recebe |
|---|---|
| Chamado aberto | Solicitante + Responsável (se flag ativa) + Gestor/Admin com flag "Notificar abertura" |
| Analista adiciona interação/resposta | Solicitante + Responsável (se flag ativa) |
| Solicitante ou Responsável atualiza o chamado | Analista responsável |
| Status do chamado alterado | Solicitante + Responsável (se flag ativa) |
| Chamado fechado | Solicitante + Responsável (se flag ativa) |
| Chamado reaberto | Analista responsável |

**Conteúdo dos e-mails:**
- Identificação do chamado (número e título)
- **Apenas o último trâmite** — somente a mensagem ou atualização mais recente é incluída no e-mail, sem repetir o histórico anterior; isso evita e-mails longos e reduz consumo desnecessário
- **Link direto para o chamado** no portal para consultar o histórico completo quando necessário
- Identidade visual da ITRAMOS

**Anexos nos e-mails:**
- Arquivos anexados pelo analista ou pelo sistema em uma interação são incluídos como anexos reais no e-mail enviado ao solicitante/responsável
- Arquivos anexados pelo solicitante ou responsável via resposta de e-mail são capturados e salvos no histórico do chamado (Supabase Storage)
- **Conteúdo inline do e-mail é ignorado** — imagens embutidas no corpo, assinaturas com logo e outros elementos inline não são processados nem salvos como anexo; apenas arquivos explicitamente anexados são capturados

**Resposta por e-mail (bidirecional):**
- O solicitante pode responder ao e-mail recebido — a resposta é adicionada automaticamente ao histórico do chamado
- O responsável pelo contrato também pode responder, e a resposta entra no histórico identificada com seu nome
- Implementado via Resend Inbound: cada chamado tem um endereço de resposta único (ex: `chamado-1234@reply.itramos.com.br`)
- Respostas fora do prazo de reabertura (após 7 dias do fechamento) são descartadas com e-mail informativo

### 7. Canais de Entrada

**Portal Web — auto-cadastro:**
- Na tela de login do portal, o usuário pode clicar em "Criar conta"
- O sistema solicita nome e e-mail
- Se o domínio do e-mail estiver cadastrado em uma empresa ativa, o cadastro é permitido: o usuário define uma senha e é criado como contato da empresa, sem nenhuma flag especial
- Se o domínio não for encontrado ou a empresa estiver inativa, o cadastro é negado com mensagem orientando a contatar a ITRAMOS — a tela exibe o WhatsApp da ITRAMOS cadastrado nas Configurações da Plataforma, com botão de atalho direto para o contato via WhatsApp Web
- Após o auto-cadastro, o Administrador pode posteriormente ajustar as flags do contato (responsável, cópia de notificações)

**Portal Web — acesso autenticado:**
- Área autenticada onde o cliente abre chamados, acompanha status, recebe atualizações e reabre chamados dentro do prazo
- Visibilidade restrita aos chamados da própria empresa
- **Botão flutuante de WhatsApp** fixo no canto inferior direito de todas as telas do portal — ao clicar, abre o WhatsApp Web direcionando para o número cadastrado nas Configurações da Plataforma; o botão aparece tanto na tela de login quanto nas áreas autenticadas

**E-mail — solicitante conhecido:**
- E-mail dedicado para abertura de chamados (ex: suporte@itramos.com.br)
- E-mails de remetentes já cadastrados criam automaticamente um chamado no sistema via Resend Inbound
- Respostas ao e-mail do chamado são adicionadas ao histórico

**E-mail — solicitante desconhecido:**
- Se o remetente não estiver cadastrado mas o domínio do seu e-mail pertencer a uma empresa ativa, o sistema responde automaticamente solicitando as informações necessárias para cadastro (nome completo, telefone, departamento) e pergunta se o número de telefone informado é WhatsApp; se sim, a flag de WhatsApp é marcada automaticamente no cadastro do contato
- Após o usuário responder com os dados, o cadastro é criado como contato da empresa sem nenhuma flag especial, e o chamado original é aberto
- O sistema envia automaticamente um e-mail de boas-vindas com um **link para o contato definir sua senha** de acesso ao portal; o link expira em **24 horas**
- Caso o contato não defina a senha dentro do prazo, o sistema envia **até 2 lembretes** com intervalo de 7 dias cada, com novo link de definição de senha (validade de 24 horas); após o segundo lembrete sem resposta, os envios automáticos cessam
- No cadastro do contato, Administrador e Gestor podem clicar em **"Reenviar e-mail de definição de senha"** a qualquer momento para enviar manualmente um novo link — útil quando os lembretes automáticos já se esgotaram
- Após a criação da senha, os lembretes cessam automaticamente
- Se o remetente mencionar que é responsável pelo contrato, essa informação é ignorada no cadastro automático — somente **Administrador e Gestor** podem atribuir essa flag
- Se o domínio do remetente não estiver cadastrado em nenhuma empresa ativa, o e-mail é descartado com resposta informando que o endereço não é reconhecido

### 8. Engine de SLA

- SLA mede exclusivamente o **prazo de primeira resposta** (primeiro contato do analista com o cliente após abertura)
- O prazo é configurado diretamente no contrato do cliente, por prioridade. Exemplo:
  - Crítica: 2 horas
  - Alta: 4 horas
  - Média: 8 horas
  - Baixa: 24 horas
- Cada cliente tem seus próprios valores de SLA, sem abstração de tiers
- Para contratos **sem** flag 24x7: o cronômetro corre apenas dentro do **horário comercial: segunda a sexta-feira, das 9h às 18h**, e pausa automaticamente em feriados nacionais e municipais de São Paulo
- Para contratos **com** flag 24x7: o cronômetro corre continuamente, sem pausas por horário, feriados ou finais de semana
- O cronômetro também pausa enquanto o chamado estiver com status **"Aguardando Fornecedor"** — retoma automaticamente quando o analista alterar o status para outro
- O sistema registra para cada chamado: prazo previsto, se foi cumprido ou violado, e o tempo real de primeira resposta
- Alertas internos são disparados para o analista e gestor quando o prazo está próximo de vencer

### 9. Calendário de Feriados

- Feriados nacionais são importados automaticamente via **BrasilAPI** (`/feriados/v1/{ano}`)
- Feriados municipais de São Paulo cobertos pela BrasilAPI são importados junto
- Feriados não cobertos pela API podem ser cadastrados manualmente pelo Administrador ou Gestor
- O calendário é atualizado a cada virada de ano ou sob demanda pelo Administrador ou Gestor

**E-mail de aviso de feriado:**
- Para cada feriado, o sistema envia automaticamente um e-mail para todos os responsáveis de contratos ativos
- Conteúdo: nome do feriado, data, aviso de que a ITRAMOS não atenderá naquele dia, sugestão de antecipar solicitações
- O Administrador e o Gestor configuram quantos dias de antecedência o e-mail é enviado (padrão: 7 dias antes)
- O envio é realizado via Resend com identidade visual da ITRAMOS

### 10. Base de Conhecimento

**Criação de artigos:**
- Ao resolver um chamado, o analista tem a opção de marcar a resolução como artigo da base de conhecimento
- O artigo é criado a partir do chamado com: título, descrição do problema, solução aplicada, categoria e tags
- O analista pode editar o título e a solução antes de salvar, para deixar o conteúdo claro e reutilizável
- Artigos podem ser desativados pelo Administrador ou Gestor (sem exclusão permanente)

**Sugestão automática para o solicitante:**
- Durante a abertura de um chamado no portal, conforme o solicitante digita o título/descrição, o sistema busca artigos similares na base de conhecimento usando `pg_trgm`
- Artigos relevantes são exibidos ao lado do formulário com a pergunta "Isso resolve seu problema?"
- Se o solicitante confirmar que o artigo resolveu, o chamado não é aberto e o evento é registrado como "resolvido por base de conhecimento" nas estatísticas

**Sugestão automática para o analista:**
- Ao abrir um chamado para atendimento, o sistema exibe automaticamente os artigos da base de conhecimento com maior similaridade ao título e descrição do chamado
- O analista pode aplicar a solução sugerida com um clique, preenchendo o campo de resolução e opcionalmente editando antes de fechar o chamado

**Documentação e procedimentos por cliente:**
- Além dos artigos de resolução, o Administrador e o Gestor podem criar documentos e procedimentos vinculados a um cliente específico (ex: manual de uso de sistema, procedimento de acesso VPN, política interna do cliente)
- Cada documento tem: título, conteúdo (texto rico), categoria, data de publicação e cliente vinculado
- Podem ser anexados arquivos (PDF, imagens, etc.) a cada documento
- Quando o cliente acessa o portal, uma seção dedicada exibe apenas os documentos e procedimentos vinculados à sua empresa
- Os documentos são organizados por categoria e pesquisáveis dentro do portal do cliente
- Analistas também têm acesso de leitura a todos os documentos pelo painel interno

**Gestão da base:**
- Tela dedicada no painel interno para listar, buscar, editar e ativar/desativar artigos e documentos
- Acesso de leitura para Analistas; criação, edição e desativação para Gestor e Administrador

### 11. Tarefas e Lembretes

Módulo leve para registrar compromissos e pendências vinculados a clientes, com alertas automáticos para evitar esquecimentos.

**Criação de tarefa:**
- Campos: título, descrição, cliente vinculado, responsável (Analista, Gestor ou Admin), data de vencimento, prioridade (opcional)
- Tarefas podem ser criadas por Gestor e Administrador; Analistas podem criar tarefas atribuídas a si mesmos

**Recorrência:**
- Uma tarefa pode ser marcada como recorrente com as seguintes opções:
  - **Diária** — repete todos os dias
  - **Semanal** — repete em um dia específico da semana (ex: toda segunda-feira)
  - **Mensal** — repete em um dia específico do mês (ex: todo dia 1)
  - **Anual** — repete na mesma data todo ano
- Ao concluir uma tarefa recorrente, o sistema cria automaticamente a próxima ocorrência com a nova data de vencimento calculada
- A recorrência pode ser encerrada a qualquer momento

**Alertas:**
- O sistema envia e-mail de lembrete para o responsável X dias antes do vencimento (padrão: 3 dias, configurável por tarefa)
- Envia também um lembrete no próprio dia do vencimento
- Tarefas vencidas e não concluídas aparecem em destaque na tela principal para todos os perfis internos

**Gestão:**
- Lista de tarefas filtráveis por status (pendente, concluída, vencida), cliente e responsável
- Histórico de tarefas concluídas vinculado ao cliente

### 12. Comunicados

Módulo para criar e disparar comunicados por e-mail para contatos de clientes — informativos, newsletters, procedimentos, processos ou qualquer conteúdo relevante.

**Criação do comunicado:**
- Editor de texto rico (TipTap) com suporte a: formatação (negrito, itálico, listas, títulos), inserção de imagens coladas ou carregadas, links e tabelas
- Upload de arquivos anexos (armazenados no Supabase Storage)
- Campo de assunto do e-mail
- Pré-visualização do comunicado antes do envio

**Segmentação de destinatários:**
- **Todos os contatos** — todos os contatos ativos de todas as empresas
- **Todos os contatos de um cliente** — todos os contatos ativos de uma empresa específica
- **Por departamento** — todos os contatos de um ou mais departamentos (campo departamento do cadastro de contato), podendo filtrar por empresa
- **Seleção manual** — o remetente seleciona individualmente os contatos desejados com busca por nome ou empresa

**Envio e agendamento:**
- Disparo imediato ou agendamento para data e hora específica
- Comunicados agendados ficam listados com status "Agendado" e podem ser editados ou cancelados antes do disparo
- Após o envio, o comunicado fica com status "Enviado" e registra: data/hora do envio, quantidade de destinatários

**Histórico:**
- Lista de todos os comunicados enviados e agendados, com filtro por período e status
- Criação, edição e envio: Gestor e Administrador; Analistas têm acesso de leitura — podem consultar o histórico de comunicados enviados, mas não criar nem disparar

### 13. Monitoramento

Módulo unificado para monitoramento automatizado por cliente — cobre integrações com ferramentas externas (Zabbix, Azure Monitor) e verificação ativa de URLs. Em todos os casos, chamados são abertos e fechados automaticamente.

#### Integrações Externas (Zabbix e Azure Monitor)

Suporta atualmente **Zabbix** e **Azure Monitor** — novos conectores (Grafana, Datadog, Nagios, etc.) podem ser adicionados no futuro sem alteração de arquitetura.

**Painel de configuração por cliente:**
- Acessível pelo Administrador e Gestor na tela do cliente
- Para cada ferramenta, é possível adicionar uma integração com: tipo de conector (Zabbix ou Azure Monitor), token de autenticação único gerado pelo sistema, status (ativo/inativo), janela de monitoramento e comportamento fora da janela
- Um cliente pode ter múltiplas integrações ativas simultaneamente (ex: Zabbix + Azure Monitor)

**Janelas de monitoramento (por integração):**
- **24x7** — qualquer alerta abre chamado a qualquer hora, todos os dias
- **Horário comercial** — reutiliza a janela das Configurações da Plataforma (seg–sex, 9h–18h), respeitando feriados
- **Personalizado** — dias e horários específicos definidos pelo Administrador ou Gestor

**Comportamento fora da janela:**
- **Descartar** — alertas fora da janela são ignorados silenciosamente
- **Aguardar e abrir** — chamado criado assim que a janela iniciar, com registro do horário real do evento

**Feriados:**
- Respeita automaticamente o calendário de feriados — em feriados, aplica o comportamento "fora da janela" configurado

**Endpoints de webhook por conector:**
- Zabbix: `/api/webhooks/zabbix/{token-do-cliente}`
- Azure Monitor: `/api/webhooks/azure/{token-do-cliente}` (configurado via Action Group no Azure)

**Fluxo de abertura automática:**
- O sistema valida o token, verifica a janela de monitoramento e abre o chamado com: título e descrição do alerta, prioridade mapeada da severidade, categoria "Incidente", canal de entrada identificando o conector (Zabbix ou Azure Monitor) e ID do alerta salvo para referência

**Fluxo de fechamento automático (recovery):**
- Quando o alerta é resolvido na ferramenta, ela envia webhook de recovery para o mesmo endpoint
- O sistema localiza o chamado pelo ID do alerta e fecha automaticamente com nota de resolução automática identificando o conector
- O analista pode interagir normalmente no chamado enquanto estiver aberto — o fechamento ocorre independentemente das interações
- Se já fechado manualmente, o recovery é ignorado silenciosamente

**Mapeamento de severidade (configurável por conector):**

| Severidade Zabbix | Severidade Azure Monitor | Prioridade no sistema |
|---|---|---|
| Disaster / High | Sev 0 / Critical | Crítica |
| Average | Sev 1 / Error | Alta |
| Warning | Sev 2 / Warning | Média |
| Information / Not classified | Sev 3 / Informational | Baixa |

**Chamados originados por integrações de monitoramento estão excluídos do fluxo de aprovação.**

#### Monitoramento de URLs

Verifica periodicamente se URLs de clientes estão respondendo, com abertura e fechamento automático de chamados em caso de indisponibilidade.

**Configuração por cliente:**
- O Administrador e o Gestor cadastram uma ou mais URLs vinculadas a um cliente (ex: site institucional, sistema interno, painel do cliente)
- Campos por URL: endereço, nome/descrição, intervalo de verificação (5, 10, 15 ou 30 minutos), status (ativo/inativo)

**Verificação:**
- O sistema realiza uma requisição HTTP GET para cada URL ativa no intervalo configurado
- A URL é considerada **UP** se retornar resposta com status HTTP 2xx em até 10 segundos
- A URL é considerada **DOWN** se retornar erro (4xx, 5xx), timeout ou conexão recusada

**Quando a URL cair (DOWN):**
- Um chamado é aberto automaticamente com: título "Indisponibilidade detectada: [nome da URL]", categoria "Incidente", prioridade "Alta", canal de entrada "Monitoramento de URL"
- Notificação enviada por e-mail para o analista responsável e para o Gestor/Admin com flag de notificação de abertura ativa

**Quando a URL voltar (UP):**
- O chamado correspondente é fechado automaticamente com nota "URL voltou a responder normalmente"
- Se o chamado já tiver sido fechado manualmente, o retorno é ignorado silenciosamente

**Painel de status:**
- Tela unificada exibindo o status atual (UP/DOWN) de todas as URLs monitoradas e os alertas ativos das integrações externas, com data/hora da última verificação e histórico de disponibilidade do dia

### 14. Integrações Microsoft 365

**SSO com Microsoft (Azure AD / Entra ID):**
- Usuários internos (Administrador, Gestor, Analista) podem fazer login no sistema com sua conta Microsoft 365 da ITRAMOS via botão "Entrar com Microsoft" na tela de login
- Implementado via Supabase Auth com provedor OAuth Microsoft — sem necessidade de senha separada no sistema
- O perfil (papel) do usuário continua gerenciado pelo Administrador no sistema; o SSO apenas autentica a identidade
- Usuários internos podem optar por login tradicional (e-mail + senha) ou SSO com Microsoft — ambos coexistem
- SSO não se aplica ao portal do cliente — clientes sempre usam e-mail e senha próprios

**Notificações no Microsoft Teams:**
- O Administrador e o Gestor configuram um ou mais **Incoming Webhooks** do Teams (URLs geradas no canal desejado do Teams) nas Configurações da Plataforma
- É possível configurar canais diferentes por tipo de notificação (ex: um canal para chamados, outro para alertas de monitoramento)
- Eventos que disparam notificação no Teams:

| Evento | Notificação no Teams |
|---|---|
| Novo chamado aberto | Card com número, título, cliente, prioridade e link |
| SLA próximo de vencer | Card com chamado, prazo restante e analista responsável |
| SLA violado | Card destacado com chamado e tempo de violação |
| URL indisponível (monitoramento) | Card com URL, cliente e horário da queda |
| URL voltou a responder | Card informando normalização |
| Alerta de monitoramento disparado (Zabbix ou Azure Monitor) | Card com origem, host/recurso, severidade e descrição |
| Chamado reaberto | Card com número, cliente e motivo da reabertura |

- O formato das notificações usa **Adaptive Cards** do Teams, com visual estruturado e link direto para o chamado
- Cada tipo de notificação pode ser ativado ou desativado individualmente pelo Administrador e pelo Gestor

### 15. Custos e Atendimento Presencial

**Clientes avulsos:**
- Um cliente pode ser cadastrado com tipo **"Avulso"** — sem contrato fixo, sem SLA pré-definido, atendido por demanda
- Chamados avulsos seguem o mesmo fluxo dos demais, com campos adicionais de custo

**Registro de custos no chamado:**
- Em qualquer chamado que exija deslocamento, o analista registra as etapas do atendimento presencial com três marcações de tempo:
  - **"Saindo para atendimento"** — registra a hora de saída e atualiza o status do chamado para "Em deslocamento"; uma entrada é adicionada automaticamente ao histórico do chamado informando ao cliente que o analista está a caminho
  - **"Cheguei no cliente"** — registra a hora de chegada; o sistema calcula e exibe o tempo de deslocamento (saída → chegada)
  - **"Atendimento concluído"** — registra a hora de término; o sistema calcula o tempo de atendimento (chegada → término)
- Com os três tempos registrados, o sistema exibe separadamente:
  - **Tempo de deslocamento** (saída → chegada)
  - **Tempo de atendimento** (chegada → término)
  - **Tempo total** (saída → término)
- O Gestor ou Admin pode aplicar um desconto no tempo de deslocamento antes de gerar o custo final — por exemplo, cobrar apenas o tempo de atendimento ou um percentual do deslocamento
- Demais campos: quilômetros percorridos, pedágio e estacionamento (valores livres)
- O sistema calcula o custo total com base nos valores configurados na Plataforma, já aplicando eventuais descontos definidos

**Status de cobrança:**
- Ao fechar um chamado com custos registrados, ele entra automaticamente com status de cobrança **"Pendente"**
- Somente Gestor ou Administrador pode alterar para **"Cobrado"** após efetivar a cobrança ao cliente
- O resumo de custos do chamado (horas, km, pedágio, estacionamento, total) fica visível na tela do chamado e pode ser enviado por e-mail ao cliente com um clique

**Alertas de cobrança pendente:**
- Se um chamado com cobrança "Pendente" não for marcado como "Cobrado" dentro do prazo configurado (padrão: 7 dias), o sistema envia um e-mail de alerta para o Gestor
- Chamados com cobrança pendente aparecem em destaque na tela principal para Gestor e Admin
- O alerta por e-mail é repetido a cada 7 dias até que a cobrança seja registrada

**Relatório de custos:**
- Visão consolidada de todos os chamados com custos por período, analista e cliente
- Totais de horas técnicas, km, pedágios, estacionamentos e valor total por cliente
- Filtro separado para chamados avulsos vs. chamados de clientes com contrato

### 16. Gestão de Mudanças (GMUD)

Módulo para registrar, aprovar e comunicar mudanças em sistemas, servidores e aplicações, com rastreabilidade completa vinculada ao chamado de origem.

**Criação da GMUD:**
- Pode ser criada a partir de um chamado existente (fica vinculada ao chamado de origem) ou diretamente, sem chamado vinculado
- Campos obrigatórios:
  - Título e descrição detalhada do que será feito
  - Sistemas, servidores ou aplicações impactados
  - Usuários e clientes impactados
  - Janela de manutenção: data/hora de início e fim previsto
  - Plano de rollback em caso de falha
  - Nível de risco: Baixo, Médio, Alto
  - Analista responsável pela execução
  - Contatos a comunicar no início e no fim (seleção entre contatos cadastrados do cliente ou e-mails externos)

**Fluxo de aprovação:**
- Toda GMUD passa por aprovação antes de ser executada
- Reutiliza o mesmo mecanismo do fluxo de aprovação de chamados: o analista seleciona o aprovador (contato cadastrado ou e-mail manual) e o aprovador responde pelo link no e-mail, sem precisar de acesso ao sistema
- Status progressivo: **Rascunho → Aguardando Aprovação → Aprovada → Em Execução → Concluída / Revertida**
- GMUDs reprovadas ficam com status "Reprovada" e o motivo é registrado

**Comunicados automáticos:**
- No **início da janela de manutenção**: e-mail automático para todos os contatos marcados em "a comunicar", informando que a mudança está sendo iniciada, o que será feito e o tempo previsto
- Na **conclusão**: e-mail com o resultado:
  - **Concluída com sucesso:** mudança realizada conforme planejado
  - **Revertida:** mudança não foi aplicada, rollback executado, com descrição do motivo
- O analista aciona manualmente o início e a conclusão pelo sistema (botões "Iniciar execução" e "Concluir" / "Reverter")

**Integração com chamado de origem:**
- Ao criar uma GMUD a partir de um chamado, o chamado de origem muda automaticamente para o status **"Em Mudança"** — indicando visualmente que está aguardando ou em execução de uma mudança
- A GMUD aparece no histórico do chamado vinculado com link direto
- Ao concluir a GMUD: o sistema pergunta se o chamado de origem deve ser fechado; se não, o status volta para "Em Andamento"
- Ao reverter a GMUD: o chamado volta automaticamente para **"Em Andamento"** — o problema não foi resolvido e precisa de continuidade

**Visibilidade:**
- GMUDs aparecem na tela principal junto com os agendamentos, organizadas por janela de manutenção
- Analistas veem apenas suas GMUDs; Gestor e Admin veem todas

### 17. Reuniões

Módulo para registrar reuniões com clientes, gerar atas e converter itens de ação em tarefas rastreáveis.

**Registro de reunião:**
- Vinculada a um cliente
- Campos: data e hora, título/pauta, participantes internos (usuários do sistema) e externos (contatos cadastrados do cliente ou e-mails livres), anotações e decisões tomadas (editor de texto rico com TipTap), itens de ação (lista com responsável e prazo)

**Ata de reunião:**
- Ao finalizar o registro, o sistema gera automaticamente uma ata formatada com identidade visual da ITRAMOS
- Botão "Enviar ata" dispara o e-mail para todos os participantes listados com a ata em corpo do e-mail e opção de PDF anexo
- O cliente pode consultar o histórico completo de reuniões e atas no portal

**Itens de ação:**
- Cada item de ação registrado na reunião pode ser convertido em uma tarefa no módulo de Tarefas e Lembretes com um clique, mantendo o vínculo com a reunião de origem
- Itens de ação aparecem no histórico da reunião com status (pendente/concluído)

**Visibilidade:**
- Próximas reuniões agendadas aparecem na tela principal junto com chamados agendados e GMUDs
- Gestor e Admin veem todas as reuniões; Analistas veem apenas as reuniões em que estão participando

### 18. Relatórios

**Tela principal (todos os perfis internos):**
- Seção de destaque com todos os chamados agendados, ordenados por data/hora do agendamento
- Exibe: número, título, cliente, analista responsável, data e hora agendada
- Chamados com agendamento próximo (nas próximas 2 horas) são destacados visualmente
- O analista vê apenas os chamados agendados atribuídos a ele; Gestor e Admin veem todos

**Dashboard interno (Gestor e Admin):**
- Chamados por status (abertos, em andamento, aguardando cliente, fechados, reabertos) filtráveis por período
- Tempo médio de primeira resposta por período, analista e cliente
- SLA cumprido vs. violado (quantidade e percentual)
- Taxa de reabertura por cliente e categoria
- Distribuição de chamados por categoria, prioridade e analista
- Contratos próximos do vencimento: alertas para 30, 60 e 90 dias

**Dashboard de mudanças (Gestor e Admin):**
- GMUDs por status e por período
- GMUDs revertidas com motivo — útil para identificar padrões de falha
- Próximas janelas de manutenção agendadas

**Dashboard de monitoramento integrado (Gestor e Admin):**
- Chamados abertos automaticamente por período, cliente, conector (Zabbix ou Azure Monitor) e severidade
- Tempo médio entre abertura e fechamento automático (MTTR — Mean Time To Resolve)
- Chamados de monitoramento ainda abertos (problema não resolvido na ferramenta de origem)
- Alertas mais frequentes por cliente e por conector

**Alerta de problema recorrente:**
- Quando um novo chamado é aberto, o sistema verifica se existem outros chamados do mesmo cliente com título/assunto similar dentro de um período configurável
- Similaridade detectada via `pg_trgm` (extensão PostgreSQL nativa no Supabase) — busca por trigrama sem necessidade de IA
- O Administrador configura os parâmetros: número mínimo de chamados similares (ex: 3) e janela de tempo (ex: 30 dias)
- Ao detectar recorrência, o sistema envia um alerta por e-mail para o **Gestor** e para o **analista responsável pelo chamado atual**
- O alerta inclui: identificação do padrão detectado, lista dos chamados anteriores similares com número, título, data e link direto para cada um
- O alerta também aparece como notificação no dashboard interno

**Relatório mensal do cliente (PDF):**
- Gerado automaticamente no primeiro dia útil de cada mês, referente aos 30 dias anteriores
- Pode também ser gerado sob demanda pelo Gestor ou Admin
- Enviado por e-mail via Resend para o(s) responsável(is) do contrato
- Conteúdo:
  - Cabeçalho com logo da ITRAMOS e identificação do cliente e período
  - Resumo executivo: total de chamados abertos, total fechados, taxa de SLA cumprido, taxa de reabertura
  - Gráficos: chamados por categoria, por prioridade, por status (gerados como SVG no servidor e embutidos no PDF)
  - Tabela detalhada: cada chamado com número, título, categoria, prioridade, data de abertura, data de fechamento, analista responsável, status final
  - Chamados reabertos destacados na tabela
  - **Seção de reuniões** (quando houver reuniões no período): lista com data, pauta e itens de ação gerados
  - **Seção de mudanças (GMUD)** (quando houver GMUDs no período): lista de mudanças realizadas, status final (concluída/revertida) e janela de manutenção executada
  - **Seção de monitoramento** (exibida apenas para clientes com integração ativa — Zabbix e/ou Azure Monitor): total de alertas disparados por conector, total resolvidos automaticamente, MTTR médio e tabela com os principais eventos do período
- Layout com identidade visual da ITRAMOS (cores e logo)

---

## Arquitetura Técnica

### Stack

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Frontend + API | Next.js 15 (App Router) | Full-stack em um projeto, SSR, rotas de API nativas |
| Banco de dados | Supabase (PostgreSQL) | Relacional, auth integrado, real-time, plano gratuito generoso |
| Armazenamento de arquivos | Supabase Storage | Anexos dos chamados, integrado ao mesmo projeto Supabase |
| Autenticação | Supabase Auth | JWT, gestão de sessão, integração nativa com banco |
| E-mail | Resend | Envio e recebimento de e-mails, SDK simples |
| Geração de PDF | React PDF (`@react-pdf/renderer`) | PDFs gerados no servidor com React |
| Gráficos (dashboard) | Recharts | Gráficos interativos no dashboard interno |
| Gráficos (PDF) | SVG nativo ou Chart.js server-side | Gráficos estáticos gerados no servidor para o relatório PDF |
| SSO Microsoft | Supabase Auth + OAuth Microsoft | Login com conta Microsoft 365 para usuários internos |
| Notificações Teams | Microsoft Teams Incoming Webhooks | Alertas de chamados, SLA e monitoramento no Teams |
| Editor de texto rico | TipTap | Editor para comunicados e documentos da base de conhecimento |
| Jobs agendados | Vercel Cron Jobs | Lembretes de agendamento, relatório mensal, avisos de feriado, alertas de contrato |
| Similaridade de texto | pg_trgm (PostgreSQL) | Detecção de chamados recorrentes e sugestões da base de conhecimento |
| Feriados | BrasilAPI | API pública, gratuita, sem autenticação |
| Hospedagem | Vercel + Supabase Cloud | Deploy simples, integração nativa Next.js/Vercel |

### Variáveis de ambiente

Todas as credenciais e configurações de infraestrutura são gerenciadas como variáveis de ambiente no Vercel — nunca armazenadas no banco ou expostas via interface. Para migrar de provedor no futuro, basta atualizar os valores no painel do Vercel, sem alteração de código.

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública do Supabase (frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço do Supabase (backend/API) |
| `DATABASE_URL` | String de conexão direta ao PostgreSQL |
| `RESEND_API_KEY` | Chave de API do Resend (e-mail) |
| `RESEND_INBOUND_SECRET` | Secret para validar webhooks inbound do Resend |
| `MICROSOFT_CLIENT_ID` | Client ID do app Azure AD (SSO) |
| `MICROSOFT_CLIENT_SECRET` | Client Secret do app Azure AD (SSO) |
| `NEXTAUTH_SECRET` | Secret de sessão do Next.js Auth |
| `NEXTAUTH_URL` | URL pública da aplicação |
| `CRON_SECRET` | Secret para autenticar chamadas dos Vercel Cron Jobs |

### Modelo de dados principal

```
Empresa
  └── Contatos (1:N)
  └── Contratos (1:N)
        └── SLA Rules (1:N por prioridade — definidos no contrato)

Chamado
  └── vinculado a Empresa + Contato
  └── vinculado a Contrato (para determinar SLA)
  └── Histórico de Interações (1:N)
  └── Evento de Reabertura (0:N)

Calendário de Feriados
  └── Feriados (data, nome, tipo: nacional/municipal/manual)

Base de Conhecimento
  └── Artigos de resolução (título, problema, solução, categoria, tags, ativo)
        └── vinculado ao Chamado de origem (opcional)
  └── Documentos por cliente (título, conteúdo, categoria, data, ativo)
        └── vinculado a Empresa
        └── Anexos (0:N) — armazenados no Supabase Storage

Usuários (Admin, Gestor, Analista)
Clientes Portal (vinculados a Empresa)
```

---

## Fora do Escopo — Fase 1

Os seguintes itens são previstos para a **Fase 2** e não devem ser implementados agora:

**Automação e canais:**
- Bot de IA para triagem e abertura automática de chamados
- Chat ao vivo no portal do cliente
- Integração com WhatsApp (Evolution API ou Z-API)
- App mobile

**Cofre de senhas por cliente:**
- Credenciais organizadas por cliente e categoria (servidor, rede, sistema, VPN, etc.)
- Senhas criptografadas em repouso (AES-256), exibição mascarada com log de auditoria de acesso
- Controle de acesso por perfil — Analista acessa apenas clientes autorizados pelo Admin

**Gestão de projetos (consultoria, desenvolvimento de sites, landing pages, agentes de IA):**
- Módulo de projetos com fases, tarefas, responsáveis, datas de entrega e acompanhamento de progresso
- Controle de horas trabalhadas por projeto e por atividade (para consultoria cobrada por hora)
- Fluxo de aprovação de entregas pelo cliente (layout, conteúdo, publicação) dentro do projeto
- Visão do cliente no portal para acompanhar projetos e aprovar entregas

---

## Critérios de sucesso da Fase 1

- Analistas conseguem gerenciar todos os chamados sem precisar acessar o Freshdesk
- Contratos de todos os clientes estão cadastrados com SLA configurado
- Relatório mensal é gerado e enviado automaticamente sem intervenção manual
- SLA é calculado corretamente respeitando horário comercial e feriados
- Clientes conseguem abrir e acompanhar chamados pelo portal web
