export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type UserRole = 'admin' | 'gestor' | 'analista'
export type Theme = 'light' | 'dark' | 'system'
export type ContractStatus = 'ativo' | 'expirado' | 'renovacao_pendente'
export type SLAPriority = 'critica' | 'alta' | 'media' | 'baixa'
export type LogCategory = 'email_sent' | 'email_received' | 'webhook_received' | 'url_monitoring' | 'cron_job' | 'approval' | 'auth'
export type LogStatus = 'success' | 'failure'

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
    }
    Functions: {
      get_user_role: { Args: Record<never, never>; Returns: string }
      is_internal: { Args: Record<never, never>; Returns: boolean }
    }
  }
}
