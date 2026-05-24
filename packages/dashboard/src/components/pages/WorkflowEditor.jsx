import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Play, Save, CheckCircle, XCircle, Clock, AlertTriangle, Plus, ChevronLeft, ChevronRight, X, Zap, Power } from 'lucide-react';
import WorkflowGraph from '../canvas/WorkflowGraph';
import NodeConfigPanel from '../canvas/NodeConfigPanel';
import { usePolling } from '../../hooks';
import { relativeTime, fmt$$ } from '../../utils';

const BASE = '/api';

async function fetchWorkflow(id) {
  const r = await fetch(`${BASE}/workflows/${id}`);
  return r.json();
}

const RUN_STATUS_ICON = {
  completed: { icon: CheckCircle, color: 'text-green' },
  failed:    { icon: XCircle,     color: 'text-red' },
  running:   { icon: Clock,       color: 'text-accent' },
  cancelled: { icon: AlertTriangle, color: 'text-yellow' },
};

const NODE_CATALOG = [
  {
    category: 'Triggers', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',
    nodes: [
      { type: 'trigger/schedule', label: 'Schedule', emoji: '⏰', desc: 'Run on a cron schedule' },
      { type: 'trigger/webhook',  label: 'Webhook',  emoji: '🔗', desc: 'Trigger via HTTP' },
      { type: 'trigger/manual',   label: 'Manual',   emoji: '🔘', desc: 'Run manually' },
    ],
  },
  {
    category: 'AI', color: '#818cf8', bg: 'rgba(129,140,248,0.1)',
    nodes: [
      { type: 'ai/transform', label: 'Transform', emoji: '🤖', desc: 'Process with AI' },
      { type: 'ai/decide',    label: 'Decide',    emoji: '🧠', desc: 'AI decision making' },
      { type: 'ai/generate',  label: 'Generate',  emoji: '✨', desc: 'Generate content' },
      { type: 'ai/guard',     label: 'Guard',     emoji: '🛡', desc: 'Safety check' },
    ],
  },
  {
    category: 'Tools', color: '#34d399', bg: 'rgba(52,211,153,0.1)',
    nodes: [
      { type: 'tool/http',     label: 'HTTP',     emoji: '🌐', desc: 'Call an API' },
      { type: 'tool/email',    label: 'Email',    emoji: '📧', desc: 'Send email' },
      { type: 'tool/mcp',      label: 'MCP Tool', emoji: '🔧', desc: 'MCP integration' },
      { type: 'tool/database', label: 'Database', emoji: '🗃', desc: 'Query database' },
    ],
  },
  {
    category: 'Logic', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',
    nodes: [
      { type: 'logic/branch', label: 'Branch', emoji: '🔀', desc: 'Conditional split' },
      { type: 'logic/loop',   label: 'Loop',   emoji: '🔄', desc: 'Repeat steps' },
      { type: 'logic/output', label: 'Output', emoji: '📤', desc: 'Final output' },
    ],
  },
];

// ── DAG utilities ──────────────────────────────────────────────────
/** Returns true if adding src→tgt would create a cycle or is a duplicate */
function dagViolation(nodes, edges, srcId, tgtId) {
  if (srcId === tgtId) return 'self-loop';
  if (edges.some(e => e.source === srcId && e.target === tgtId)) return 'duplicate';
  // BFS from tgtId; if we reach srcId → cycle
  const adj = {};
  edges.forEach(e => { (adj[e.source] ??= []).push(e.target); });
  const visited = new Set([tgtId]);
  const queue = [tgtId];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === srcId) return 'cycle';
    for (const nxt of (adj[cur] || [])) {
      if (!visited.has(nxt)) { visited.add(nxt); queue.push(nxt); }
    }
  }
  return null;
}

function humanCron(expr) {
  if (!expr) return null;
  const p = expr.trim().split(/\s+/);
  if (p.length < 5) return expr;
  const [min, hour, , , dow] = p;
  const h = parseInt(hour), m = parseInt(min);
  if (isNaN(h) || isNaN(m)) return expr;
  const time = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  const day = dow === '*' ? 'every day'
    : dow === '1-5' ? 'Mon–Fri'
    : dow === '0,6' || dow === '6,0' ? 'weekends'
    : `day ${dow}`;
  return `${time} · ${day}`;
}

function NodePalette({ onAdd, collapsed, onToggle, addAfterNodeId, addAfterNodeLabel, onCancelAddAfter }) {
  return (
    <div className="shrink-0 flex flex-col h-full"
      style={{
        width: collapsed ? 40 : 188,
        borderRight: '1px solid rgba(129,140,248,0.12)',
        background: '#07071a',
        transition: 'width 0.2s ease',
        position: 'relative',
        zIndex: 10,
      }}>

      {/* CSS for palette button hover — avoids JS style manipulation */}
      <style>{`
        .palette-btn { display:flex; align-items:center; gap:8px; width:100%; padding:6px 8px; border-radius:8px; border:1px solid transparent; cursor:pointer; text-align:left; background:transparent; transition:background 0.15s, border-color 0.15s; }
        .palette-btn:hover { background:rgba(129,140,248,0.08); border-color:rgba(129,140,248,0.25); }
        .palette-btn:active { background:rgba(129,140,248,0.18); transform:scale(0.98); }
        .palette-btn-trigger:hover { background:rgba(96,165,250,0.1); border-color:rgba(96,165,250,0.3); }
        .palette-btn-ai:hover { background:rgba(129,140,248,0.1); border-color:rgba(129,140,248,0.3); }
        .palette-btn-tool:hover { background:rgba(52,211,153,0.08); border-color:rgba(52,211,153,0.3); }
        .palette-btn-logic:hover { background:rgba(251,191,36,0.08); border-color:rgba(251,191,36,0.3); }
        .palette-toggle { display:flex; align-items:center; justify-content:center; padding:4px; border-radius:6px; cursor:pointer; border:none; background:transparent; color:#3a3a58; transition:color 0.15s, background 0.15s; }
        .palette-toggle:hover { color:#eaeaf8; background:rgba(129,140,248,0.1); }
      `}</style>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 8px 8px', borderBottom:'1px solid rgba(129,140,248,0.08)' }}>
        {!collapsed && (
          <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#3a3a58', paddingLeft:4 }}>Add Node</span>
        )}
        <button className="palette-toggle" onClick={onToggle}
          title={collapsed ? 'Expand palette' : 'Collapse palette'}
          style={{ marginLeft: collapsed ? 'auto' : 'auto' }}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* "Adding after" mode banner */}
      {!collapsed && addAfterNodeId && (
        <div style={{ margin:'6px 6px 0', padding:'6px 8px', borderRadius:8, background:'rgba(129,140,248,0.12)', border:'1px solid rgba(129,140,248,0.3)' }}>
          <p style={{ fontSize:9, color:'#818cf8', fontWeight:700, marginBottom:2 }}>ADDING AFTER</p>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:4 }}>
            <p style={{ fontSize:10, color:'#eaeaf8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{addAfterNodeLabel || 'Node'}</p>
            <button onClick={onCancelAddAfter} type="button" title="Cancel"
              style={{ color:'#3a3a58', cursor:'pointer', border:'none', background:'transparent', padding:'2px', borderRadius:4, display:'flex', alignItems:'center' }}
              onMouseEnter={e => e.currentTarget.style.color='#eaeaf8'}
              onMouseLeave={e => e.currentTarget.style.color='#3a3a58'}>
              <X size={10} />
            </button>
          </div>
        </div>
      )}

      {/* Expanded: node list */}
      {!collapsed && (
        <div style={{ flex:1, overflowY:'auto', padding:'8px 6px' }}>
          {NODE_CATALOG.map(({ category, color, nodes }) => {
            const cls = `palette-btn palette-btn-${category.toLowerCase()}`;
            return (
              <div key={category} style={{ marginBottom:12 }}>
                <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color, paddingLeft:4, marginBottom:4 }}>
                  {category}
                </p>
                {nodes.map(n => (
                  <button key={n.type} className={cls}
                    onClick={() => { onAdd(n); }}
                    type="button">
                    <span style={{ fontSize:14, lineHeight:1, flexShrink:0 }}>{n.emoji}</span>
                    <div style={{ minWidth:0 }}>
                      <p style={{ fontSize:11, fontWeight:600, color:'#eaeaf8', lineHeight:'1.2', marginBottom:1 }}>{n.label}</p>
                      <p style={{ fontSize:9, color:'#3a3a58', lineHeight:'1.2' }}>{n.desc}</p>
                    </div>
                    <Plus size={10} style={{ color:'#3a3a58', flexShrink:0, marginLeft:'auto', opacity:0.6 }} />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Collapsed: emoji-only buttons */}
      {collapsed && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'6px 0', gap:4, overflowY:'auto' }}>
          {NODE_CATALOG.flatMap(({ nodes }) =>
            nodes.map(n => (
              <button key={n.type} type="button"
                onClick={() => onAdd(n)}
                title={`Add ${n.label}: ${n.desc}`}
                style={{ fontSize:14, padding:'4px', borderRadius:6, cursor:'pointer', border:'1px solid transparent', background:'transparent', transition:'background 0.15s', display:'flex', alignItems:'center', justifyContent:'center' }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(129,140,248,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                {n.emoji}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function HintBar({ onDismiss, hasSelectedNode }) {
  const steps = [
    { num: '1', text: 'Click any node to configure it' },
    { num: '2', text: 'Add steps from the left panel' },
    { num: '3', text: 'Run to test · Toggle to schedule' },
  ];
  return (
    <div className="flex items-center gap-6 px-6 py-2 shrink-0"
      style={{ background: 'rgba(129,140,248,0.06)', borderBottom: '1px solid rgba(129,140,248,0.12)' }}>
      <div className="flex items-center gap-1 text-accent shrink-0">
        <Zap className="h-3 w-3" />
        <span className="text-[10px] font-semibold">Quick start</span>
      </div>
      <div className="flex items-center gap-4 flex-1">
        {steps.map(s => (
          <div key={s.num} className="flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white shrink-0"
              style={{ background: 'rgba(129,140,248,0.5)' }}>{s.num}</span>
            <span className="text-[11px] text-secondary">{s.text}</span>
          </div>
        ))}
      </div>
      <button onClick={onDismiss} className="text-muted hover:text-primary transition-colors cursor-pointer shrink-0">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function WorkflowEditor({ workflowId, onBack }) {
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [addAfterNodeId, setAddAfterNodeId] = useState(null); // "add after" mode
  const [dagError, setDagError] = useState(null);
  const graphInstanceRef = useRef(null);

  const fetchRuns = useCallback(async () => {
    const r = await fetch(`${BASE}/workflows/${workflowId}/runs`);
    return r.json();
  }, [workflowId]);
  const { data: runs, refresh: refreshRuns } = usePolling(fetchRuns, 3000);

  useEffect(() => {
    fetchWorkflow(workflowId).then(wf => {
      setWorkflow(wf);
      setLoading(false);
    });
  }, [workflowId]);

  const handleSave = async () => {
    setSaving(true);
    const r = await fetch(`${BASE}/workflows/${workflowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: workflow.nodes,
        edges: workflow.edges,
        name: workflow.name,
        description: workflow.description,
        trigger_type: workflow.trigger_type,
        trigger_config: workflow.trigger_config,
        guardrails: workflow.guardrails,
      }),
    });
    const updated = await r.json();
    setWorkflow(updated);
    setSaving(false);
  };

  const handleRun = async () => {
    setIsRunning(true);
    await fetch(`${BASE}/workflows/${workflowId}/run`, { method: 'POST' });
    setTimeout(() => {
      setIsRunning(false);
      refreshRuns();
    }, 2000);
  };

  const handleNodeConfigSave = (nodeId, { label, config }) => {
    setWorkflow(wf => ({
      ...wf,
      nodes: wf.nodes.map(n => n.id === nodeId ? { ...n, label, config } : n),
    }));
    setSelectedNodeId(null);
  };

  const handleToggleStatus = async () => {
    const newStatus = workflow.status === 'active' ? 'inactive' : 'active';
    const r = await fetch(`${BASE}/workflows/${workflowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const updated = await r.json();
    setWorkflow(updated);
  };

  const handleAddNode = useCallback((nodeDef) => {
    const id = `n${Date.now()}`;
    let blocked = null;
    setWorkflow(wf => {
      // Source: addAfterNodeId if set, else last node
      const sourceNode = addAfterNodeId
        ? wf.nodes.find(n => n.id === addAfterNodeId)
        : wf.nodes[wf.nodes.length - 1];

      const newNode = { id, type: nodeDef.type, label: nodeDef.label, config: {} };
      let newEdges = [];

      if (sourceNode) {
        const violation = dagViolation(wf.nodes, wf.edges, sourceNode.id, id);
        if (violation) { blocked = violation; return wf; }
        newEdges = [{ id: `e${sourceNode.id}_${id}`, source: sourceNode.id, target: id }];
      }

      // Warn about second trigger
      if (nodeDef.type.startsWith('trigger/') && wf.nodes.some(n => n.type?.startsWith('trigger/'))) {
        blocked = 'only-one-trigger';
        return wf;
      }

      return { ...wf, nodes: [...wf.nodes, newNode], edges: [...wf.edges, ...newEdges] };
    });

    if (blocked) {
      const msg = blocked === 'cycle' ? 'Cannot add: would create a cycle'
        : blocked === 'duplicate' ? 'Cannot add: edge already exists'
        : blocked === 'only-one-trigger' ? 'Only one trigger node per workflow'
        : 'Invalid connection';
      setDagError(msg);
      setTimeout(() => setDagError(null), 3000);
      return;
    }

    setAddAfterNodeId(null);
    setSelectedNodeId(id);
    setTimeout(() => {
      graphInstanceRef.current?.fitView({ padding: 0.3, duration: 400 });
    }, 80);
  }, [addAfterNodeId]);

  const handleDeleteNode = useCallback((nodeId) => {
    setWorkflow(wf => {
      const incoming = wf.edges.filter(e => e.target === nodeId);
      const outgoing = wf.edges.filter(e => e.source === nodeId);

      // Bridge edges: for each predecessor → each successor (skip if would cycle)
      const bridgeEdges = [];
      incoming.forEach(inc => {
        outgoing.forEach(out => {
          const violation = dagViolation(
            wf.nodes.filter(n => n.id !== nodeId),
            wf.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
            inc.source, out.target
          );
          if (!violation) {
            bridgeEdges.push({ id: `e${inc.source}_${out.target}`, source: inc.source, target: out.target });
          }
        });
      });

      return {
        ...wf,
        nodes: wf.nodes.filter(n => n.id !== nodeId),
        edges: [
          ...wf.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
          ...bridgeEdges,
        ],
      };
    });
    setSelectedNodeId(prev => prev === nodeId ? null : prev);
    setAddAfterNodeId(prev => prev === nodeId ? null : prev);
    setTimeout(() => {
      graphInstanceRef.current?.fitView({ padding: 0.3, duration: 300 });
    }, 60);
  }, []);

  const handleAddAfterNode = useCallback((nodeId) => {
    setAddAfterNodeId(nodeId);
    setPaletteCollapsed(false); // expand palette so user sees it
  }, []);

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="text-sm text-muted shimmer px-8 py-3 rounded-xl">Loading workflow...</div>
    </div>
  );
  if (!workflow) return <div className="text-sm text-red text-center py-16">Workflow not found</div>;

  const selectedNode = workflow.nodes.find(n => n.id === selectedNodeId);
  const latestRun = runs?.[0];
  const triggerNode = workflow.nodes.find(n => n.type?.startsWith('trigger/'));
  const schedule = triggerNode?.type === 'trigger/schedule'
    ? humanCron(triggerNode.config?.cron)
    : null;
  const isActive = workflow.status === 'active';

  return (
    <div className="h-full flex flex-col">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(129,140,248,0.1)', background: 'rgba(6,6,22,0.85)', backdropFilter: 'blur(16px)' }}>

        <button onClick={onBack}
          className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5 transition-colors cursor-pointer shrink-0"
          title="Back to workflows">
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-base">{workflow.icon}</span>
          <h1 className="text-sm font-bold text-primary truncate">{workflow.name}</h1>
          {workflow.description && (
            <span className="text-xs text-muted truncate hidden md:block">— {workflow.description}</span>
          )}
        </div>

        {/* Schedule hint */}
        {schedule && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg hidden lg:flex shrink-0"
            style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.15)' }}>
            <Clock className="h-3 w-3 text-muted" />
            <span className="text-[11px] text-secondary">{schedule}</span>
          </div>
        )}

        {/* Active toggle — clear affordance */}
        <button onClick={handleToggleStatus}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all shrink-0"
          style={isActive
            ? { background: 'rgba(52,211,153,0.15)', color: 'var(--color-green)', border: '1px solid rgba(52,211,153,0.35)', boxShadow: '0 0 12px rgba(52,211,153,0.15)' }
            : { background: 'rgba(255,255,255,0.04)', color: 'var(--color-muted)', border: '1px solid rgba(129,140,248,0.15)' }}
          title={isActive ? 'Click to deactivate (stop scheduling)' : 'Click to activate (start scheduling)'}>
          <Power className="h-3 w-3" />
          {isActive ? 'Active' : 'Inactive'}
          <span className="text-[9px] opacity-60">{isActive ? '(click to pause)' : '(click to activate)'}</span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleRun} disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--color-green)', border: '1px solid rgba(52,211,153,0.25)' }}
            onMouseEnter={e => { if (!isRunning) e.currentTarget.style.boxShadow = '0 0 20px rgba(52,211,153,0.3)'; }}
            onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
            title="Run this workflow now (test run)">
            <Play className="h-3.5 w-3.5" fill="currentColor" />
            {isRunning ? 'Running…' : 'Run now'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="btn-primary text-sm py-2"
            title="Save changes">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Hint bar ───────────────────────────────────────── */}
      {!hintDismissed && (
        <HintBar onDismiss={() => setHintDismissed(true)} />
      )}

      {/* ── Main area ──────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Node palette */}
        <NodePalette
          onAdd={handleAddNode}
          collapsed={paletteCollapsed}
          onToggle={() => setPaletteCollapsed(v => !v)}
          addAfterNodeId={addAfterNodeId}
          addAfterNodeLabel={workflow.nodes.find(n => n.id === addAfterNodeId)?.label}
          onCancelAddAfter={() => setAddAfterNodeId(null)}
        />

        {/* Graph canvas */}
        <div className="flex-1 relative" style={{ background: 'var(--color-bg)' }}>
          <WorkflowGraph
            nodes={workflow.nodes}
            edges={workflow.edges}
            runResults={latestRun?.node_results}
            onNodeClick={setSelectedNodeId}
            selectedNodeId={selectedNodeId}
            isRunning={isRunning}
            onReady={inst => { graphInstanceRef.current = inst; }}
            onDelete={handleDeleteNode}
            onAddAfter={handleAddAfterNode}
          />

            {/* DAG error toast */}
          {dagError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none fade-in">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171', backdropFilter: 'blur(8px)' }}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {dagError}
              </div>
            </div>
          )}

            {/* Canvas hint */}
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none">
            {selectedNodeId ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs fade-in"
                style={{ background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.3)', color: 'var(--color-accent)' }}>
                <span>⚙</span>
                <span className="font-medium">Editing: <strong>{workflow.nodes.find(n => n.id === selectedNodeId)?.label || 'Node'}</strong> — configure in the panel →</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs text-muted fade-in"
                style={{ background: 'rgba(6,6,22,0.9)', border: '1px solid rgba(129,140,248,0.15)' }}>
                <span>👆</span>
                <span>Click any node to configure it</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>Add steps from the left panel</span>
              </div>
            )}
          </div>

        </div>

        {/* Config panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onSave={handleNodeConfigSave}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      {/* ── Run history ────────────────────────────────────── */}
      <div className="px-6 py-3 shrink-0"
        style={{ borderTop: '1px solid rgba(129,140,248,0.1)', background: 'rgba(6,6,22,0.7)', maxHeight: 140, overflowY: 'auto' }}>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[10px] text-muted uppercase tracking-wide">Run History</p>
          {runs?.length > 0 && (
            <span className="text-[10px] text-muted">({runs.length} runs)</span>
          )}
        </div>
        {!runs?.length ? (
          <div className="flex items-center gap-2 text-xs text-muted py-1">
            <Play className="h-3 w-3 text-muted" />
            <span>No runs yet — click <strong className="text-secondary">Run now</strong> to test this workflow</span>
          </div>
        ) : (
          <div className="space-y-1">
            {runs.slice(0, 8).map(run => {
              const st = RUN_STATUS_ICON[run.status] || RUN_STATUS_ICON.running;
              const Icon = st.icon;
              return (
                <div key={run.id} className="flex items-center gap-3 py-1 text-xs">
                  <Icon className={`h-3.5 w-3.5 ${st.color} shrink-0`} />
                  <span className="text-secondary">{relativeTime(run.started_at)}</span>
                  {run.total_cost > 0 && <span className="text-green">{fmt$$(run.total_cost)}</span>}
                  <span className="text-muted">{run.total_steps} steps</span>
                  {run.error && <span className="text-red truncate flex-1">{run.error}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
