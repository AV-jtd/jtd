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
      clients: {
        Row: {
          city: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          group_id: string | null
          id: string
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
          telegram_added_to_group: boolean
          telegram_deadline_approaching: boolean
          telegram_new_task_in_group: boolean
          telegram_task_assigned: boolean
          telegram_task_commented: boolean
          telegram_task_completed: boolean
          telegram_task_delegated: boolean
          telegram_task_participant_added: boolean
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
          telegram_added_to_group?: boolean
          telegram_deadline_approaching?: boolean
          telegram_new_task_in_group?: boolean
          telegram_task_assigned?: boolean
          telegram_task_commented?: boolean
          telegram_task_completed?: boolean
          telegram_task_delegated?: boolean
          telegram_task_participant_added?: boolean
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
          telegram_added_to_group?: boolean
          telegram_deadline_approaching?: boolean
          telegram_new_task_in_group?: boolean
          telegram_task_assigned?: boolean
          telegram_task_commented?: boolean
          telegram_task_completed?: boolean
          telegram_task_delegated?: boolean
          telegram_task_participant_added?: boolean
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
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_approved: boolean
          telegram_chat_id: number | null
          telegram_username: string | null
          username: string | null
          work_email: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_approved?: boolean
          telegram_chat_id?: number | null
          telegram_username?: string | null
          username?: string | null
          work_email?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_approved?: boolean
          telegram_chat_id?: number | null
          telegram_username?: string | null
          username?: string | null
          work_email?: string | null
        }
        Relationships: []
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
          group_id: string
          id: string
          name: string
          planned_date: string
          status: string
          updated_at: string
        }
        Insert: {
          actual_date?: string | null
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          group_id: string
          id?: string
          name: string
          planned_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          actual_date?: string | null
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          group_id?: string
          id?: string
          name?: string
          planned_date?: string
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
          id: string
          name: string
          parent_id: string | null
          position: number
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
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
          closed_at: string | null
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          linked_tag_id: string | null
          name: string
          parent_id: string | null
          position: number
          project_type: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          linked_tag_id?: string | null
          name: string
          parent_id?: string | null
          position?: number
          project_type?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          linked_tag_id?: string | null
          name?: string
          parent_id?: string | null
          position?: number
          project_type?: string
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
          created_at: string
          deadline: string | null
          deferred_until: string | null
          delegated_from: string | null
          description: string | null
          group_id: string | null
          id: string
          is_completed: boolean
          is_important: boolean
          original_deadline: string | null
          parent_recurring_id: string | null
          position: number
          priority: number | null
          recurrence: string | null
          recurrence_end_date: string | null
          requires_approval: boolean
          start_at: string | null
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
          created_at?: string
          deadline?: string | null
          deferred_until?: string | null
          delegated_from?: string | null
          description?: string | null
          group_id?: string | null
          id?: string
          is_completed?: boolean
          is_important?: boolean
          original_deadline?: string | null
          parent_recurring_id?: string | null
          position?: number
          priority?: number | null
          recurrence?: string | null
          recurrence_end_date?: string | null
          requires_approval?: boolean
          start_at?: string | null
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
          created_at?: string
          deadline?: string | null
          deferred_until?: string | null
          delegated_from?: string | null
          description?: string | null
          group_id?: string | null
          id?: string
          is_completed?: boolean
          is_important?: boolean
          original_deadline?: string | null
          parent_recurring_id?: string | null
          position?: number
          priority?: number | null
          recurrence?: string | null
          recurrence_end_date?: string | null
          requires_approval?: boolean
          start_at?: string | null
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
      admin_exists: { Args: never; Returns: boolean }
      can_access_dependency: {
        Args: { _dep_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_tag: {
        Args: { _tag_id: string; _user_id: string }
        Returns: boolean
      }
      debug_user_visible_groups: {
        Args: { _user_id: string }
        Returns: {
          group_id: string
          group_name: string
          parent_id: string
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
      is_delegatee_in_group: {
        Args: { _group_id: string; _user_id: string }
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
      is_team_director: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      seed_onboarding_data: { Args: { _user_id: string }; Returns: undefined }
      task_has_tag_access: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
