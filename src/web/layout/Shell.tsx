import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

type ShellProps = {
  children: ReactNode;
};

const tabs = [
  { to: "/", label: "Dashboard" },
  { to: "/jobs", label: "Jobs" },
  { to: "/calculator", label: "Calculator" },
  { to: "/economy", label: "Economy" },
  { to: "/countries", label: "Countries" },
] as const;

export function Shell({ children }: ShellProps) {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-brand">Warera</div>
        <nav className="shell-nav">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className="nav-link"
              activeProps={{ className: "nav-link active" }}
              activeOptions={tab.to === "/" ? { exact: true } : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}
