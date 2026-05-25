export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type UserRole = 'admin' | 'gestor' | 'analista'
export type Theme = 'light' | 'dark' | 'system'
export type ContractStatus = 'ativo' | 'expirado' | 'renovacao_pendente'
export type SLAPriority = 'critica' | 'alta' | 'media' | 'baixa'
export type LogCategory = 'email_sent' | 'email_received' | 'webhook_received' | 'url_monitoring' | 'cron_job' | 'approval' | 'auth'
export type LogStatus = 'success' | 'failure'

export type TicketStatus =
  | 'aberto' | 'agendado' | 'em_andamento' | 'aguardando_cliente'
  | 'aguardando_fornecedor' | 'aguardando_aprovacao' | 'em_mudanca'
  | 'resolvido' | 'fechado' | 'reaberto'

export type TicketPriority = 'critica' | 'alta' | 'media' | 'baixa'

export type TicketChannel = 'portal' | 'email' | 'zabbix' | 'azure_monitor' | 'url_monitoring'

export type InteractionType = 'mensagem' | 'status_change' | 'assignment' | 'system'

export type ApprovalStatus = 'pendente' | 'aprovado' | 'reprovado' | 'expirado' | 'automatico'

export interface EmailTemplateVariable {
  key: string
  label: string
  description: string
  required: boolean
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string; full_name: string; role: UserRole
          notify_new_tickets: boolean; theme: Theme
          is_active: boolean; created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      platform_settings: {
        Row: {
          id: number; company_name: string | null; company_website: string | null
          company_address: string | null; company_phone: string | null
          company_whatsapp: string | null; logo_light_url: string | null
          logo_dark_url: string | null; email_from_address: string | null
          email_from_name: string | null; holiday_notice_days: number
          recurrence_min_tickets: number; recurrence_window_days: number
          business_hours_start: string; business_hours_end: string
          business_hours_days: number[]; hourly_rate: number | null
          km_rate: number | null; billing_alert_days: number
          updated_at: string | null; updated_by: string | null
        }
        Insert: Partial<Database['public']['Tables']['platform_settings']['Row']>
        Update: Partial<Database['public']['Tables']['platform_settings']['Row']>
      }
      system_logs: {
        Row: {
          id: string; category: LogCategory; status: LogStatus
          description: string; details: Json | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['system_logs']['Row'], 'id' | 'created_at'>
        Update: never
      }
      companies: {
        Row: {
          id: string; name: string; cnpj: string | null; segment: string | null
          address: string | null; logo_url: string | null
          is_blocked: boolean; is_active: boolean
          created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['companies']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['companies']['Insert']>
      }
      company_email_domains: {
        Row: { id: string; company_id: string; domain: string; created_at: string }
        Insert: Omit<Database['public']['Tables']['company_email_domains']['Row'], 'id' | 'created_at'>
        Update: never
      }
      contacts: {
        Row: {
          id: string; company_id: string; user_id: string | null
          full_name: string; email: string; phone: string | null
          is_whatsapp: boolean; department: string | null
          is_contract_responsible: boolean; receives_ticket_cc: boolean
          is_active: boolean; created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['contacts']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>
      }
      contracts: {
        Row: {
          id: string; company_id: string; start_date: string
          end_date: string | null; renewal_date: string | null
          services: string[]; status: ContractStatus
          is_24x7: boolean; created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['contracts']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['contracts']['Insert']>
      }
      device_types: {
        Row: { id: string; name: string; is_active: boolean; created_at: string }
        Insert: Omit<Database['public']['Tables']['device_types']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['device_types']['Insert']>
      }
      contract_devices: {
        Row: { id: string; contract_id: string; device_type_id: string; quantity: number }
        Insert: Omit<Database['public']['Tables']['contract_devices']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['contract_devices']['Insert']>
      }
      contract_sla_rules: {
        Row: { id: string; contract_id: string; priority: SLAPriority; response_hours: number }
        Insert: Omit<Database['public']['Tables']['contract_sla_rules']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['contract_sla_rules']['Insert']>
      }
      ticket_categories: {
        Row: {
          id: string; name: string; slug: string
          requires_approval: boolean; is_active: boolean
        }
        Insert: Omit<Database['public']['Tables']['ticket_categories']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['ticket_categories']['Insert']>
      }
      holidays: {
        Row: {
          id: string; date: string; name: string
          type: 'nacional' | 'municipal' | 'manual'; year: number; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['holidays']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['holidays']['Insert']>
      }
      holiday_notice_sent: {
        Row: { id: string; holiday_id: string; contact_id: string; sent_at: string }
        Insert: Omit<Database['public']['Tables']['holiday_notice_sent']['Row'], 'id' | 'sent_at'>
        Update: never
      }
      announcements: {
        Row: {
          id: string; subject: string; body_rich_text: Json | null; body_html: string | null
          recipient_type: 'all' | 'company' | 'department' | 'manual'
          recipient_company_id: string | null; recipient_departments: string[] | null
          status: 'rascunho' | 'agendado' | 'enviado' | 'cancelado'
          scheduled_at: string | null; sent_at: string | null; recipient_count: number | null
          created_by: string; created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['announcements']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['announcements']['Insert']>
      }
      announcement_recipients: {
        Row: { id: string; announcement_id: string; contact_id: string }
        Insert: Omit<Database['public']['Tables']['announcement_recipients']['Row'], 'id'>
        Update: never
      }
      announcement_attachments: {
        Row: {
          id: string; announcement_id: string; filename: string; storage_path: string
          size_bytes: number | null; mime_type: string | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['announcement_attachments']['Row'], 'id' | 'created_at'>
        Update: never
      }
      tickets: {
        Row: {
          id: string; number: number; title: string; description: string | null
          category_id: string | null; priority: TicketPriority; status: TicketStatus
          channel: TicketChannel; company_id: string; contact_id: string
          contract_id: string | null; assigned_to: string | null
          scheduled_at: string | null; external_alert_id: string | null
          sla_deadline: string | null; sla_first_response_at: string | null
          sla_met: boolean | null; sla_breach_minutes: number | null
          sla_paused_at: string | null; sla_paused_minutes: number
          billing_status: 'pendente' | 'cobrado' | null
          resolution: string | null; closed_at: string | null
          created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tickets']['Row'], 'id' | 'number' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['tickets']['Insert']>
      }
      ticket_interactions: {
        Row: {
          id: string; ticket_id: string; type: InteractionType
          content: string | null; author_profile_id: string | null
          author_contact_id: string | null; is_system: boolean; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_interactions']['Row'], 'id' | 'created_at'>
        Update: never
      }
      ticket_attachments: {
        Row: {
          id: string; ticket_id: string; interaction_id: string | null
          filename: string; storage_path: string; size_bytes: number | null
          mime_type: string | null; is_deleted: boolean; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_attachments']['Row'], 'id' | 'created_at'>
        Update: Pick<Database['public']['Tables']['ticket_attachments']['Row'], 'is_deleted'>
      }
      ticket_reopens: {
        Row: {
          id: string; ticket_id: string
          reopened_by_profile_id: string | null; reopened_by_contact_id: string | null
          reason: string | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_reopens']['Row'], 'id' | 'created_at'>
        Update: never
      }
      ticket_approvals: {
        Row: {
          id: string; ticket_id: string; approver_contact_id: string | null
          approver_email: string; token: string; previous_status: string
          status: ApprovalStatus; response_reason: string | null
          responded_at: string | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_approvals']['Row'], 'id' | 'token' | 'created_at'>
        Update: Partial<Pick<Database['public']['Tables']['ticket_approvals']['Row'], 'status' | 'response_reason' | 'responded_at'>>
      }
      response_templates: {
        Row: {
          id: string; name: string; category: string | null; body: string
          variables: { key: string; label: string; auto_filled: boolean }[]
          is_active: boolean; created_by: string | null; created_at: string; updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['response_templates']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['response_templates']['Insert']>
      }
      ticket_kb_links: {
        Row: {
          id: string; ticket_id: string; kb_article_id: string
          linked_by: string | null; confirmation_token: string
          resolution_confirmed: boolean | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_kb_links']['Row'], 'id' | 'confirmation_token' | 'created_at'>
        Update: Pick<Database['public']['Tables']['ticket_kb_links']['Row'], 'resolution_confirmed'>
      }
      kb_articles: {
        Row: {
          id: string
          title: string
          problem_description: string | null
          solution: string | null
          tags: string[]
          category_id: string | null
          origin_ticket_id: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['kb_articles']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['kb_articles']['Insert']>
      }
      kb_documents: {
        Row: {
          id: string
          company_id: string
          title: string
          content_rich_text: Json | null
          content_html: string | null
          category: string | null
          published_at: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['kb_documents']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['kb_documents']['Insert']>
      }
      kb_document_attachments: {
        Row: {
          id: string
          document_id: string
          filename: string
          storage_path: string
          size_bytes: number | null
          mime_type: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['kb_document_attachments']['Row'], 'id' | 'created_at'>
        Update: never
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          company_id: string | null
          assigned_to: string
          due_date: string
          priority: 'alta' | 'media' | 'baixa' | null
          status: 'pendente' | 'concluida' | 'vencida'
          reminder_days_before: number
          is_recurring: boolean
          recurrence_type: 'diaria' | 'semanal' | 'mensal' | 'anual' | null
          recurrence_active: boolean
          parent_task_id: string | null
          origin_meeting_id: string | null
          origin_action_item_id: string | null
          completed_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tasks']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>
      }
      meetings: {
        Row: {
          id: string
          company_id: string
          title: string
          scheduled_at: string
          notes_rich_text: Json | null
          notes_html: string | null
          status: 'agendada' | 'realizada' | 'cancelada'
          minutes_sent_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['meetings']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['meetings']['Insert']>
      }
      meeting_participants: {
        Row: {
          id: string
          meeting_id: string
          profile_id: string | null
          contact_id: string | null
          external_email: string | null
          external_name: string | null
        }
        Insert: Omit<Database['public']['Tables']['meeting_participants']['Row'], 'id'>
        Update: never
      }
      meeting_action_items: {
        Row: {
          id: string
          meeting_id: string
          description: string
          responsible_profile_id: string | null
          responsible_contact_id: string | null
          responsible_external_email: string | null
          due_date: string | null
          status: 'pendente' | 'concluido'
          converted_to_task_id: string | null
        }
        Insert: Omit<Database['public']['Tables']['meeting_action_items']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['meeting_action_items']['Insert']>
      }
      pending_email_tickets: {
        Row: {
          id: string; from_email: string; company_id: string
          original_subject: string; original_body: string
          reminder_count: number; last_reminder_at: string | null
          completed_at: string | null; created_at: string
        }
        Insert: Omit<Database['public']['Tables']['pending_email_tickets']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['pending_email_tickets']['Insert']>
      }
      email_templates: {
        Row: {
          slug: string
          category: string
          name: string
          trigger_description: string
          subject: string
          body_rich_text: Json
          body_html: string
          default_subject: string
          default_body_rich_text: Json
          default_body_html: string
          available_variables: EmailTemplateVariable[]
          is_customized: boolean
          updated_at: string | null
          updated_by: string | null
        }
        Insert: never
        Update: Pick<Database['public']['Tables']['email_templates']['Row'],
          'subject' | 'body_rich_text' | 'body_html' | 'is_customized' | 'updated_at' | 'updated_by'>
      }
    }
    Functions: {
      get_user_role: { Args: Record<never, never>; Returns: string }
      is_internal: { Args: Record<never, never>; Returns: boolean }
      get_contact_company_id: { Args: Record<never, never>; Returns: string | null }
      search_kb_articles: {
        Args: { query: string }
        Returns: { id: string; title: string; problem_description: string | null; solution: string | null; category_id: string | null }[]
      }
    }
  }
}
