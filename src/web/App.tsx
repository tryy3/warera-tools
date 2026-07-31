import { useState } from "react";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { JobsPage } from "./features/jobs/JobsPage";
import { Shell, type TabId } from "./layout/Shell";

function App() {
  const [tab, setTab] = useState<TabId>("dashboard");

  return (
    <Shell activeTab={tab} onTabChange={setTab}>
      {tab === "dashboard" ? <DashboardPage /> : <JobsPage />}
    </Shell>
  );
}

export default App;
