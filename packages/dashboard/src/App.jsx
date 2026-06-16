import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import LoginPage from './components/pages/LoginPage';
import Overview from './components/pages/Overview';
import RunsPage from './components/pages/RunsPage';
import SecretsPage from './components/pages/SecretsPage';
import SettingsPage from './components/pages/SettingsPage';
import WorkflowsPage from './components/pages/WorkflowsPage';
import WorkflowEditor from './components/pages/WorkflowEditor';

export default function App() {
  const [page, setPage] = useState('overview');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
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

  function handleNav(p) {
    setPage(p);
    setSelectedWorkflowId(null);
  }

  function openWorkflow(wf) {
    setSelectedWorkflowId(wf.id);
    setPage('workflow-editor');
  }

  function renderPage() {
    if (page === 'workflow-editor' && selectedWorkflowId) {
      return <WorkflowEditor workflowId={selectedWorkflowId} onBack={() => handleNav('workflows')} />;
    }
    if (page === 'workflows') return <WorkflowsPage onSelectWorkflow={openWorkflow} />;
    if (page === 'runs')      return <RunsPage />;
    if (page === 'secrets')   return <SecretsPage />;
    if (page === 'settings')  return <SettingsPage />;
    return <Overview onNewWorkflow={() => handleNav('workflows')} />;
  }

  if (!authState.checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="text-sm text-muted">Loading...</div>
      </div>
    );
  }

  if (authState.authEnabled && !authState.user) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar page={page === 'workflow-editor' ? 'workflows' : page} onNav={handleNav} user={authState.user} />
      <main className="flex-1 overflow-y-auto">
        {renderPage()}
      </main>
    </div>
  );
}
