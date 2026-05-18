import { useState, useCallback } from 'react';
import { Bot, DollarSign, Activity, Zap } from 'lucide-react';
import Header from './components/Header';
import StatCard from './components/StatCard';
import AgentCard from './components/AgentCard';
import AgentDetail from './components/AgentDetail';
import EmptyState from './components/EmptyState';
import { usePolling } from './hooks';
import { getStatus, getAgents } from './api';

export default function App() {
  const [selectedAgent, setSelectedAgent] = useState(null);
  const { data: status } = usePolling(getStatus, 5000);
  const { data: agents, loading } = usePolling(getAgents, 5000);

  const healthyCount = agents ? agents.filter(a => a.status === 'healthy').length : 0;

  if (selectedAgent) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-5xl mx-auto px-6 py-8">
          <AgentDetail agentId={selectedAgent} onBack={() => setSelectedAgent(null)} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-text-primary mb-1">Dashboard</h2>
          <p className="text-sm text-text-secondary">Monitor your AI agents in real-time</p>
        </div>

        {status && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Agents"
              value={status.agents_count}
              icon={<Bot className="h-4 w-4" />}
              subtext={`${healthyCount} healthy`}
            />
            <StatCard
              label="Total Cost"
              value={`$${status.total_cost.toFixed(4)}`}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <StatCard
              label="Invocations"
              value={agents ? agents.reduce((s, a) => s + (a.total_invocations || 0), 0) : 0}
              icon={<Activity className="h-4 w-4" />}
            />
            <StatCard
              label="Server"
              value={status.version}
              icon={<Zap className="h-4 w-4" />}
              subtext="Running"
            />
          </div>
        )}

        {loading ? (
          <div className="text-text-muted text-sm text-center py-12">Loading agents...</div>
        ) : !agents || agents.length === 0 ? (
          <EmptyState />
        ) : (
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-4">
              Registered Agents ({agents.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onClick={(a) => setSelectedAgent(a.id)}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
