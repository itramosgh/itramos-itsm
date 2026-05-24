'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import type { EmailTemplateVariable } from '@/types/database'
import { substituteVariables } from '@/lib/email-template-sender'

const FAKE_VALUES: Record<string, string> = {
  numero_chamado: '4217',
  titulo_chamado: 'Impressora não reconhece papel A4',
  nome_cliente: 'Maria Fernanda Silva',
  nome_analista: 'Carlos Ramos',
  prioridade: 'Alta',
  link_chamado: 'https://suporte.itramos.com.br/portal/chamados/4217',
  novo_status: 'Em andamento',
  horas_aguardando: '26',
  horario_agendado: '14/05/2026 às 14:30',
  prazo_restante: '1h 45min',
  nome_aprovador: 'Diretor Financeiro',
  nome_solicitante: 'Maria Fernanda Silva',
  link_aprovar: 'https://suporte.itramos.com.br/aprovacao/abc123?acao=aprovar',
  link_reprovar: 'https://suporte.itramos.com.br/aprovacao/abc123?acao=reprovar',
  motivo_reprovacao: 'Orçamento não aprovado para este trimestre.',
  horas_pendente: '48',
  prazo_aprovacao: '15/05/2026 às 18:00',
  titulo_gmud: 'Atualização do servidor de arquivos — Windows Server 2022',
  data_inicio: '17/05/2026',
  hora_inicio: '01:00',
  hora_fim: '05:00',
  descricao_gmud: 'Atualização do sistema operacional e aplicação de patches de segurança.',
  responsavel_gmud: 'Equipe de Infraestrutura',
  motivo_reversao: 'Incompatibilidade detectada com aplicação legada.',
  titulo_artigo: 'Como configurar driver de impressora no Windows 11',
  resumo_artigo: 'Guia passo a passo para instalação e configuração de drivers de impressora.',
  link_confirmar: 'https://suporte.itramos.com.br/kb/confirmar/xyz456',
  link_negar: 'https://suporte.itramos.com.br/kb/negar/xyz456',
  nome_feriado: 'Corpus Christi',
  data_feriado: '19/06/2026',
  nome_responsavel: 'João Carlos Pereira',
  nome_empresa: 'Empresa ACME Ltda.',
  data_vencimento: '30/06/2026',
  dias_restantes: '30',
  valor_pendente: 'R$ 1.850,00',
  titulo_reuniao: 'Reunião de Alinhamento Mensal — Maio/2026',
  nome_participante: 'Maria Fernanda Silva',
  data_reuniao: '14/05/2026',
  participantes: 'Carlos Ramos, Maria Fernanda Silva, João Pereira',
  pontos_discutidos: 'Revisão dos chamados do mês, SLA, plano de manutenção.',
  encaminhamentos: 'Carlos: agendar visita técnica. Maria: enviar relatório até dia 20.',
  nome_responsavel_tarefa: 'Carlos Ramos',
  titulo_tarefa: 'Revisar documentação de rede do cliente ACME',
  link_tarefa: 'https://suporte.itramos.com.br/tarefas/88',
  nome_contato: 'Fernanda Lima',
  link_definir_senha: 'https://suporte.itramos.com.br/portal/definir-senha?token=abc123xyz',
  link_redefinir_senha: 'https://suporte.itramos.com.br/portal/redefinir-senha?token=def456uvw',
  nome_destinatario: 'Diretor Financeiro — ACME Ltda.',
  mes_referencia: 'Abril/2026',
  total_abertos: '47',
  total_fechados: '44',
  percentual_sla: '91,5',
  url_monitorada: 'https://erp.acme.com.br',
  hora_deteccao: '14/05/2026 às 09:12',
  status_http: '503 Service Unavailable',
  janela_dias: '30',
  total_chamados: '8',
  categoria_chamados: 'Impressoras e Periféricos',
}

interface EmailTemplatePreviewModalProps {
  subject: string
  bodyHtml: string
  variables: EmailTemplateVariable[]
  getLatestHtml: () => string
}

export function EmailTemplatePreviewModal({
  subject,
  bodyHtml,
  variables,
  getLatestHtml,
}: EmailTemplatePreviewModalProps) {
  const [open, setOpen] = useState(false)

  const getPreviewHtml = () => {
    const current = getLatestHtml()
    const fakeVars = Object.fromEntries(
      variables.map((v) => [v.key, FAKE_VALUES[v.key] ?? `[${v.label}]`])
    )
    return substituteVariables(current, fakeVars)
  }

  const previewSubject = substituteVariables(subject, FAKE_VALUES)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Eye className="h-4 w-4 mr-2" />
          Pré-visualizar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pré-visualização do e-mail</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="border rounded p-3 bg-muted/50">
            <p className="text-xs text-muted-foreground">Assunto</p>
            <p className="font-medium">{previewSubject}</p>
          </div>
          <div className="border rounded overflow-hidden">
            <iframe
              srcDoc={getPreviewHtml()}
              title="Preview do e-mail"
              className="w-full h-[500px] border-0"
              sandbox="allow-same-origin"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Dados fictícios são usados para substituir as variáveis na pré-visualização.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
