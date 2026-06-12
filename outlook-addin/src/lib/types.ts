export interface EmailItem {
  id: string;
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
  aiInsight?: string;
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

export interface Credentials {
  server: string;
  username: string;
  password: string;
}
