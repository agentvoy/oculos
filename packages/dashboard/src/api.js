const BASE = '/api';

async function fetchJSON(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function getStatus() {
  return fetchJSON('/status');
}

export async function getAgents() {
  const data = await fetchJSON('/agents');
  return data.agents || [];
}

export async function getAgent(id) {
  return fetchJSON(`/agents/${id}`);
}

export async function getAgentCost(id) {
  return fetchJSON(`/agents/${id}/cost`);
}

export async function getTraces(agentId = null, traceId = null) {
  const params = new URLSearchParams();
  if (agentId) params.set('agent_id', agentId);
  if (traceId) params.set('trace_id', traceId);
  const q = params.toString();
  return fetchJSON(`/traces${q ? '?' + q : ''}`);
}

export async function getCostSummary() {
  return fetchJSON('/cost/summary');
}

export async function deleteAgent(id) {
  const res = await fetch(`${BASE}/agents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${res.status}`);
}
