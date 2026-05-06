"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";
import { statusColor, weightColor, nodeIcon, throughputColor } from "./types/styles";
import DeploymentsPanel from "./lanes/DeploymentPanel";
import LogsPanel from "./lanes/LogsPanel";
import { CostPanel } from "./lanes/CostPanel";
import { TestingPanel } from "./lanes/TestingPanel";
import { INITIAL_NODES, INITIAL_EDGES } from "./content/mockdata";
import { NodeList } from "./hooks/InfraNodes";
import { TYPE_COLORS, TYPE_LABELS, TYPE_MAP } from "./types/type";
import { Stat } from "./styles/styles";
import { NodeDrawer } from "./map/nodedrawer";



// ── Types & Constants ─────────────────────────────────────────────────────────

const NAV_TABS = ["MAP", "DEPLOYMENTS", "LOGS", "TESTING", "COST"];
const NODE_FILTERS = ["ALL", "LB", "APP", "REDIS", "DB"];



// ── Sidebar node list ─────────────────────────────────────────────────────────


// ── Main Component ────────────────────────────────────────────────────────────

export default function InfraDashboard() {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [edges] = useState(INITIAL_EDGES);
  const [navTab, setNavTab] = useState("MAP");
  const [nodeFilter, setNodeFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [dims, setDims] = useState({ w: 900, h: 480 });
  const containerRef = useRef(null);
  const tickRef = useRef(0);
  const svgRef = useRef(null);

  const [worldData, setWorldData] = useState(null);
    useEffect(() => {
      fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
        .then(r => r.json())
        .then(setWorldData);
    }, []);

  // Resize
  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setDims({ w: e.contentRect.width, h: e.contentRect.height });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Live sim
  useEffect(() => {
    const iv = setInterval(() => {
      tickRef.current++;
      setNodes(prev => prev.map(n => {
        const jitter = (Math.random() - 0.5) * 0.04;
        const newWeight = Math.max(0.01, Math.min(0.99, n.weight + jitter));
        const newConns = Math.max(0, Math.min(n.maxConnections, n.connections + Math.floor((Math.random() - 0.48) * 80)));
        let status = n.status;
        if (n.status === "spawning" && newConns > 500) status = "healthy";
        else if (n.status !== "spawning" && n.status !== "draining") {
          if (newWeight > 0.9) status = "critical";
          else if (newWeight > 0.75) status = "warning";
          else status = "healthy";
        }
        return { ...n, weight: newWeight, connections: newConns, status, p95: Math.max(5, n.p95 + Math.floor((Math.random() - 0.5) * 6)), p99: Math.max(8, n.p99 + Math.floor((Math.random() - 0.5) * 10)) };
      }));
    }, 1200);
    return () => clearInterval(iv);
  }, []);


  const visibleNodes = nodeFilter === "ALL" ? nodes : nodes.filter(n => n.type === TYPE_MAP[nodeFilter]);

  const visibleEdges = edges.filter(e => {
    const fn = nodes.find(x => x.id === e.from);
    const tn = nodes.find(x => x.id === e.to);
    if (!fn || !tn) return false;
    const fv = nodeFilter === "ALL" || fn.type === TYPE_MAP[nodeFilter];
    const tv = nodeFilter === "ALL" || tn.type === TYPE_MAP[nodeFilter];
    return fv && tv;
  });

  const totalConns = nodes.reduce((a, n) => a + n.connections, 0);
  const criticalCount = nodes.filter(n => n.status === "critical").length;
  const warningCount = nodes.filter(n => n.status === "warning").length;
  const spawnCount = nodes.filter(n => n.status === "spawning").length;

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", background: "#080c12", color: "#c8d4e0", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; height: 3px; } ::-webkit-scrollbar-track { background: #0d1520; } ::-webkit-scrollbar-thumb { background: #1e3050; border-radius: 2px; }
        .node-dot { cursor: pointer; }
        .node-dot:hover { filter: brightness(1.4); }
        .edge-hit { cursor: pointer; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes spawn-ring { 0% { r:8; opacity:0.8; } 100% { r:28; opacity:0; } }
        @keyframes flow { 0% { stroke-dashoffset: 40; } 100% { stroke-dashoffset: 0; } }
        .spawning-ring { animation: spawn-ring 1.4s ease-out infinite; }
        .critical-pulse { animation: pulse 0.8s ease-in-out infinite; }
        .flow-line { animation: flow 1.2s linear infinite; }
        @keyframes slideup { from { transform: translateY(20px); opacity:0; } to { transform: translateY(0); opacity:1; } }
        @keyframes fadein { from { opacity:0; } to { opacity:1; } }
        .nav-tab { cursor: pointer; background: none; border: none; font-family: inherit; font-size: 11px; letter-spacing: 0.1em; padding: 10px 16px; transition: all 0.15s; border-bottom: 2px solid transparent; }
        .nav-tab:hover { color: #c8d4e0; }
        .filter-btn { cursor: pointer; background: transparent; border: 1px solid #0e2033; font-family: inherit; font-size: 10px; letter-spacing: 0.08em; padding: 3px 10px; border-radius: 2px; transition: all 0.15s; }
        .filter-btn:hover { border-color: #1e3050; }
      `}</style>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: "1px solid #0e2033", background: "#080c12", zIndex: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, letterSpacing: "0.12em", color: "#00e5a0", paddingRight: 20 }}>NOVA<span style={{ color: "#4fc3f7" }}>MAP</span></div>
          {NAV_TABS.map(tab => (
            <button key={tab} className="nav-tab" onClick={() => setNavTab(tab)}
              style={{ color: navTab === tab ? "#c8d4e0" : "#4a6080", borderBottomColor: navTab === tab ? "#00e5a0" : "transparent" }}>
              {tab}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 20, fontSize: 11 }}>
          <Stat label="NODES" value={nodes.length.toString()} />
          <Stat label="CONNS" value={totalConns.toLocaleString()} />
          <Stat label="CRITICAL" value={criticalCount.toString()} color={criticalCount > 0 ? "#ff3b5c" : "#4a6080"} />
          <Stat label="WARN" value={warningCount.toString()} color={warningCount > 0 ? "#f5a623" : "#4a6080"} />
          <Stat label="SPAWN" value={spawnCount.toString()} color={spawnCount > 0 ? "#4fc3f7" : "#4a6080"} />
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{ width: 220, background: "#060a10", borderRight: "1px solid #0e2033", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          {/* Node filter tabs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "10px 10px 8px", borderBottom: "1px solid #0e2033", flexShrink: 0 }}>
            {NODE_FILTERS.map(f => {
              const color = f === "ALL" ? "#c8d4e0" : TYPE_COLORS[TYPE_MAP[f]];
              const active = nodeFilter === f;
              return (
                <button key={f} className="filter-btn" onClick={() => setNodeFilter(f)}
                  style={{ color: active ? color : "#4a6080", borderColor: active ? `${color}50` : "#0e2033", background: active ? `${color}10` : "transparent" }}>
                  {f}
                </button>
              );
            })}
          </div>
          <NodeList nodes={nodes} selected={selected} onSelect={n => setSelected(selected?.id === n.id ? null : n)} filter={nodeFilter} />
          {/* Bottom ping status */}
          <div style={{ padding: "8px 12px", borderTop: "1px solid #0e2033", fontSize: 9, color: "#2a3d50", display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
            <span>LIVE · 1.2s</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Main panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

          {navTab === "MAP" && (
            <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              <svg ref={svgRef} width="100%" height="100%" style={{ display: "block", position: "absolute", inset: 0 }}>
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#0d1a26" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />

                {/* World map — rendered once worldData + dims are ready */}
                {worldData && dims.w > 0 && (() => {
                  const proj = d3.geoNaturalEarth1()
                    .scale(dims.w / 6.3)
                    .translate([dims.w / 2, dims.h / 2.1]);
                    const pathGen = d3.geoPath().projection(proj);
                    const land = topojson.feature(worldData, worldData.objects.land);
                    const borders = topojson.mesh(worldData, worldData.objects.countries, (a, b) => a !== b);
                    const projectLatLng = (lat: number, lng: number) => proj([lng, lat]);

                    const getPos = (id: string) => {
                      const n = nodes.find(x => x.id === id);
                      return n ? projectLatLng(n.lat, n.lng) : null;
                    };

                  return (
      <>
        {/* Land */}
        <path d={pathGen(land)} fill="#0d1e2f" stroke="#1a3550" strokeWidth={0.5} />
        {/* Borders */}
        <path d={pathGen(borders)} fill="none" stroke="#0e2033" strokeWidth={0.3} />

        {/* Edges */}
        {visibleEdges.map(edge => {
          const fp = getPos(edge.from);
          const tp = getPos(edge.to);
          if (!fp || !tp) return null;
          const [x1, y1] = fp;
          const [x2, y2] = tp;
          const edgeId = `${edge.from}-${edge.to}`;
          const isHovered = hoveredEdge === edgeId;
          const strokeW = 0.8 + edge.throughput * 2.5;
          const color = throughputColor(edge.throughput);
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 30;
          const d = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
          return (
            <g key={edgeId}>
              <path d={d} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredEdge(edgeId)} onMouseLeave={() => setHoveredEdge(null)} />
              <path d={d} fill="none" stroke={color} strokeWidth={strokeW} opacity={0.3} />
              <path d={d} fill="none" stroke={color} strokeWidth={strokeW + 0.5}
                strokeDasharray="8 12" className="flow-line" opacity={isHovered ? 0.95 : 0.6} />
              {isHovered && (
                <text x={mx} y={my - 6} textAnchor="middle" fontSize="9" fill="#c8d4e0" fontFamily="IBM Plex Mono">
                  {Math.round(edge.throughput * 100)}%
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {visibleNodes.map(node => {
          const pos = projectLatLng(node.lat, node.lng);
          if (!pos) return null;
          const [x, y] = pos;
          const color = statusColor(node.status);
          const r = node.type === "loadbalancer" ? 9 : node.type === "database" ? 7 : 8;
          const isSelected = selected?.id === node.id;
          const circ = 2 * Math.PI * (r + 3);
          return (
            <g key={node.id} onClick={() => setSelected(isSelected ? null : node)} style={{ cursor: "pointer" }}>
              {node.status === "spawning" && (
                <circle cx={x} cy={y} r={r} fill="none" stroke="#4fc3f7" strokeWidth="1.5" className="spawning-ring" />
              )}
              {node.status === "critical" && (
                <circle cx={x} cy={y} r={r + 6} fill="#ff3b5c" opacity={0.15} className="critical-pulse" />
              )}
              {isSelected && (
                <circle cx={x} cy={y} r={r + 10} fill="none" stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity={0.7} />
              )}
              <circle cx={x} cy={y} r={r + 8} fill={color} opacity={0.07} />
              <circle cx={x} cy={y} r={r} fill="#0d1520" stroke={color} strokeWidth={isSelected ? 2 : 1.5} />
              <circle cx={x} cy={y} r={r + 3} fill="none"
                stroke={weightColor(node.weight)} strokeWidth="1.5"
                strokeDasharray={`${node.weight * circ} 999`}
                opacity={0.55} transform={`rotate(-90 ${x} ${y})`} />
              <text x={x} y={y + 3.5} textAnchor="middle" fontSize="8" fill={color} style={{ userSelect: "none" }}>
                {nodeIcon(node.type)}
              </text>
              <text x={x} y={y + r + 12} textAnchor="middle" fontSize="8" fill="#4a6080" fontFamily="IBM Plex Mono" style={{ userSelect: "none" }}>
                {node.label}
              </text>
            </g>
          );
        })}
      </>
    );
  })()}
</svg>

              {/* Legend */}
              <div style={{ position: "absolute", bottom: selected ? "43vh" : 12, left: 12, display: "flex", gap: 14, fontSize: 9, color: "#4a6080", letterSpacing: "0.08em", transition: "bottom 0.22s ease" }}>
                {["healthy", "warning", "critical", "spawning"].map(s => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor(s) }} />
                    {s.toUpperCase()}
                  </div>
                ))}
              </div>

              {/* Node drawer */}
              {selected && <NodeDrawer node={selected} edges={edges} nodes={nodes} onClose={() => setSelected(null)} />}
            </div>
          )}

          {navTab === "DEPLOYMENTS" && <DeploymentsPanel />}
          {navTab === "LOGS" && <LogsPanel />}
          {navTab === "TESTING" && <TestingPanel />}
          {navTab === "COST" && <CostPanel />}
        </div>
      </div>
    </div>
  );
}