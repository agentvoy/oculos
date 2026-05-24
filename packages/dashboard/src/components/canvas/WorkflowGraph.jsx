import { useMemo, useCallback } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';

import TriggerNode from './nodes/TriggerNode';
import ToolNode from './nodes/ToolNode';
import AINode from './nodes/AINode';
import LogicNode from './nodes/LogicNode';

const nodeTypes = {
  trigger: TriggerNode,
  tool: ToolNode,
  ai: AINode,
  logic: LogicNode,
};

function getNodeCategory(type) {
  if (type.startsWith('trigger/')) return 'trigger';
  if (type.startsWith('tool/'))    return 'tool';
  if (type.startsWith('ai/'))      return 'ai';
  if (type.startsWith('logic/'))   return 'logic';
  return 'tool';
}

function layoutNodes(workflowNodes, workflowEdges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 120 });

  workflowNodes.forEach(n => {
    g.setNode(n.id, { width: 170, height: 70 });
  });
  workflowEdges.forEach(e => {
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  return workflowNodes.map((n, i) => {
    const pos = g.node(n.id);
    // Fallback position if dagre can't place (e.g. disconnected node)
    const x = pos && isFinite(pos.x) ? pos.x - 85 : 50 + i * 200;
    const y = pos && isFinite(pos.y) ? pos.y - 35 : 120;
    return {
      id: n.id,
      type: getNodeCategory(n.type),
      position: { x, y },
      data: {
        label: n.label || n.type.split('/')[1],
        type: n.type,
        config: n.config || {},
      },
    };
  });
}

export default function WorkflowGraph({ nodes: wfNodes, edges: wfEdges, runResults, onNodeClick, selectedNodeId, isRunning, onReady, onDelete, onAddAfter }) {
  const rfNodes = useMemo(() => {
    const laid = layoutNodes(wfNodes || [], wfEdges || []);
    return laid.map(n => ({
      ...n,
      data: {
        ...n.data,
        isRunning: isRunning && !runResults,
        runStatus: runResults?.[n.id]?.status,
        runCost: runResults?.[n.id]?.cost,
        isSelected: n.id === selectedNodeId,
        onDelete,
        onAddAfter,
      },
    }));
  }, [wfNodes, wfEdges, runResults, isRunning, selectedNodeId, onDelete, onAddAfter]);

  const rfEdges = useMemo(() =>
    (wfEdges || []).map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: isRunning,
      style: { stroke: 'rgba(129,140,248,0.35)', strokeWidth: 2 },
      markerEnd: { type: 'arrowclosed', color: 'rgba(129,140,248,0.5)', width: 16, height: 16 },
    })),
    [wfEdges, isRunning]
  );

  const handleNodeClick = useCallback((_, node) => {
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  const handleInit = useCallback((instance) => {
    onReady?.(instance);
  }, [onReady]);

  return (
    <div className="h-full w-full" style={{ minHeight: 300 }}>
      <style>{`
        .react-flow__node { cursor: pointer; }
        .react-flow__node:hover .node-inner { box-shadow: 0 0 0 2px rgba(129,140,248,0.4), 0 8px 24px rgba(129,140,248,0.15) !important; }
        .react-flow__pane { cursor: default; }
        .react-flow__controls { background: rgba(6,6,22,0.85) !important; border: 1px solid rgba(129,140,248,0.15) !important; border-radius: 12px !important; backdrop-filter: blur(12px); }
        .react-flow__controls-button { background: transparent !important; border: none !important; border-bottom: 1px solid rgba(129,140,248,0.1) !important; color: #7878a8 !important; }
        .react-flow__controls-button:hover { color: #eaeaf8 !important; background: rgba(129,140,248,0.08) !important; }
        .react-flow__controls-button:last-child { border-bottom: none !important; }
        .react-flow__edge-path { transition: stroke 0.2s; }
      `}</style>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onInit={handleInit}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.35 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent' }}
      >
        <Background color="rgba(129,140,248,0.1)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
