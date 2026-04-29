export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_mode_state: {
        Row: {
          admin_disabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_disabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_disabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          context_id: string | null
          context_type: string
          created_at: string
          id: string
          messages: Json
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          context_id?: string | null
          context_type?: string
          created_at?: string
          id?: string
          messages?: Json
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          context_id?: string | null
          context_type?: string
          created_at?: string
          id?: string
          messages?: Json
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_tokens: {
        Row: {
          created_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_read_status: {
        Row: {
          id: string
          last_read_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: []
      }
      client_assignments: {
        Row: {
          client_id: string
          created_at: string
          group_id: string | null
          id: string
          manager_id: string | null
          notes: string | null
          rank_tag_id: string | null
          retail_type_tag_id: string | null
          tag_id: string | null
          territory_tag_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          group_id?: string | null
          id?: string
          manager_id?: string | null
          notes?: string | null
          rank_tag_id?: string | null
          retail_type_tag_id?: string | null
          tag_id?: string | null
          territory_tag_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          group_id?: string | null
          id?: string
          manager_id?: string | null
          notes?: string | null
          rank_tag_id?: string | null
          retail_type_tag_id?: string | null
          tag_id?: string | null
          territory_tag_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_rank_tag_id_fkey"
            columns: ["rank_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_retail_type_tag_id_fkey"
            columns: ["retail_type_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_territory_tag_id_fkey"
            columns: ["territory_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          city: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          group_id: string | null
          id: string
          logo_url: string | null
          manager_id: string | null
          name: string
          phone: string | null
          rank_tag_id: string | null
          retail_type_tag_id: string | null
          tag_id: string | null
          territory_tag_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          group_id?: string | null
          id?: string
          logo_url?: string | null
          manager_id?: string | null
          name: string
          phone?: string | null
          rank_tag_id?: string | null
          retail_type_tag_id?: string | null
          tag_id?: string | null
          territory_tag_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          group_id?: string | null
          id?: string
          logo_url?: string | null
          manager_id?: string | null
          name?: string
          phone?: string | null
          rank_tag_id?: string | null
          retail_type_tag_id?: string | null
          tag_id?: string | null
          territory_tag_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_rank_tag_id_fkey"
            columns: ["rank_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_retail_type_tag_id_fkey"
            columns: ["retail_type_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_territory_tag_id_fkey"
            columns: ["territory_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          color: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization: string | null
          phone: string | null
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization?: string | null
          phone?: string | null
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization?: string | null
          phone?: string | null
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dashboard_reports: {
        Row: {
          ai_summary: string | null
          created_at: string
          expires_at: string
          id: string
          report_data: Json
          title: string
          token: string
          user_id: string
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          report_data?: Json
          title?: string
          token?: string
          user_id: string
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          report_data?: Json
          title?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      department_directors: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string
          director_user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id: string
          director_user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string
          director_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_directors_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          head_user_id: string | null
          icon: string | null
          id: string
          name: string
          parent_department_id: string | null
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          head_user_id?: string | null
          icon?: string | null
          id?: string
          name: string
          parent_department_id?: string | null
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          head_user_id?: string | null
          icon?: string | null
          id?: string
          name?: string
          parent_department_id?: string | null
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          invited_by: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          invited_by: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          invited_by?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          content: string
          created_at: string
          group_id: string
          id: string
          reply_to: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          group_id: string
          id?: string
          reply_to?: string | null
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          reply_to?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      group_tags: {
        Row: {
          group_id: string
          tag_id: string
        }
        Insert: {
          group_id: string
          tag_id: string
        }
        Update: {
          group_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_tags_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          message_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          message_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          message_type?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          id: string
          push_added_to_group: boolean
          push_deadline_approaching: boolean
          push_new_task_in_group: boolean
          push_task_assigned: boolean
          push_task_commented: boolean
          push_task_completed: boolean
          push_task_delegated: boolean
          push_task_participant_added: boolean
          push_user_mentioned: boolean
          telegram_added_to_group: boolean
          telegram_deadline_approaching: boolean
          telegram_group_chat_message: boolean
          telegram_new_task_in_group: boolean
          telegram_task_assigned: boolean
          telegram_task_commented: boolean
          telegram_task_completed: boolean
          telegram_task_delegated: boolean
          telegram_task_participant_added: boolean
          telegram_user_mentioned: boolean
          telegram_weekly_ai_review: boolean
          telegram_weekly_report: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          push_added_to_group?: boolean
          push_deadline_approaching?: boolean
          push_new_task_in_group?: boolean
          push_task_assigned?: boolean
          push_task_commented?: boolean
          push_task_completed?: boolean
          push_task_delegated?: boolean
          push_task_participant_added?: boolean
          push_user_mentioned?: boolean
          telegram_added_to_group?: boolean
          telegram_deadline_approaching?: boolean
          telegram_group_chat_message?: boolean
          telegram_new_task_in_group?: boolean
          telegram_task_assigned?: boolean
          telegram_task_commented?: boolean
          telegram_task_completed?: boolean
          telegram_task_delegated?: boolean
          telegram_task_participant_added?: boolean
          telegram_user_mentioned?: boolean
          telegram_weekly_ai_review?: boolean
          telegram_weekly_report?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          push_added_to_group?: boolean
          push_deadline_approaching?: boolean
          push_new_task_in_group?: boolean
          push_task_assigned?: boolean
          push_task_commented?: boolean
          push_task_completed?: boolean
          push_task_delegated?: boolean
          push_task_participant_added?: boolean
          push_user_mentioned?: boolean
          telegram_added_to_group?: boolean
          telegram_deadline_approaching?: boolean
          telegram_group_chat_message?: boolean
          telegram_new_task_in_group?: boolean
          telegram_task_assigned?: boolean
          telegram_task_commented?: boolean
          telegram_task_completed?: boolean
          telegram_task_delegated?: boolean
          telegram_task_participant_added?: boolean
          telegram_user_mentioned?: boolean
          telegram_weekly_ai_review?: boolean
          telegram_weekly_report?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      npd_card_positions: {
        Row: {
          created_at: string
          gate_key: string
          group_id: string
          id: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          gate_key: string
          group_id: string
          id?: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          gate_key?: string
          group_id?: string
          id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "npd_card_positions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_audit_log: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          profile_id: string
        }
        Insert: {
          action?: string
          changed_by?: string | null
          created_at?: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          client_id: string | null
          contractor_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          display_name: string | null
          email: string | null
          id: string
          is_approved: boolean
          organization: string | null
          telegram_chat_id: number | null
          telegram_username: string | null
          username: string | null
          work_email: string | null
        }
        Insert: {
          client_id?: string | null
          contractor_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          is_approved?: boolean
          organization?: string | null
          telegram_chat_id?: number | null
          telegram_username?: string | null
          username?: string | null
          work_email?: string | null
        }
        Update: {
          client_id?: string | null
          contractor_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_approved?: boolean
          organization?: string | null
          telegram_chat_id?: number | null
          telegram_username?: string | null
          username?: string | null
          work_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      project_folder_items: {
        Row: {
          created_at: string
          folder_id: string
          group_id: string
          id: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          group_id: string
          id?: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          group_id?: string
          id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "project_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_folder_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      project_folders: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          position?: number
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      project_milestones: {
        Row: {
          actual_date: string | null
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          gate_key: string | null
          group_id: string
          id: string
          name: string
          planned_date: string
          position: number
          status: string
          updated_at: string
        }
        Insert: {
          actual_date?: string | null
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          gate_key?: string | null
          group_id: string
          id?: string
          name: string
          planned_date: string
          position?: number
          status?: string
          updated_at?: string
        }
        Update: {
          actual_date?: string | null
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          gate_key?: string | null
          group_id?: string
          id?: string
          name?: string
          planned_date?: string
          position?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_templates: {
        Row: {
          created_at: string
          default_columns: Json
          description: string | null
          icon: string | null
          id: string
          is_system: boolean
          name: string
          optional_axes: string[]
          position: number
          required_axes: string[]
          system_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_columns?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          name: string
          optional_axes?: string[]
          position?: number
          required_axes?: string[]
          system_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_columns?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean
          name?: string
          optional_axes?: string[]
          position?: number
          required_axes?: string[]
          system_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      report_pages: {
        Row: {
          blocks: Json
          cover_color: string | null
          created_at: string
          group_id: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blocks?: Json
          cover_color?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blocks?: Json
          cover_color?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_pages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      subtasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          deadline: string | null
          id: string
          is_completed: boolean
          position: number
          task_id: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          is_completed?: boolean
          position?: number
          task_id: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          is_completed?: boolean
          position?: number
          task_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_access: {
        Row: {
          created_at: string
          granted_by: string
          id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_access_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_system: boolean
          name: string
          parent_id: string | null
          position: number
          system_key: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name: string
          parent_id?: string | null
          position?: number
          system_key?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name?: string
          parent_id?: string | null
          position?: number
          system_key?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tag_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          category_id: string | null
          color: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tag_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          created_by: string
          dependency_type: string
          id: string
          lag_days: number
          predecessor_entity_type: string
          predecessor_id: string
          successor_entity_type: string
          successor_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          dependency_type?: string
          id?: string
          lag_days?: number
          predecessor_entity_type?: string
          predecessor_id: string
          successor_entity_type?: string
          successor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          dependency_type?: string
          id?: string
          lag_days?: number
          predecessor_entity_type?: string
          predecessor_id?: string
          successor_entity_type?: string
          successor_id?: string
        }
        Relationships: []
      }
      task_groups: {
        Row: {
          archive_comment: string | null
          baseline_approver_id: string | null
          baseline_auto_lock_hours: number
          baseline_locked_at: string | null
          baseline_status: string
          closed_at: string | null
          color: string | null
          created_at: string
          description: string | null
          draft_status: string
          icon: string | null
          id: string
          linked_tag_id: string | null
          logo_url: string | null
          name: string
          parent_id: string | null
          position: number
          project_subtype: string | null
          project_type: string
          protocol_meta: Json
          stm_meta: Json
          user_id: string
        }
        Insert: {
          archive_comment?: string | null
          baseline_approver_id?: string | null
          baseline_auto_lock_hours?: number
          baseline_locked_at?: string | null
          baseline_status?: string
          closed_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          draft_status?: string
          icon?: string | null
          id?: string
          linked_tag_id?: string | null
          logo_url?: string | null
          name: string
          parent_id?: string | null
          position?: number
          project_subtype?: string | null
          project_type?: string
          protocol_meta?: Json
          stm_meta?: Json
          user_id: string
        }
        Update: {
          archive_comment?: string | null
          baseline_approver_id?: string | null
          baseline_auto_lock_hours?: number
          baseline_locked_at?: string | null
          baseline_status?: string
          closed_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          draft_status?: string
          icon?: string | null
          id?: string
          linked_tag_id?: string | null
          logo_url?: string | null
          name?: string
          parent_id?: string | null
          position?: number
          project_subtype?: string | null
          project_type?: string
          protocol_meta?: Json
          stm_meta?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_groups_linked_tag_id_fkey"
            columns: ["linked_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      task_participants: {
        Row: {
          created_at: string
          id: string
          role: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_participants_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_step_templates: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          is_global: boolean
          name: string
          steps: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_global?: boolean
          name: string
          steps?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_global?: boolean
          name?: string
          steps?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_step_templates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      task_tags: {
        Row: {
          tag_id: string
          task_id: string
        }
        Insert: {
          tag_id: string
          task_id: string
        }
        Update: {
          tag_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_tags_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          approval_status: string | null
          assigned_to: string | null
          client_id: string | null
          closure_attachments: Json | null
          closure_result: string | null
          completed_at: string | null
          contractor_id: string | null
          created_at: string
          deadline: string | null
          deferred_until: string | null
          delegated_from: string | null
          department_id: string | null
          description: string | null
          external_assignee: Json | null
          external_ref: string | null
          group_id: string | null
          id: string
          is_completed: boolean
          is_draft: boolean
          is_important: boolean
          original_deadline: string | null
          parent_recurring_id: string | null
          position: number
          priority: number | null
          protocol_scope: string
          recurrence: string | null
          recurrence_end_date: string | null
          requires_approval: boolean
          source_protocol_id: string | null
          stage_key: string | null
          start_at: string | null
          status_meta: Json
          stm_flow: string | null
          task_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_status?: string | null
          assigned_to?: string | null
          client_id?: string | null
          closure_attachments?: Json | null
          closure_result?: string | null
          completed_at?: string | null
          contractor_id?: string | null
          created_at?: string
          deadline?: string | null
          deferred_until?: string | null
          delegated_from?: string | null
          department_id?: string | null
          description?: string | null
          external_assignee?: Json | null
          external_ref?: string | null
          group_id?: string | null
          id?: string
          is_completed?: boolean
          is_draft?: boolean
          is_important?: boolean
          original_deadline?: string | null
          parent_recurring_id?: string | null
          position?: number
          priority?: number | null
          protocol_scope?: string
          recurrence?: string | null
          recurrence_end_date?: string | null
          requires_approval?: boolean
          source_protocol_id?: string | null
          stage_key?: string | null
          start_at?: string | null
          status_meta?: Json
          stm_flow?: string | null
          task_type?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_status?: string | null
          assigned_to?: string | null
          client_id?: string | null
          closure_attachments?: Json | null
          closure_result?: string | null
          completed_at?: string | null
          contractor_id?: string | null
          created_at?: string
          deadline?: string | null
          deferred_until?: string | null
          delegated_from?: string | null
          department_id?: string | null
          description?: string | null
          external_assignee?: Json | null
          external_ref?: string | null
          group_id?: string | null
          id?: string
          is_completed?: boolean
          is_draft?: boolean
          is_important?: boolean
          original_deadline?: string | null
          parent_recurring_id?: string | null
          position?: number
          priority?: number | null
          protocol_scope?: string
          recurrence?: string | null
          recurrence_end_date?: string | null
          requires_approval?: boolean
          source_protocol_id?: string | null
          stage_key?: string | null
          start_at?: string | null
          status_meta?: Json
          stm_flow?: string | null
          task_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_recurring_id_fkey"
            columns: ["parent_recurring_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_protocol_id_fkey"
            columns: ["source_protocol_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string
          id: string
          invite_code: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          invite_code?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          invite_code?: string
          name?: string
        }
        Relationships: []
      }
      telegram_2fa_codes: {
        Row: {
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          telegram_username: string
          verified: boolean
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          telegram_username: string
          verified?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          telegram_username?: string
          verified?: boolean
        }
        Relationships: []
      }
      telegram_bot_chats: {
        Row: {
          chat_id: number
          created_at: string
          id: string
          telegram_username: string
          updated_at: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          id?: string
          telegram_username: string
          updated_at?: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          id?: string
          telegram_username?: string
          updated_at?: string
        }
        Relationships: []
      }
      telegram_group_chats: {
        Row: {
          created_at: string
          group_id: string
          id: string
          linked_by: string
          telegram_chat_id: number
          telegram_chat_title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          linked_by: string
          telegram_chat_id: number
          telegram_chat_title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          linked_by?: string
          telegram_chat_id?: number
          telegram_chat_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_group_chats_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_pending_context: {
        Row: {
          awaiting_axis: string | null
          chat_id: number
          collected_axes: Json
          context_type: string
          created_at: string
          group_id: string | null
          group_name: string | null
          id: number
          last_message_at: string | null
          parsed_payload: Json | null
          protocol_name: string | null
          raw_messages: Json
          template_key: string | null
          user_id: string
        }
        Insert: {
          awaiting_axis?: string | null
          chat_id: number
          collected_axes?: Json
          context_type?: string
          created_at?: string
          group_id?: string | null
          group_name?: string | null
          id?: number
          last_message_at?: string | null
          parsed_payload?: Json | null
          protocol_name?: string | null
          raw_messages?: Json
          template_key?: string | null
          user_id: string
        }
        Update: {
          awaiting_axis?: string | null
          chat_id?: number
          collected_axes?: Json
          context_type?: string
          created_at?: string
          group_id?: string | null
          group_name?: string | null
          id?: number
          last_message_at?: string | null
          parsed_payload?: Json | null
          protocol_name?: string | null
          raw_messages?: Json
          template_key?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_pending_context_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_departments: {
        Row: {
          created_at: string
          department_id: string
          is_primary: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          is_primary?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          is_primary?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vapid_keys: {
        Row: {
          created_at: string
          id: number
          private_key: string
          public_key: string
        }
        Insert: {
          created_at?: string
          id?: number
          private_key: string
          public_key: string
        }
        Update: {
          created_at?: string
          id?: number
          private_key?: string
          public_key?: string
        }
        Relationships: []
      }
      wiki_pages: {
        Row: {
          content: string | null
          created_at: string
          group_id: string | null
          icon: string | null
          id: string
          page_type: string
          parent_page_id: string | null
          position: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          group_id?: string | null
          icon?: string | null
          id?: string
          page_type?: string
          parent_page_id?: string | null
          position?: number
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          group_id?: string | null
          icon?: string | null
          id?: string
          page_type?: string
          parent_page_id?: string | null
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_pages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_pages_parent_page_id_fkey"
            columns: ["parent_page_id"]
            isOneToOne: false
            referencedRelation: "wiki_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_structured_sections: {
        Row: {
          content: string | null
          created_at: string
          group_id: string
          id: string
          position: number
          section_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          group_id: string
          id?: string
          position?: number
          section_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          group_id?: string
          id?: string
          position?: number
          section_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_structured_sections_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vapid_public_keys: {
        Row: {
          id: number | null
          public_key: string | null
        }
        Insert: {
          id?: number | null
          public_key?: string | null
        }
        Update: {
          id?: number | null
          public_key?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_delete_user: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      admin_exists: { Args: never; Returns: boolean }
      admin_hard_delete_user: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      admin_restore_user: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      admin_set_users_department: {
        Args: { dept_id: string; user_ids: string[] }
        Returns: number
      }
      admin_soft_delete_user: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      can_access_dependency: {
        Args: { _dep_id: string; _user_id: string }
        Returns: boolean
      }
      can_see_task: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      can_see_task_row: {
        Args: {
          _task_assigned_to: string
          _task_department_id: string
          _task_group_id: string
          _task_id: string
          _task_user_id: string
          _user_id: string
        }
        Returns: boolean
      }
      can_view_tag: {
        Args: { _tag_id: string; _user_id: string }
        Returns: boolean
      }
      consultant_can_see_group: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      consultant_can_see_tag: {
        Args: { _tag_id: string; _user_id: string }
        Returns: boolean
      }
      consultant_can_see_task: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      consultant_can_see_user: {
        Args: { _target: string; _viewer: string }
        Returns: boolean
      }
      consultant_company: { Args: { _user_id: string }; Returns: string }
      copy_protocol_system_tags_to_task: {
        Args: { _protocol_id: string; _task_id: string }
        Returns: undefined
      }
      debug_user_visible_groups: {
        Args: { _user_id: string }
        Returns: {
          group_id: string
          group_name: string
          parent_id: string
        }[]
      }
      department_depth: { Args: { _dept_id: string }; Returns: number }
      ensure_protocol_review_task: {
        Args: { _assignee: string; _protocol_id: string }
        Returns: undefined
      }
      get_department_descendants: {
        Args: { _dept_id: string }
        Returns: {
          id: string
        }[]
      }
      get_group_task_stats: {
        Args: { _group_ids: string[] }
        Returns: {
          active: number
          completed: number
          drift: number
          earliest_start: string
          group_id: string
          last_completed_at: string
          max_drift_days: number
          overdue: number
          total: number
          upcoming_7d: number
        }[]
      }
      get_my_auth_meta: {
        Args: never
        Returns: {
          admin_disabled: boolean
          is_admin: boolean
          is_approved: boolean
          is_consultant: boolean
          no_admins_exist: boolean
        }[]
      }
      get_my_profile_approval: { Args: never; Returns: boolean }
      get_unread_threads: {
        Args: never
        Returns: {
          last_message_at: string
          thread_id: string
          unread_count: number
        }[]
      }
      get_user_departments: {
        Args: { _user_id: string }
        Returns: {
          department_id: string
          is_primary: boolean
        }[]
      }
      get_user_visible_departments: {
        Args: { _user_id: string }
        Returns: {
          department_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tag_access: {
        Args: { _tag_id: string; _user_id: string }
        Returns: boolean
      }
      is_consultant: { Args: { _user_id: string }; Returns: boolean }
      is_delegatee_in_group: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_director_of_department: {
        Args: { _dept_id: string; _user_id: string }
        Returns: boolean
      }
      is_director_of_user: {
        Args: { _director_id: string; _user_id: string }
        Returns: boolean
      }
      is_full_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_owner: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_message_in_parent_member_group: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_parent_of_member_group: {
        Args: { _parent_id: string; _user_id: string }
        Returns: boolean
      }
      is_protocol_draft: { Args: { _group_id: string }; Returns: boolean }
      is_protocol_internal_attendee: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_subgroup_of_member_group: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_subgroup_of_owner_group: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_subgroup_owner: {
        Args: { _parent_id: string; _user_id: string }
        Returns: boolean
      }
      is_supervisor_of_user: {
        Args: { _supervisor_id: string; _user_id: string }
        Returns: boolean
      }
      is_supervisor_task_in_shared_group: {
        Args: { _supervisor_id: string; _task_id: string }
        Returns: boolean
      }
      is_task_in_member_group: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      is_task_in_parent_member_group: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      is_task_in_parent_owner_group: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      is_task_in_protocol_attendee_scope: {
        Args: { _draft_only?: boolean; _task_id: string; _user_id: string }
        Returns: boolean
      }
      is_task_in_user_group: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      is_task_owner: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      is_task_participant: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      is_task_visible: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_director: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
      is_user_in_task_department: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      protocol_copyable_system_keys: { Args: never; Returns: string[] }
      remove_protocol_system_tags_from_task: {
        Args: { _protocol_id: string; _task_id: string }
        Returns: undefined
      }
      resolve_dependency_violations: { Args: never; Returns: number }
      seed_onboarding_data: { Args: { _user_id: string }; Returns: undefined }
      seed_protocol_status_for_user: {
        Args: { _user_id: string }
        Returns: undefined
      }
      seed_protocol_templates: {
        Args: { _user_id: string }
        Returns: undefined
      }
      seed_system_tag_categories: {
        Args: { _user_id: string }
        Returns: undefined
      }
      task_has_tag_access: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      upsert_client_by_name: {
        Args: { _name: string; _user_id: string }
        Returns: string
      }
      user_belongs_to_department: {
        Args: { _department_id: string; _user_id: string }
        Returns: boolean
      }
      user_extra_tasks_arr: { Args: { _user_id: string }; Returns: string[] }
      user_extra_visible_task_ids: {
        Args: { _user_id: string }
        Returns: {
          task_id: string
        }[]
      }
      user_protocol_groups_arr: {
        Args: { _user_id: string }
        Returns: string[]
      }
      user_subordinate_ids: {
        Args: { _user_id: string }
        Returns: {
          subordinate_id: string
        }[]
      }
      user_subordinates_arr: { Args: { _user_id: string }; Returns: string[] }
      user_visible_department_ids: {
        Args: { _user_id: string }
        Returns: {
          department_id: string
        }[]
      }
      user_visible_depts_arr: { Args: { _user_id: string }; Returns: string[] }
      user_visible_group_ids: {
        Args: { _user_id: string }
        Returns: {
          group_id: string
        }[]
      }
      user_visible_groups_arr: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "user" | "consultant" | "director"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "consultant", "director"],
    },
  },
} as const
