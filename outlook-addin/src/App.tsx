import { useState } from "react";
import { cn } from "./lib/utils";
import { CurrentEmailPage } from "./pages/CurrentEmailPage";
import { DaySummaryPage } from "./pages/DaySummaryPage";
import { ThreadsPage } from "./pages/ThreadsPage";
import { PeoplePage } from "./pages/PeoplePage";

type Tab = "current" | "day" | "threads" | "people";

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: "current", label: "Письмо", icon: "✉️" },
  { id: "day", label: "День", icon: "📅" },
  { id: "threads", label: "Ветки", icon: "💬" },
  { id: "people", label: "Люди", icon: "👥" },
];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("current");

  return (
    <div className="flex h-screen flex-col bg-gray-50 font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 border-b bg-white px-3 py-2 shadow-sm">
        <span className="text-base">🤖</span>
        <h1 className="text-sm font-semibold text-gray-700">JTD Mail AI</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b bg-white">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors",
              activeTab === tab.id
                ? "border-b-2 border-brand-500 text-brand-600 font-medium"
                : "text-gray-400 hover:text-gray-600"
            )}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "current" && <CurrentEmailPage />}
        {activeTab === "day" && <DaySummaryPage />}
        {activeTab === "threads" && <ThreadsPage />}
        {activeTab === "people" && <PeoplePage />}
      </div>
    </div>
  );
}
