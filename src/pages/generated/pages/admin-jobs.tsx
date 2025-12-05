
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function AdminJobs() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [statusFilter, setStatusFilter] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("");
  const [search, setSearch] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/admin/console" className="btn-ghost" onClick={() => nav("/admin/console")} type="button">← Back</button>
    <h1>Job Queue</h1>
    <button data-cta-id="refresh" data-action="ui" className="btn-ghost" onClick={() => toast.info("Action: refresh")} type="button">↻ Refresh</button>
  </header>
  
  <div className="container">
    <div className="filter-bar">
      <select data-field="statusFilter" style={{ "padding": "0.5rem 1rem", "borderRadius": "8px", "border": "1px solid var(--color-border)" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
        <option value="">All Status</option>
        <option value="running">Running</option>
        <option value="queued">Queued</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
      </select>
      <select data-field="typeFilter" style={{ "padding": "0.5rem 1rem", "borderRadius": "8px", "border": "1px solid var(--color-border)" }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
        <option value="">All Types</option>
        <option value="ai_course_generate">ai_course_generate</option>
        <option value="guard_course">guard_course</option>
        <option value="draft_assignment_plan">draft_assignment_plan</option>
        <option value="compile_mockups">compile_mockups</option>
      </select>
      <input type="text" placeholder="Search by ID..." data-field="search" style={{ "padding": "0.5rem 1rem", "borderRadius": "8px", "border": "1px solid var(--color-border)", "flex": "1" }} value={search} onChange={(e) => setSearch(e.target.value)} />
    </div>
    
    <table className="job-table">
      <thead>
        <tr>
          <th>Job ID</th>
          <th>Type</th>
          <th>Target</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span className="job-id">job_abc123</span></td>
          <td><span className="job-type-badge job-type-generate">ai_course_generate</span></td>
          <td>5th Grade Fractions</td>
          <td><span className="badge badge-info">Running</span></td>
          <td className="duration">2m 15s</td>
          <td>Dec 5, 2:30 PM</td>
          <td><button data-cta-id="view-job" data-action="navigate" data-target="/admin/ai-pipeline" className="btn-ghost" onClick={() => nav("/admin/ai-pipeline")} type="button">View</button></td>
        </tr>
        <tr>
          <td><span className="job-id">job_def456</span></td>
          <td><span className="job-type-badge job-type-guard">guard_course</span></td>
          <td>Cell Biology Course</td>
          <td><span className="badge badge-warning">Queued</span></td>
          <td className="duration">—</td>
          <td>Dec 5, 2:28 PM</td>
          <td><button className="btn-ghost">View</button></td>
        </tr>
        <tr>
          <td><span className="job-id">job_ghi789</span></td>
          <td><span className="job-type-badge job-type-generate">ai_course_generate</span></td>
          <td>Reading Comprehension</td>
          <td><span className="badge badge-success">Completed</span></td>
          <td className="duration">3m 42s</td>
          <td>Dec 5, 2:15 PM</td>
          <td><button className="btn-ghost">View</button></td>
        </tr>
        <tr>
          <td><span className="job-id">job_jkl012</span></td>
          <td><span className="job-type-badge job-type-draft">draft_assignment_plan</span></td>
          <td>Week 10 Assignments</td>
          <td><span className="badge badge-success">Completed</span></td>
          <td className="duration">45s</td>
          <td>Dec 5, 1:30 PM</td>
          <td><button className="btn-ghost">View</button></td>
        </tr>
        <tr>
          <td><span className="job-id">job_mno345</span></td>
          <td><span className="job-type-badge job-type-compile">compile_mockups</span></td>
          <td>LearnPlay UI</td>
          <td><span className="badge badge-success">Completed</span></td>
          <td className="duration">12s</td>
          <td>Dec 5, 11:00 AM</td>
          <td><button className="btn-ghost">View</button></td>
        </tr>
        <tr>
          <td><span className="job-id">job_pqr678</span></td>
          <td><span className="job-type-badge job-type-generate">ai_course_generate</span></td>
          <td>Advanced Algebra</td>
          <td><span className="badge badge-error">Failed</span></td>
          <td className="duration">1m 23s</td>
          <td>Dec 5, 10:45 AM</td>
          <td><button data-cta-id="retry-job" data-action="enqueueJob" data-job-type="ai_course_generate" className="btn-ghost" onClick={async () => {
            try {
              await mcp.enqueueJob("ai_course_generate", { planBlueprintId: id });
              toast.success("Job enqueued: retry-job");
            } catch (e) {
              toast.error("Job failed: retry-job");
            }
          }} type="button">Retry</button></td>
        </tr>
      </tbody>
    </table>
    
    <div className="pagination">
      <button className="page-btn">←</button>
      <button className="page-btn active">1</button>
      <button className="page-btn">2</button>
      <button className="page-btn">3</button>
      <button className="page-btn">→</button>
    </div>
  </div>

    </div>
  );
}
