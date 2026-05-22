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
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100 });

  workflowNodes.forEach(n => {
    g.setNode(n.id, { width: 160, height: 70 });
  });
  workflowEdges.forEach(e => {
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  return workflowNodes.map(n => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: getNodeCategory(n.type),
      position: { x: pos.x - 80, y: pos.y - 35 },
      data: {
        label: n.label || n.type.split('/')[1],
        type: n.type,
        config: n.config || {},
      },
    };
  });
}

export default function WorkflowGraph({ nodes: wfNodes, edges: wfEdges, runResults, onNodeClick, isRunning }) {
  const rfNodes = useMemo(() => {
    const laid = layoutNodes(wfNodes || [], wfEdges || []);
    return laid.map(n => ({
      ...n,
      data: {
        ...n.data,
        isRunning: isRunning && !runResults,
        runStatus: runResults?.[n.id]?.status,
        runCost: runResults?.[n.id]?.cost,
      },
    }));
  }, [wfNodes, wfEdges, runResults, isRunning]);

  const rfEdges = useMemo(() =>
    (wfEdges || []).map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: isRunning,
      style: { stroke: '#2e2e42', strokeWidth: 2 },
    })),
    [wfEdges, isRunning]
  );

  const [nodes, , onNodesChange] = useNodesState(rfNodes);
  const [edges, , onEdgesChange] = useEdgesState(rfEdges);

  const handleNodeClick = useCallback((_, node) => {
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  return (
    <div className="h-full w-full" style={{ minHeight: 300 }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e1e2e" gap={20} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-card !border-border !rounded-xl !shadow-none [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-muted [&>button:hover]:!text-primary"
        />
      </ReactFlow>
    </div>
  );
}
