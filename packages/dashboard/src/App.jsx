import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import LoginPage from './components/pages/LoginPage';
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
import SettingsPage from './components/pages/SettingsPage';

export default function App() {
  const [page, setPage] = useState('overview');
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [authState, setAuthState] = useState({ checked: false, user: null, authEnabled: false });

  useEffect(() => {
    fetch('/auth/providers')
      .then(r => r.json())
      .then(p => {
        if (!p.auth_enabled) {
          setAuthState({ checked: true, user: null, authEnabled: false });
        } else {
          fetch('/auth/me')
            .then(r => {
              if (r.ok) return r.json();
              throw new Error('not authed');
            })
            .then(user => setAuthState({ checked: true, user, authEnabled: true }))
            .catch(() => setAuthState({ checked: true, user: null, authEnabled: true }));
        }
      })
      .catch(() => setAuthState({ checked: true, user: null, authEnabled: false }));
  }, []);

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
      return <AgentDetail agentId={selectedAgentId} onBack={() => handleNav('agents')} />;
    }
    if (page === 'agents')   return <AgentsPage onSelectAgent={handleSelectAgent} />;
    if (page === 'traces')   return <TracesPage />;
    if (page === 'topology') return <TopologyPage />;
    if (page === 'prompts')  return <PromptsPage />;
    if (page === 'secrets')  return <SecretsPage />;
    if (page === 'budgets')  return <BudgetsPage />;
    if (page === 'alerts')   return <AlertsPage />;
    if (page === 'audit')    return <AuditPage />;
    if (page === 'settings') return <SettingsPage />;
    return <Overview onSelectAgent={handleSelectAgent} />;
  }

  // Loading state
  if (!authState.checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="text-sm text-muted">Loading...</div>
      </div>
    );
  }

  // Auth required but not logged in
  if (authState.authEnabled && !authState.user) {
    return <LoginPage />;
  }

  const activePage = page === 'agent-detail' ? 'agents' : page;

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar page={activePage} onNav={handleNav} user={authState.user} />
      <main className="flex-1 overflow-y-auto">
        {renderPage()}
      </main>
    </div>
  );
}
