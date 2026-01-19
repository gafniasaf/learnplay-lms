
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function TeacherStudents() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [search, setSearch] = React.useState("");
  const [classFilter, setClassFilter] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/teacher/dashboard" className="btn-ghost" onClick={() => nav("/teacher/dashboard")} type="button">← Back</button>
    <h1>Students</h1>
    <div></div>
  </header>
  
  <div className="container">
    <div className="search-bar">
      <input type="text" placeholder="Search students..." data-field="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select data-field="classFilter" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
        <option value="">All Classes</option>
        <option value="mth501">5th Grade Math - P1</option>
        <option value="mth503">5th Grade Math - P3</option>
        <option value="rmd100">Remedial Math</option>
      </select>
    </div>
    
    <table className="student-table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Class</th>
          <th>Progress</th>
          <th>Last Active</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr className="student-row">
          <td>
            <div className="student-name-cell">
              <div className="student-avatar">EJ</div>
              <div>
                <div className="student-name">Emma Johnson</div>
                <div className="student-email">emma.j@school.edu</div>
              </div>
            </div>
          </td>
          <td>5th Grade Math - P1</td>
          <td>
            <div className="progress-mini"><div style={{ "width": "85%" }} className="progress-fill"></div></div>
            85%
          </td>
          <td>Today</td>
          <td><span className="badge badge-success">On Track</span></td>
          <td><button data-cta-id="view-student" data-action="navigate" data-target="/teacher/student-detail" className="btn-ghost" onClick={() => nav("/teacher/student-detail")} type="button">→</button></td>
        </tr>
        <tr className="student-row">
          <td>
            <div className="student-name-cell">
              <div style={{ "background": "linear-gradient(135deg, #22c55e, #06b6d4)" }} className="student-avatar">LS</div>
              <div>
                <div className="student-name">Liam Smith</div>
                <div className="student-email">liam.s@school.edu</div>
              </div>
            </div>
          </td>
          <td>5th Grade Math - P1</td>
          <td>
            <div className="progress-mini"><div style={{ "width": "72%" }} className="progress-fill"></div></div>
            72%
          </td>
          <td>Yesterday</td>
          <td><span className="badge badge-warning">Needs Help</span></td>
          <td><button className="btn-ghost">→</button></td>
        </tr>
        <tr className="student-row">
          <td>
            <div className="student-name-cell">
              <div style={{ "background": "linear-gradient(135deg, #f59e0b, #ef4444)" }} className="student-avatar">OD</div>
              <div>
                <div className="student-name">Olivia Davis</div>
                <div className="student-email">olivia.d@school.edu</div>
              </div>
            </div>
          </td>
          <td>5th Grade Math - P3</td>
          <td>
            <div className="progress-mini"><div style={{ "width": "94%" }} className="progress-fill"></div></div>
            94%
          </td>
          <td>Today</td>
          <td><span className="badge badge-info">Ahead</span></td>
          <td><button className="btn-ghost">→</button></td>
        </tr>
        <tr className="student-row">
          <td>
            <div className="student-name-cell">
              <div className="student-avatar">NW</div>
              <div>
                <div className="student-name">Noah Wilson</div>
                <div className="student-email">noah.w@school.edu</div>
              </div>
            </div>
          </td>
          <td>Remedial Math</td>
          <td>
            <div className="progress-mini"><div style={{ "width": "45%" }} className="progress-fill"></div></div>
            45%
          </td>
          <td>3 days ago</td>
          <td><span className="badge badge-error">Behind</span></td>
          <td><button className="btn-ghost">→</button></td>
        </tr>
      </tbody>
    </table>
  </div>

    </div>
  );
}
