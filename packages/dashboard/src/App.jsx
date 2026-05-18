import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Overview from './components/pages/Overview';
import AgentsPage from './components/pages/AgentsPage';
import AgentDetail from './components/pages/AgentDetail';
import TracesPage from './components/pages/TracesPage';

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
    return <Overview onSelectAgent={handleSelectAgent} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar page={page === 'agent-detail' ? 'agents' : page} onNav={handleNav} />
      <main className="flex-1 overflow-y-auto">
        {renderPage()}
      </main>
    </div>
  );
}
