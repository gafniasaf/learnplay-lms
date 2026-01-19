
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function AdminSystemHealth() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/admin/console" className="btn-ghost" onClick={() => nav("/admin/console")} type="button">← Back</button>
    <h1>System Health</h1>
    <button data-cta-id="refresh" data-action="ui" className="btn-ghost" onClick={() => toast.info("Action: refresh")} type="button">↻ Refresh</button>
  </header>
  
  <div className="container">
    <div className="status-banner healthy">
      <span className="status-icon">✅</span>
      <div className="status-text">
        <div className="status-title">All Systems Operational</div>
        <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>Last checked 30 seconds ago</div>
      </div>
      <span className="badge badge-success">99.9% Uptime</span>
    </div>
    
    <div className="service-grid">
      <div className="service-card">
        <div className="service-header">
          <span className="service-dot up"></span>
          <span className="service-name">Supabase Database</span>
        </div>
        <div className="service-stat">
          <span>Response Time</span>
          <span style={{ "fontWeight": "500" }}>45ms</span>
        </div>
        <div className="service-stat">
          <span>Connections</span>
          <span style={{ "fontWeight": "500" }}>12 / 100</span>
        </div>
        <div className="service-stat">
          <span>Last Error</span>
          <span style={{ "color": "var(--color-success)" }}>None</span>
        </div>
      </div>
      
      <div className="service-card">
        <div className="service-header">
          <span className="service-dot up"></span>
          <span className="service-name">Edge Functions</span>
        </div>
        <div className="service-stat">
          <span>Response Time</span>
          <span style={{ "fontWeight": "500" }}>120ms</span>
        </div>
        <div className="service-stat">
          <span>Invocations (24h)</span>
          <span style={{ "fontWeight": "500" }}>1,247</span>
        </div>
        <div className="service-stat">
          <span>Error Rate</span>
          <span style={{ "color": "var(--color-success)" }}>0.2%</span>
        </div>
      </div>
      
      <div className="service-card">
        <div className="service-header">
          <span className="service-dot up"></span>
          <span className="service-name">MCP Server</span>
        </div>
        <div className="service-stat">
          <span>Status</span>
          <span style={{ "fontWeight": "500", "color": "var(--color-success)" }}>Running</span>
        </div>
        <div className="service-stat">
          <span>Port</span>
          <span style={{ "fontWeight": "500" }}>4000</span>
        </div>
        <div className="service-stat">
          <span>Uptime</span>
          <span style={{ "fontWeight": "500" }}>4h 32m</span>
        </div>
      </div>
      
      <div className="service-card">
        <div className="service-header">
          <span className="service-dot up"></span>
          <span className="service-name">AI Services</span>
        </div>
        <div className="service-stat">
          <span>OpenAI</span>
          <span style={{ "color": "var(--color-success)" }}>✓ Connected</span>
        </div>
        <div className="service-stat">
          <span>Anthropic</span>
          <span style={{ "color": "var(--color-success)" }}>✓ Connected</span>
        </div>
        <div className="service-stat">
          <span>Jobs Processed (24h)</span>
          <span style={{ "fontWeight": "500" }}>87</span>
        </div>
      </div>
    </div>
    
    <div style={{ "marginBottom": "1rem" }} className="metric-card">
      <div className="metric-header">
        <h3>30-Day Uptime</h3>
        <span style={{ "fontWeight": "600", "color": "var(--color-success)" }}>99.9%</span>
      </div>
      <div className="uptime-bar">
        <div title="Dec 1 - OK" className="uptime-segment up"></div>
        <div title="Dec 2 - OK" className="uptime-segment up"></div>
        <div title="Dec 3 - OK" className="uptime-segment up"></div>
        <div title="Dec 4 - Degraded (2h)" className="uptime-segment degraded"></div>
        <div title="Dec 5 - OK" className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
        <div className="uptime-segment up"></div>
      </div>
      <div style={{ "display": "flex", "justifyContent": "space-between", "marginTop": "0.5rem", "fontSize": "0.75rem", "color": "var(--color-text-muted)" }}>
        <span>30 days ago</span>
        <span>Today</span>
      </div>
    </div>
    
    <div className="metric-card">
      <h3 style={{ "marginBottom": "1rem" }}>Recent Incidents</h3>
      <div style={{ "padding": "1rem", "background": "var(--color-bg)", "borderRadius": "8px", "marginBottom": "0.5rem" }}>
        <div style={{ "display": "flex", "justifyContent": "space-between", "marginBottom": "0.5rem" }}>
          <span style={{ "fontWeight": "500" }}>Edge Function Latency Spike</span>
          <span className="badge badge-warning">Resolved</span>
        </div>
        <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>
          Dec 4, 2:15 PM - 4:15 PM • Duration: 2 hours
        </div>
      </div>
      <p style={{ "textAlign": "center", "color": "var(--color-text-muted)", "padding": "1rem" }}>No other incidents in the last 30 days</p>
    </div>
  </div>

    </div>
  );
}
