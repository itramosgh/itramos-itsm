# Edição de Contratos — Design

## Contexto

A página `/clientes/[id]/contratos` permite criar contratos mas não editá-los. O `ContractForm` e as actions de upsert já existem e são reutilizáveis.

## Escopo

Adicionar edição de contratos existentes: campos básicos (status, datas, is_24x7), regras de SLA e dispositivos.

## Arquitetura

### Server Action — `updateContractAction`

Novo action em `src/app/(internal)/clientes/[id]/contratos/actions.ts`:
- Recebe `contractId`, `companyId`, `FormData`
- Valida com schema existente
- Faz `update` na tabela `contracts`
- Reutiliza `upsertSLARulesAction` e `upsertContractDevicesAction` para SLA e dispositivos

### ContractList — botão Editar + modal inline

Em `src/components/clients/ContractList.tsx`:
- Adiciona estado `editingId: string | null`
- Botão "Editar" no painel expandido de cada contrato
- Modal inline (mesmo padrão do `CreateContractDialog`) com `ContractForm` pré-preenchido
- Ao salvar: chama `updateContractAction` + upserts paralelos de SLA e devices
- Fecha modal e exibe feedback de sucesso/erro

### ContractForm — sem alterações

O componente já aceita `initialData` para pré-preencher. Nenhuma mudança necessária.

## Fluxo

1. Usuário expande contrato → clica "Editar"
2. Modal abre com dados atuais pré-preenchidos
3. Usuário edita e salva
4. `updateContractAction` atualiza contrato
5. `upsertSLARulesAction` e `upsertContractDevicesAction` atualizam regras e dispositivos
6. Modal fecha, página revalida

## Arquivos alterados

- `src/app/(internal)/clientes/[id]/contratos/actions.ts` — adiciona `updateContractAction`
- `src/components/clients/ContractList.tsx` — adiciona botão + modal de edição
