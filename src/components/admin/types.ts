export interface AdminUser {
  id: string;
  display_name: string | null;
  email: string | null;
  telegram_username: string | null;
  telegram_chat_id: string | null;
  created_at: string;
  is_approved: boolean;
  department_id: string | null;
  organization: string | null;
  contractor_id: string | null;
  client_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface Department { id: string; name: string; head_user_id: string | null; }
export interface ContractorLite { id: string; name: string; }
export interface ClientLite { id: string; name: string; }

export type SortMode = "date_desc" | "date_asc" | "name_asc" | "department";
export type GroupMode = "none" | "department";
