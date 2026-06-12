export type Category = "action" | "info" | "newsletter" | "auto" | "trash";

export interface EmailItem {
  id: string;
  changeKey?: string;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  dateReceived: string;
  body: string;
  conversationId: string;
  isRead: boolean;
  hasAttachments: boolean;
  importance: "Low" | "Normal" | "High";
  // AI-категоризация
  category?: Category;
  aiPriority?: "low" | "medium" | "high";
  gist?: string;
}

export interface Thread {
  conversationId: string;
  subject: string;
  participants: string[];
  emails: EmailItem[];
  latestDate: string;
  unreadCount: number;
}

export interface PersonSummary {
  email: string;
  name: string;
  emailCount: number;
  lastContact: string;
  topics: string[];
}

export interface AiAnalysis {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  priority: "low" | "medium" | "high";
  sentiment: "positive" | "neutral" | "negative";
  tags: string[];
}

export interface DaySummary {
  totalEmails: number;
  unreadCount: number;
  topThreads: { subject: string; count: number; insight: string }[];
  topPeople: { name: string; email: string; count: number }[];
  actionItems: string[];
  overallInsight: string;
  byProject: { project: string; count: number; summary: string }[];
}

export interface PromisesReport {
  openPromises: {
    from: string;
    email: string;
    promise: string;
    promisedDate: string;
    daysSince: number;
    subject: string;
    urgency: "low" | "medium" | "high";
  }[];
  openQuestions: {
    askedBy: string;
    to: string;
    question: string;
    daysSince: number;
    subject: string;
  }[];
  summary: string;
}

export interface PersonDossier {
  name: string;
  email: string;
  relationship: string;
  totalEmails: number;
  openItems: string[];
  recentTopics: string[];
  promises: { direction: "they" | "you"; text: string; status: "open" | "done" }[];
  recommendedAction: string;
}

export interface SyncState {
  phase: "idle" | "unread" | "all" | "done";
  offset: number;
  totalEstimate: number;
  loaded: number;
  lastSyncDate: string | null;
}
