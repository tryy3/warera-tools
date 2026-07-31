import type { ReactNode } from "react";

export type TabId = "dashboard" | "jobs" | "calculator" | "countries";

type ShellProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: ReactNode;
};

const tabs: { id: TabId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "jobs", label: "Jobs" },
  { id: "calculator", label: "Calculator" },
  { id: "countries", label: "Countries" },
];

export function Shell({ activeTab, onTabChange, children }: ShellProps) {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-brand">Warera</div>
        <nav className="shell-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "nav-link active" : "nav-link"}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}
