import { useState, useCallback } from "react";
import { cn } from "./lib/utils";
import { CurrentEmailPage } from "./pages/CurrentEmailPage";
import { TriagePage } from "./pages/TriagePage";
import { DaySummaryPage } from "./pages/DaySummaryPage";
import { PeoplePage } from "./pages/PeoplePage";
import { PendingPage } from "./pages/PendingPage";

type Tab = "current" | "triage" | "day" | "people" | "pending";

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: "current", label: "Письмо", icon: "✉️" },
  { id: "triage", label: "Разбор", icon: "📥" },
  { id: "day", label: "День", icon: "📅" },
  { id: "people", label: "Люди", icon: "👥" },
  { id: "pending", label: "Висит", icon: "⏳" },
];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("triage");
  const handleCapture = useCallback(() => {}, []);

  return (
    <div className="flex h-screen flex-col bg-gray-50 font-sans">
      <div className="flex items-center gap-2 border-b bg-white px-3 py-2 shadow-sm">
        <span className="text-base">🤖</span>
        <h1 className="text-sm font-semibold text-gray-700">JTD Mail AI</h1>
      </div>

      <div className="flex border-b bg-white">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors",
              activeTab === tab.id
                ? "border-b-2 border-brand-500 font-medium text-brand-600"
                : "text-gray-400 hover:text-gray-600"
            )}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "current" && <CurrentEmailPage onCapture={handleCapture} />}
        {activeTab === "triage" && <TriagePage />}
        {activeTab === "day" && <DaySummaryPage />}
        {activeTab === "people" && <PeoplePage />}
        {activeTab === "pending" && <PendingPage />}
      </div>
    </div>
  );
}
