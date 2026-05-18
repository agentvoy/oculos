import { useCallback, useEffect, useRef, useState } from 'react';
import { Network } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { usePolling } from '../../hooks';
import { fmt$$ } from '../../utils';

const BASE = '/api';

async function fetchTopology() {
  const r = await fetch(`${BASE}/topology`);
  return r.json();
}

const STATUS_COLOR = {
  healthy:  '#22c55e',
  degraded: '#f59e0b',
  offline:  '#ef4444',
  unknown:  '#6366f1',
};

function useForceLayout(nodes, edges, width, height) {
  const [positions, setPositions] = useState({});
  const posRef = useRef({});
  const velRef = useRef({});

  useEffect(() => {
    if (!nodes?.length) return;

    // Init positions in circle
    const r = Math.min(width, height) * 0.3;
    const cx = width / 2, cy = height / 2;
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI;
      if (!posRef.current[n.id]) {
        posRef.current[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
        velRef.current[n.id] = { x: 0, y: 0 };
      }
    });

    let frame;
    const tick = () => {
      const pos = posRef.current;
      const vel = velRef.current;

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = pos[b.id].x - pos[a.id].x;
          const dy = pos[b.id].y - pos[a.id].y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 3000 / (d * d);
          vel[a.id].x -= (dx / d) * force;
          vel[a.id].y -= (dy / d) * force;
          vel[b.id].x += (dx / d) * force;
          vel[b.id].y += (dy / d) * force;
        }
      }

      // Attraction along edges
      for (const e of edges || []) {
        const a = pos[e.source], b = pos[e.target];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (d - 150) * 0.05;
        vel[e.source].x += (dx / d) * force;
        vel[e.source].y += (dy / d) * force;
        vel[e.target].x -= (dx / d) * force;
        vel[e.target].y -= (dy / d) * force;
      }

      // Center gravity
      for (const n of nodes) {
        vel[n.id].x += (cx - pos[n.id].x) * 0.01;
        vel[n.id].y += (cy - pos[n.id].y) * 0.01;
      }

      // Integrate + dampen
      for (const n of nodes) {
        vel[n.id].x *= 0.8;
        vel[n.id].y *= 0.8;
        pos[n.id].x += vel[n.id].x;
        pos[n.id].y += vel[n.id].y;
        // Clamp to bounds
        pos[n.id].x = Math.max(50, Math.min(width - 50, pos[n.id].x));
        pos[n.id].y = Math.max(50, Math.min(height - 50, pos[n.id].y));
      }

      setPositions({ ...pos });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    const stop = setTimeout(() => cancelAnimationFrame(frame), 4000);
    return () => { cancelAnimationFrame(frame); clearTimeout(stop); };
  }, [nodes?.length, edges?.length, width, height]);

  return positions;
}

export default function TopologyPage() {
  const fetchTopo = useCallback(fetchTopology, []);
  const { data: topo, loading } = usePolling(fetchTopo, 5000);
  const [hovered, setHovered] = useState(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: Math.max(400, e.contentRect.width * 0.55) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const positions = useForceLayout(topo?.nodes, topo?.edges, dims.w, dims.h);
  const nodes = topo?.nodes || [];
  const edges = topo?.edges || [];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-primary">Agent Topology</h1>
        <p className="text-sm text-secondary mt-0.5">
          Auto-discovered from shared trace sessions. Edges appear when agents collaborate on the same task.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted text-center py-16">Loading...</div>
      ) : nodes.length === 0 ? (
        <EmptyState icon={Network} title="No agents yet" desc="Register agents and run tasks to see the topology graph." />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden" ref={containerRef}>
          <svg width={dims.w} height={dims.h} className="block">
            {/* Defs: arrow marker + glow */}
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#2e2e42" />
              </marker>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Edges */}
            {edges.map((e, i) => {
              const a = positions[e.source], b = positions[e.target];
              if (!a || !b) return null;
              return (
                <line key={i}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="#2e2e42" strokeWidth={2}
                  markerEnd="url(#arrow)"
                  className="transition-all"
                />
              );
            })}

            {/* Nodes */}
            {nodes.map(n => {
              const pos = positions[n.id];
              if (!pos) return null;
              const color = STATUS_COLOR[n.status] || STATUS_COLOR.unknown;
              const r = Math.max(28, Math.min(44, 20 + (n.total_invocations || 0) * 2));
              const isHov = hovered === n.id;

              return (
                <g key={n.id} transform={`translate(${pos.x},${pos.y})`}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: 'pointer' }}>
                  {/* Glow ring for hovered */}
                  {isHov && (
                    <circle r={r + 10} fill={color} fillOpacity={0.1} filter="url(#glow)" />
                  )}
                  {/* Status ring */}
                  <circle r={r + 4} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.5} />
                  {/* Main circle */}
                  <circle r={r} fill="#12121a" stroke={color} strokeWidth={isHov ? 2.5 : 1.5} />
                  {/* Label */}
                  <text textAnchor="middle" dy="0.35em"
                    fill="#e2e2f0" fontSize={10} fontWeight={600} fontFamily="Inter, sans-serif">
                    {n.name.slice(0, 10)}
                  </text>

                  {/* Tooltip on hover */}
                  {isHov && (
                    <g transform={`translate(${r + 8}, ${-r - 8})`}>
                      <rect x={0} y={-28} width={140} height={58} rx={8}
                        fill="#0c0c14" stroke="#2e2e42" strokeWidth={1} />
                      <text x={8} y={-12} fill="#e2e2f0" fontSize={11} fontWeight={700} fontFamily="Inter, sans-serif">
                        {n.name}
                      </text>
                      <text x={8} y={4} fill="#8282a0" fontSize={10} fontFamily="Inter, sans-serif">
                        {n.model || n.framework || 'custom'}
                      </text>
                      <text x={8} y={18} fill="#22c55e" fontSize={10} fontFamily="Inter, sans-serif">
                        {fmt$$(n.total_cost)} · {n.total_invocations} calls
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="border-t border-border px-5 py-3 flex items-center gap-6 flex-wrap">
            {Object.entries(STATUS_COLOR).map(([s, c]) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c }} />
                <span className="text-xs text-muted capitalize">{s}</span>
              </div>
            ))}
            <span className="text-xs text-muted ml-auto">Node size = invocation count</span>
          </div>
        </div>
      )}
    </div>
  );
}
