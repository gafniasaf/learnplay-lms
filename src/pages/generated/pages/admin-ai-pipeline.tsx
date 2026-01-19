
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function AdminAiPipeline() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/admin/console" className="btn-ghost" onClick={() => nav("/admin/console")} type="button">← Back</button>
    <h1>AI Pipeline</h1>
    <button data-cta-id="new-job" data-action="navigate" data-target="/admin/ai-pipeline/new" className="btn-ai" onClick={() => nav("/admin/ai-pipeline/new")} type="button">
      ✨ New Job
    </button>
  </header>
  
  <div style={{ "maxWidth": "none", "padding": "1rem" }} className="container">
    <div className="pipeline-layout">
      
      <div className="panel">
        <div className="panel-header">Job Queue</div>
        
        <div className="job-card active">
          <div className="job-type">ai_course_generate</div>
          <div className="job-title">Generate Math Course</div>
          <div className="job-meta">
            <span style={{ "fontSize": "0.625rem" }} className="badge badge-info">Running</span>
            • Started 2m ago
          </div>
        </div>
        
        <div className="job-card">
          <div className="job-type">guard_course</div>
          <div className="job-title">Validate Science Course</div>
          <div className="job-meta">
            <span style={{ "fontSize": "0.625rem" }} className="badge badge-warning">Queued</span>
          </div>
        </div>
        
        <div className="job-card">
          <div className="job-type">ai_course_generate</div>
          <div className="job-title">Generate Reading Course</div>
          <div className="job-meta">
            <span style={{ "fontSize": "0.625rem" }} className="badge badge-success">Completed</span>
            • 15m ago
          </div>
        </div>
        
        <div className="job-card">
          <div className="job-type">draft_assignment_plan</div>
          <div className="job-title">Draft Week 10 Assignments</div>
          <div className="job-meta">
            <span style={{ "fontSize": "0.625rem" }} className="badge badge-success">Completed</span>
            • 1h ago
          </div>
        </div>
      </div>
      
      
      <div className="panel main-canvas">
        <div className="canvas-tabs">
          <button className="canvas-tab active">Overview</button>
          <button className="canvas-tab">Prompts</button>
          <button className="canvas-tab">Output</button>
          <button className="canvas-tab">Logs</button>
        </div>
        
        <div className="canvas-content">
          <h3 style={{ "marginBottom": "1rem" }}>Generate Math Course</h3>
          
          <div className="step-item">
            <div className="step-icon done">✓</div>
            <div style={{ "flex": "1" }}>
              <div style={{ "fontWeight": "500" }}>Initialize Course Structure</div>
              <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>Created base JSON schema</div>
            </div>
            <span style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>2.3s</span>
          </div>
          
          <div className="step-item">
            <div className="step-icon done">✓</div>
            <div style={{ "flex": "1" }}>
              <div style={{ "fontWeight": "500" }}>Generate Section Outlines</div>
              <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>5 sections created</div>
            </div>
            <span style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>8.1s</span>
          </div>
          
          <div className="step-item">
            <div className="step-icon running">⟳</div>
            <div style={{ "flex": "1" }}>
              <div style={{ "fontWeight": "500" }}>Generate Questions</div>
              <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>Processing section 3 of 5...</div>
            </div>
            <span style={{ "fontSize": "0.875rem", "color": "var(--color-info)" }}>Running...</span>
          </div>
          
          <div className="step-item">
            <div className="step-icon pending">4</div>
            <div style={{ "flex": "1" }}>
              <div style={{ "fontWeight": "500" }}>Generate Variants</div>
              <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>Waiting...</div>
            </div>
          </div>
          
          <div className="step-item">
            <div className="step-icon pending">5</div>
            <div style={{ "flex": "1" }}>
              <div style={{ "fontWeight": "500" }}>Validate & Save</div>
              <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>Waiting...</div>
            </div>
          </div>
          
          <h4 style={{ "margin": "1.5rem 0 1rem" }}>Recent Logs</h4>
          <div style={{ "background": "#1e293b", "color": "#e2e8f0", "padding": "1rem", "borderRadius": "8px", "fontFamily": "monospace", "fontSize": "0.875rem" }}>
            <div className="log-line"><span className="log-time">14:32:15</span><span className="log-info">[INFO]</span> Starting section 3: Fractions</div>
            <div className="log-line"><span className="log-time">14:32:16</span><span className="log-info">[INFO]</span> Generating 10 questions...</div>
            <div className="log-line"><span className="log-time">14:32:18</span><span className="log-success">[SUCCESS]</span> Question 1 generated</div>
            <div className="log-line"><span className="log-time">14:32:19</span><span className="log-success">[SUCCESS]</span> Question 2 generated</div>
            <div className="log-line"><span className="log-time">14:32:20</span><span className="log-info">[INFO]</span> Processing question 3...</div>
          </div>
        </div>
      </div>
      
      
      <div className="panel">
        <div className="panel-header">Job Inspector</div>
        
        <div className="inspector-section">
          <div className="inspector-label">Job ID</div>
          <div style={{ "fontFamily": "monospace" }}>job_abc123xyz</div>
        </div>
        
        <div className="inspector-section">
          <div className="inspector-label">Type</div>
          <div>ai_course_generate</div>
        </div>
        
        <div className="inspector-section">
          <div className="inspector-label">Status</div>
          <span className="badge badge-info">Running</span>
        </div>
        
        <div className="inspector-section">
          <div className="inspector-label">Started</div>
          <div>Dec 5, 2024 2:30 PM</div>
        </div>
        
        <div className="inspector-section">
          <div className="inspector-label">Duration</div>
          <div>2m 15s</div>
        </div>
        
        <div className="inspector-section">
          <div className="inspector-label">Target Entity</div>
          <div>CourseBlueprint: "5th Grade Fractions"</div>
        </div>
        
        <div className="inspector-section">
          <div className="inspector-label">Input Parameters</div>
          <div style={{ "background": "var(--color-bg)", "padding": "0.75rem", "borderRadius": "8px", "fontFamily": "monospace", "fontSize": "0.75rem" }}>
            &#123;<br />
            &nbsp;&nbsp;"subject": "Math",<br />
            &nbsp;&nbsp;"difficulty": "elementary",<br />
            &nbsp;&nbsp;"questionCount": 50<br />
            &#125;
          </div>
        </div>
        
        <div style={{ "display": "flex", "gap": "0.5rem", "marginTop": "1rem" }}>
          <button style={{ "flex": "1" }} data-cta-id="cancel-job" data-action="enqueueJob" data-job-type="cancel_job" className="btn-secondary" onClick={async () => {
            try {
              await mcp.enqueueJob("cancel_job", { planBlueprintId: id });
              toast.success("Job enqueued: cancel-job");
            } catch (e) {
              toast.error("Job failed: cancel-job");
            }
          }} type="button">Cancel</button>
          <button style={{ "flex": "1" }} data-cta-id="view-output" data-action="navigate" data-target="/admin/ai-pipeline/output" className="btn-primary" onClick={() => nav("/admin/ai-pipeline/output")} type="button">Output</button>
        </div>
      </div>
    </div>
  </div>

    </div>
  );
}
