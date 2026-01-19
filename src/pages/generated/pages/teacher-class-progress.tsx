
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function TeacherClassProgress() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [classSelect, setClassSelect] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/teacher/dashboard" className="btn-ghost" onClick={() => nav("/teacher/dashboard")} type="button">← Back</button>
    <h1>Class Progress</h1>
    <select style={{ "padding": "0.5rem", "borderRadius": "8px", "border": "1px solid rgba(255,255,255,0.3)", "background": "transparent", "color": "white" }} data-field="classSelect" value={classSelect} onChange={(e) => setClassSelect(e.target.value)}>
      <option value="mth501">5th Grade Math - P1</option>
      <option value="mth503">5th Grade Math - P3</option>
    </select>
  </header>
  
  <div className="container">
    <div className="progress-overview">
      <div className="overview-card">
        <div style={{ "color": "var(--color-success)" }} className="overview-value">18</div>
        <div style={{ "color": "var(--color-text-muted)" }}>On Track</div>
      </div>
      <div className="overview-card">
        <div style={{ "color": "var(--color-warning)" }} className="overview-value">4</div>
        <div style={{ "color": "var(--color-text-muted)" }}>Needs Help</div>
      </div>
      <div className="overview-card">
        <div style={{ "color": "var(--color-error)" }} className="overview-value">2</div>
        <div style={{ "color": "var(--color-text-muted)" }}>Falling Behind</div>
      </div>
    </div>
    
    <div style={{ "marginBottom": "1rem" }} className="card">
      <h3 style={{ "marginBottom": "1rem" }}>Skill Distribution</h3>
      <div style={{ "display": "flex", "alignItems": "center", "gap": "1rem", "marginBottom": "0.5rem" }}>
        <span style={{ "width": "120px" }}>Fractions</span>
        <div style={{ "flex": "1", "display": "flex", "height": "24px", "borderRadius": "4px", "overflow": "hidden" }}>
          <div style={{ "width": "60%", "background": "var(--color-success)" }}></div>
          <div style={{ "width": "25%", "background": "var(--color-warning)" }}></div>
          <div style={{ "width": "15%", "background": "var(--color-error)" }}></div>
        </div>
      </div>
      <div style={{ "display": "flex", "alignItems": "center", "gap": "1rem", "marginBottom": "0.5rem" }}>
        <span style={{ "width": "120px" }}>Decimals</span>
        <div style={{ "flex": "1", "display": "flex", "height": "24px", "borderRadius": "4px", "overflow": "hidden" }}>
          <div style={{ "width": "45%", "background": "var(--color-success)" }}></div>
          <div style={{ "width": "35%", "background": "var(--color-warning)" }}></div>
          <div style={{ "width": "20%", "background": "var(--color-error)" }}></div>
        </div>
      </div>
      <div style={{ "display": "flex", "alignItems": "center", "gap": "1rem" }}>
        <span style={{ "width": "120px" }}>Percentages</span>
        <div style={{ "flex": "1", "display": "flex", "height": "24px", "borderRadius": "4px", "overflow": "hidden" }}>
          <div style={{ "width": "70%", "background": "var(--color-success)" }}></div>
          <div style={{ "width": "20%", "background": "var(--color-warning)" }}></div>
          <div style={{ "width": "10%", "background": "var(--color-error)" }}></div>
        </div>
      </div>
      <div style={{ "display": "flex", "gap": "1rem", "marginTop": "1rem", "justifyContent": "flex-end", "fontSize": "0.75rem" }}>
        <span><span style={{ "display": "inline-block", "width": "12px", "height": "12px", "background": "var(--color-success)", "borderRadius": "2px" }}></span> Mastered</span>
        <span><span style={{ "display": "inline-block", "width": "12px", "height": "12px", "background": "var(--color-warning)", "borderRadius": "2px" }}></span> Learning</span>
        <span><span style={{ "display": "inline-block", "width": "12px", "height": "12px", "background": "var(--color-error)", "borderRadius": "2px" }}></span> Struggling</span>
      </div>
    </div>
    
    <table className="student-progress-table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Status</th>
          <th>Completion</th>
          <th>Accuracy</th>
          <th>Last Active</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span className="status-dot active"></span>Emma Johnson</td>
          <td><span className="badge badge-success">On Track</span></td>
          <td>85%</td>
          <td>88%</td>
          <td>Today</td>
          <td><button data-cta-id="message-student" data-action="navigate" data-target="/messages" className="btn-ghost" onClick={() => nav("/messages")} type="button">Message</button></td>
        </tr>
        <tr>
          <td><span className="status-dot active"></span>Olivia Davis</td>
          <td><span className="badge badge-info">Ahead</span></td>
          <td>100%</td>
          <td>94%</td>
          <td>Today</td>
          <td><button className="btn-ghost">Message</button></td>
        </tr>
        <tr>
          <td><span className="status-dot inactive"></span>Liam Smith</td>
          <td><span className="badge badge-warning">Needs Help</span></td>
          <td>45%</td>
          <td>62%</td>
          <td>Yesterday</td>
          <td><button className="btn-ghost">Message</button></td>
        </tr>
        <tr>
          <td><span className="status-dot inactive"></span>Noah Wilson</td>
          <td><span className="badge badge-error">Behind</span></td>
          <td>20%</td>
          <td>45%</td>
          <td>3 days ago</td>
          <td><button className="btn-ghost">Message</button></td>
        </tr>
      </tbody>
    </table>
  </div>

    </div>
  );
}
