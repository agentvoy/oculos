import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Overview from './components/pages/Overview';
import AgentsPage from './components/pages/AgentsPage';
import AgentDetail from './components/pages/AgentDetail';
import TracesPage from './components/pages/TracesPage';
import TopologyPage from './components/pages/TopologyPage';
import PromptsPage from './components/pages/PromptsPage';
import SecretsPage from './components/pages/SecretsPage';
import BudgetsPage from './components/pages/BudgetsPage';
import AlertsPage from './components/pages/AlertsPage';
import AuditPage from './components/pages/AuditPage';

export default function App() {
  const [page, setPage] = useState('overview');
  const [selectedAgentId, setSelectedAgentId] = useState(null);

  function handleSelectAgent(agent) {
    setSelectedAgentId(agent.id);
    setPage('agent-detail');
  }

  function handleNav(p) {
    setPage(p);
    setSelectedAgentId(null);
  }

  function renderPage() {
    if (page === 'agent-detail' && selectedAgentId) {
      return (
        <AgentDetail
          agentId={selectedAgentId}
          onBack={() => handleNav('agents')}
        />
      );
    }
    if (page === 'agents')   return <AgentsPage onSelectAgent={handleSelectAgent} />;
    if (page === 'traces')   return <TracesPage />;
    if (page === 'topology') return <TopologyPage />;
    if (page === 'prompts')  return <PromptsPage />;
    if (page === 'secrets')  return <SecretsPage />;
    if (page === 'budgets')  return <BudgetsPage />;
    if (page === 'alerts')   return <AlertsPage />;
    if (page === 'audit')    return <AuditPage />;
    return <Overview onSelectAgent={handleSelectAgent} />;
  }

  const activePage = page === 'agent-detail' ? 'agents' : page;

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar page={activePage} onNav={handleNav} />
      <main className="flex-1 overflow-y-auto">
        {renderPage()}
      </main>
    </div>
  );
}
