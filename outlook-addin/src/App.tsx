import { useState, useCallback } from "react";
import { cn } from "./lib/utils";
import { stats, clear } from "./lib/store";
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
  // Increment to force re-render of store-dependent pages after capture
  const [storeVersion, setStoreVersion] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleCapture = useCallback(() => {
    setStoreVersion((v) => v + 1);
  }, []);

  function handleClear() {
    clear();
    setStoreVersion((v) => v + 1);
    setShowClearConfirm(false);
  }

  const storeStats = stats();

  return (
    <div className="flex h-screen flex-col bg-gray-50 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <h1 className="text-sm font-semibold text-gray-700">JTD Mail AI</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            📦 {storeStats.total} писем
          </span>
          {showClearConfirm ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleClear}
                className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50"
              >
                Да, очистить
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100"
              >
                Отмена
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="rounded px-1.5 py-0.5 text-xs text-gray-300 hover:text-gray-500 hover:bg-gray-100"
              title="Очистить архив"
            >
              🗑
            </button>
          )}
        </div>
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
                ? "border-b-2 border-brand-500 font-medium text-brand-600"
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
        {activeTab === "current" && <CurrentEmailPage onCapture={handleCapture} />}
        {activeTab === "day" && <DaySummaryPage storeVersion={storeVersion} />}
        {activeTab === "threads" && <ThreadsPage storeVersion={storeVersion} />}
        {activeTab === "people" && <PeoplePage storeVersion={storeVersion} />}
      </div>
    </div>
  );
}
