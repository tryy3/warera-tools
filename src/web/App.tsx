import { useState } from "react";
import { CalculatorPage } from "./features/calculator/CalculatorPage";
import { CountriesPage } from "./features/countries/CountriesPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { EconomyPage } from "./features/economy/EconomyPage";
import { JobsPage } from "./features/jobs/JobsPage";
import { Shell, type TabId } from "./layout/Shell";

function App() {
  const [tab, setTab] = useState<TabId>("dashboard");

  return (
    <Shell activeTab={tab} onTabChange={setTab}>
      {tab === "dashboard" ? (
        <DashboardPage />
      ) : tab === "jobs" ? (
        <JobsPage />
      ) : tab === "calculator" ? (
        <CalculatorPage />
      ) : tab === "economy" ? (
        <EconomyPage />
      ) : (
        <CountriesPage />
      )}
    </Shell>
  );
}

export default App;
