import { useState } from "react";
import { CalculatorPage } from "./features/calculator/CalculatorPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { JobsPage } from "./features/jobs/JobsPage";
import { Shell, type TabId } from "./layout/Shell";

function App() {
  const [tab, setTab] = useState<TabId>("dashboard");

  return (
    <Shell activeTab={tab} onTabChange={setTab}>
      {tab === "dashboard" ? <DashboardPage /> : tab === "jobs" ? <JobsPage /> : <CalculatorPage />}
    </Shell>
  );
}

export default App;
