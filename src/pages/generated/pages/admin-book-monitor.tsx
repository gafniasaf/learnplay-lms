
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function AdminBookMonitor() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  

  return (
    <div className="p-6">
      
  <div className="container">
    <header className="header">
      <h1>📚 Book Generation Monitor</h1>
      <p className="subtitle">Skeleton → Content → PDF Pipeline</p>
    </header>

    <div className="book-selector">
      <div className="book-selector-header">
        <div className="book-info">
          <div className="book-cover">📖</div>
          <div className="book-details">
            <h2>MBO Anatomie &amp; Fysiologie 4</h2>
            <div className="book-meta">14 chapters • Version: ee0b3b54 • Skeleton v1</div>
          </div>
        </div>
        <select data-cta-id="cta-bookmonitor-book-select" data-action="action" className="book-dropdown" onClick={() => toast.info("Action: cta-bookmonitor-book-select")}>
          <option>MBO Anatomie &amp; Fysiologie 4</option>
          <option>MBO Methodisch Werken</option>
          <option>MBO Communicatie</option>
          <option>MBO Pathologie N4</option>
        </select>
      </div>

      <div className="chapter-grid">
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="1" className="chapter-cell done" onClick={() => toast.info("Action: cta-bookmonitor-chapter-cell")}>Ch1<span className="chapter-cell-sections">8/8</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="2" className="chapter-cell done">Ch2<span className="chapter-cell-sections">6/6</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="3" className="chapter-cell active">Ch3<span className="chapter-cell-sections">3/7</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="4" className="chapter-cell queued">Ch4<span className="chapter-cell-sections">0/5</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="5" className="chapter-cell pending">Ch5<span className="chapter-cell-sections">0/6</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="6" className="chapter-cell pending">Ch6<span className="chapter-cell-sections">0/4</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="7" className="chapter-cell pending">Ch7<span className="chapter-cell-sections">0/8</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="8" className="chapter-cell pending">Ch8<span className="chapter-cell-sections">0/5</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="9" className="chapter-cell pending">Ch9<span className="chapter-cell-sections">0/7</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="10" className="chapter-cell pending">Ch10<span className="chapter-cell-sections">0/6</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="11" className="chapter-cell pending">Ch11<span className="chapter-cell-sections">0/4</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="12" className="chapter-cell pending">Ch12<span className="chapter-cell-sections">0/5</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="13" className="chapter-cell failed">Ch13<span className="chapter-cell-sections">2/6</span></div>
        <div data-cta-id="cta-bookmonitor-chapter-cell" data-action="action" data-payload-chapter="14" className="chapter-cell pending">Ch14<span className="chapter-cell-sections">0/3</span></div>
      </div>
    </div>

    <div className="grid-3">
      <div className="card">
        <div className="card-title">Status</div>
        <div className="status-badge generating">Generating</div>
      </div>

      <div className="card">
        <div className="card-title">Progress</div>
        <div className="progress-container">
          <div className="progress-bar">
            <div style={{ "width": "32%" }} className="progress-fill"></div>
          </div>
          <div className="progress-stats">
            <span>32%</span>
            <span>19 / 60 sections</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">⏱️ Time</div>
        <div className="time-grid">
          <div className="time-stat">
            <div className="time-stat-label">Elapsed</div>
            <div className="time-stat-value">01:24:32</div>
          </div>
          <div className="time-stat">
            <div className="time-stat-label">Remaining</div>
            <div className="time-stat-value">~02:45:00</div>
          </div>
          <div className="time-stat">
            <div className="time-stat-label">ETA</div>
            <div className="time-stat-value">10:15 AM</div>
          </div>
          <div className="time-stat">
            <div className="time-stat-label">Speed</div>
            <div className="time-stat-value">14 sec/s</div>
          </div>
        </div>
      </div>
    </div>

    <div className="grid-3">
      <div className="card">
        <div className="card-title">Job Queue</div>
        <div className="stats-grid">
          <div className="stat-box queued">
            <div className="stat-value yellow">3</div>
            <div className="stat-label">Queued</div>
          </div>
          <div className="stat-box active">
            <div className="stat-value blue">2</div>
            <div className="stat-label">Active</div>
          </div>
          <div className="stat-box done">
            <div className="stat-value green">156</div>
            <div className="stat-label">Done</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🔄 Active Jobs</div>
        <div className="job-list">
          <div className="job-item">
            <span className="job-type">section</span>
            <span className="job-chapter">Ch3.4</span>
            <span className="job-title">Spijsverteringsstelsel</span>
            <span className="job-time">45s</span>
          </div>
          <div className="job-item">
            <span className="job-type">section</span>
            <span className="job-chapter">Ch3.5</span>
            <span className="job-title">Ademhalingsstelsel</span>
            <span className="job-time">12s</span>
          </div>
          <div className="job-item queued">
            <span className="job-type">chapter</span>
            <span className="job-chapter">Ch4</span>
            <span className="job-title">Het zenuwstelsel</span>
            <span className="job-time">queued</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">⚠️ Recent Errors</div>
        <div className="error-list">
          <div className="error-item">
            <span className="error-id">[Ch13.2]</span>
            <span className="error-msg">Microheading contains forbidden punctuation</span>
          </div>
          <div className="error-item">
            <span className="error-id">[Ch13.3]</span>
            <span className="error-msg">Box target &quot;praktijk&quot; not found in section</span>
          </div>
          <div className="error-item">
            <span className="error-id">[Ch13.4]</span>
            <span className="error-msg">LLM response exceeded max retries (3)</span>
          </div>
        </div>
      </div>
    </div>

    <div className="actions">
      <button data-cta-id="cta-generate-chapter" data-action="enqueueJob" data-job-type="book_generate_chapter" className="btn btn-primary" onClick={async () => {
            try {
              await mcp.enqueueJob("book_generate_chapter", { planBlueprintId: id });
              toast.success("Job enqueued: cta-generate-chapter");
            } catch (e) {
              toast.error("Job failed: cta-generate-chapter");
            }
          }} type="button">
        ▶️ Generate Chapter
      </button>
      <button data-cta-id="cta-generate-all" data-action="enqueueJob" data-job-type="book_generate_chapter" className="btn btn-secondary" onClick={async () => {
            try {
              await mcp.enqueueJob("book_generate_chapter", { planBlueprintId: id });
              toast.success("Job enqueued: cta-generate-all");
            } catch (e) {
              toast.error("Job failed: cta-generate-all");
            }
          }} type="button">
        📚 Generate All
      </button>
      <button data-cta-id="cta-pause" data-action="action" className="btn btn-warning" onClick={() => toast.info("Action: cta-pause")} type="button">
        ⏸️ Pause
      </button>
      <button data-cta-id="cta-resume" data-action="action" className="btn btn-success" onClick={() => toast.info("Action: cta-resume")} type="button">
        ▶️ Resume
      </button>
      <button data-cta-id="cta-cancel" data-action="action" className="btn btn-danger" onClick={() => toast.info("Action: cta-cancel")} type="button">
        ⏹️ Cancel
      </button>
      <button data-cta-id="cta-render-pdf" data-action="action" className="btn btn-secondary" onClick={() => toast.info("Action: cta-render-pdf")} type="button">
        📄 Render PDF
      </button>
    </div>

    <div className="grid-2">
      <div className="card">
        <div className="card-title">Content Generated</div>
        <div className="stats-grid">
          <div className="stat-box chapters">
            <div className="stat-value cyan">3</div>
            <div className="stat-label">Chapters</div>
          </div>
          <div className="stat-box sections">
            <div className="stat-value purple">19</div>
            <div className="stat-label">Sections</div>
          </div>
          <div className="stat-box failed">
            <div className="stat-value red">4</div>
            <div className="stat-label">Failed</div>
          </div>
        </div>
        <div style={{ "marginTop": "0.75rem" }} className="stats-grid">
          <div className="stat-box">
            <div className="stat-value cyan">42</div>
            <div className="stat-label">Verdieping</div>
          </div>
          <div className="stat-box">
            <div className="stat-value purple">38</div>
            <div className="stat-label">Praktijk</div>
          </div>
          <div className="stat-box">
            <div className="stat-value orange">156</div>
            <div className="stat-label">Figures</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">✅ Recently Completed</div>
        <div className="job-list">
          <div className="job-item done">
            <span className="job-type">section</span>
            <span className="job-chapter">Ch3.3</span>
            <span className="job-title">Circulatiestelsel</span>
            <span className="job-time">2m ago</span>
          </div>
          <div className="job-item done">
            <span className="job-type">section</span>
            <span className="job-chapter">Ch3.2</span>
            <span className="job-title">Skelet en spieren</span>
            <span className="job-time">5m ago</span>
          </div>
          <div className="job-item done">
            <span className="job-type">section</span>
            <span className="job-chapter">Ch3.1</span>
            <span className="job-title">Huid en zintuigen</span>
            <span className="job-time">8m ago</span>
          </div>
          <div className="job-item done">
            <span className="job-type">chapter</span>
            <span className="job-chapter">Ch2</span>
            <span className="job-title">Weefsels en organen</span>
            <span className="job-time">15m ago</span>
          </div>
        </div>
      </div>
    </div>

    <div className="logs-card">
      <div className="card-title">Live Logs</div>
      <div className="logs-container">
        <div className="log-line"><span className="log-time">[07:28:45]</span> <span className="log-info">ℹ️</span> Starting section Ch3.5 &quot;Ademhalingsstelsel&quot;</div>
        <div className="log-line"><span className="log-time">[07:28:32]</span> <span className="log-success">✅</span> Section Ch3.4 completed (19 blocks, 3 microheadings)</div>
        <div className="log-line"><span className="log-time">[07:27:58]</span> <span className="log-info">ℹ️</span> Generating section Ch3.4 &quot;Spijsverteringsstelsel&quot;</div>
        <div className="log-line"><span className="log-time">[07:27:45]</span> <span className="log-success">✅</span> Section Ch3.3 completed (24 blocks, 4 microheadings)</div>
        <div className="log-line"><span className="log-time">[07:26:12]</span> <span className="log-warning">⚠️</span> Retry 1/3 for section Ch3.3 - microheading validation failed</div>
        <div className="log-line"><span className="log-time">[07:25:30]</span> <span className="log-info">ℹ️</span> Generating section Ch3.3 &quot;Circulatiestelsel&quot;</div>
        <div className="log-line"><span className="log-time">[07:25:15]</span> <span className="log-success">✅</span> Chapter Ch3 layout plan: 7 sections, 3 praktijk, 4 verdieping</div>
        <div className="log-line"><span className="log-time">[07:25:00]</span> <span className="log-info">ℹ️</span> Starting chapter orchestrator for Ch3 &quot;Orgaanstelsels&quot;</div>
        <div className="log-line"><span className="log-time">[07:24:45]</span> <span className="log-error">❌</span> Ch13.4 failed after 3 retries - marking chapter as failed</div>
        <div className="log-line"><span className="log-time">[07:24:30]</span> <span className="log-warning">⚠️</span> Retry 3/3 for section Ch13.4 - box target validation failed</div>
      </div>
    </div>
  </div>

    </div>
  );
}
