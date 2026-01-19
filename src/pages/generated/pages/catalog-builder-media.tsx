
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function CatalogBuilderMedia() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [blockedBanner, setBlockedBanner] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [difficulty, setDifficulty] = React.useState("");
  const [published, setPublished] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [alt_0, setAlt_0] = React.useState("");
  const [alt_1, setAlt_1] = React.useState("");
  const [alt_2, setAlt_2] = React.useState("");

  return (
    <div className="p-6">
      
  <div className="editor-container">
    <header className="editor-header">
      <div style={{ "display": "flex", "alignItems": "center", "gap": "1rem" }}>
        <button data-cta-id="back" data-action="navigate" data-target="/admin/console" style={{ "background": "none", "border": "none", "color": "white", "cursor": "pointer", "fontSize": "1.25rem" }} onClick={() => nav("/admin/console")} type="button">←</button>
        <span className="editor-title">Course Builder</span>
      </div>
      <div className="editor-actions">
        <button data-cta-id="ai-generate" data-action="enqueueJob" data-job-type="ai_course_generate" className="btn btn-ai" onClick={async () => {
            try {
              await mcp.enqueueJob("ai_course_generate", { planBlueprintId: id });
              toast.success("Job enqueued: ai-generate");
            } catch (e) {
              toast.error("Job failed: ai-generate");
            }
          }} type="button">
          ✨ AI Generate
        </button>
        <button data-cta-id="guard-course" data-action="enqueueJob" data-job-type="guard_course" className="btn btn-guard" onClick={async () => {
            try {
              await mcp.enqueueJob("guard_course", { planBlueprintId: id });
              toast.success("Job enqueued: guard-course");
            } catch (e) {
              toast.error("Job failed: guard-course");
            }
          }} type="button">
          🛡️ Guard Check
        </button>
        <button data-cta-id="save-course" data-action="save" data-entity="course-blueprint" className="btn btn-primary" onClick={async () => {
            try {
              await mcp.saveRecord("course-blueprint", { id });
              toast.success("Saved: save-course");
            } catch (e) {
              toast.error("Save failed: save-course");
            }
          }} type="button">
          💾 Save Course
        </button>
      </div>
    </header>
    
    <div className="editor-body">
      
      <div data-field="blockedBanner" style={{ "display": "none" }} className="blocked-banner">{blockedBanner}</div>
      
      
      <div className="status-bar">
        <div className="status-indicator passed"></div>
        <div className="status-text">
          <strong>Guard Status:</strong> Passed • Last checked 2 min ago
        </div>
        <span data-cta-id="rerun-guard" data-action="enqueueJob" data-job-type="guard_course" className="status-action" onClick={async () => {
            try {
              await mcp.enqueueJob("guard_course", { planBlueprintId: id });
              toast.success("Job enqueued: rerun-guard");
            } catch (e) {
              toast.error("Job failed: rerun-guard");
            }
          }}>Re-run</span>
      </div>
      
      
      <div className="form-section">
        <div className="form-section-title">📚 Course Information</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Title <span className="required">*</span></label>
            <input type="text" data-field="title" value={title} placeholder="Course title" className="form-input" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Subject <span className="required">*</span></label>
            <input type="text" data-field="subject" value={subject} placeholder="Subject area" className="form-input" onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Difficulty</label>
            <select data-field="difficulty" className="form-select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="elementary" selected>Elementary</option>
              <option value="middle">Middle School</option>
              <option value="high">High School</option>
              <option value="college">College</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Published</label>
            <select data-field="published" className="form-select" value={published} onChange={(e) => setPublished(e.target.value)}>
              <option value="false">Draft</option>
              <option value="true">Published</option>
            </select>
          </div>
          <div className="form-group full">
            <label className="form-label">Description</label>
            <textarea data-field="description" placeholder="Course description..." className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)}>Learn to add, subtract, multiply, and divide fractions with visual aids and step-by-step explanations.</textarea>
          </div>
        </div>
      </div>
      
      
      <div className="media-section">
        <div className="media-header">
          <div className="form-section-title">🖼️ Media Assets</div>
          <div className="media-count">4 / 6 items</div>
        </div>
        
        <div data-cta-id="upload-media" data-action="ui" className="upload-zone" onClick={() => toast.info("Action: upload-media")}>
          <div className="upload-icon">📤</div>
          <div className="upload-text">Drop files here or click to upload</div>
          <div className="upload-hint">Images, audio, or video</div>
          <div className="upload-limits">Images ≤5MB • Audio/Video ≤20MB • Max 6 items</div>
        </div>
        
        <div className="media-grid">
          
          <div className="media-tile cover">
            <span className="media-tile-badge">Cover</span>
            <span className="media-tile-type">IMG</span>
            <img src="https://placehold.co/300x300/3b82f6/white?text=Cover" alt="Course cover"  />
            <div className="media-tile-overlay">
              <button data-cta-id="edit-media-0" data-action="ui" className="media-tile-btn" onClick={() => toast.info("Action: edit-media-0")} type="button">✏️ Edit</button>
              <button data-cta-id="delete-media-0" data-action="ui" className="media-tile-btn" onClick={() => toast.info("Action: delete-media-0")} type="button">🗑️ Delete</button>
            </div>
          </div>
          
          
          <div className="media-tile">
            <span className="media-tile-type">VID</span>
            <img src="https://placehold.co/300x300/8b5cf6/white?text=Video" alt="Lesson video"  />
            <div className="media-tile-overlay">
              <button data-cta-id="set-cover-1" data-action="ui" className="media-tile-btn" onClick={() => toast.info("Action: set-cover-1")} type="button">⭐ Set Cover</button>
              <button data-cta-id="edit-media-1" data-action="ui" className="media-tile-btn" onClick={() => toast.info("Action: edit-media-1")} type="button">✏️ Edit</button>
              <button data-cta-id="delete-media-1" data-action="ui" className="media-tile-btn" onClick={() => toast.info("Action: delete-media-1")} type="button">🗑️ Delete</button>
            </div>
          </div>
          
          
          <div className="media-tile">
            <span className="media-tile-type">AUD</span>
            <img src="https://placehold.co/300x300/22c55e/white?text=Audio" alt="Narration"  />
            <div className="media-tile-overlay">
              <button data-cta-id="set-cover-2" data-action="ui" className="media-tile-btn" onClick={() => toast.info("Action: set-cover-2")} type="button">⭐ Set Cover</button>
              <button data-cta-id="edit-media-2" data-action="ui" className="media-tile-btn" onClick={() => toast.info("Action: edit-media-2")} type="button">✏️ Edit</button>
              <button data-cta-id="delete-media-2" data-action="ui" className="media-tile-btn" onClick={() => toast.info("Action: delete-media-2")} type="button">🗑️ Delete</button>
            </div>
          </div>
          
          
          <div className="media-tile error">
            <div className="media-tile-error">
              <span style={{ "fontSize": "2rem" }}>⚠️</span>
              <span style={{ "fontSize": "0.75rem" }}>Upload failed</span>
              <button data-cta-id="retry-media-3" data-action="ui" style={{ "marginTop": "0.5rem" }} className="media-tile-btn" onClick={() => toast.info("Action: retry-media-3")} type="button">Retry</button>
            </div>
          </div>
        </div>
        
        
        <div className="media-meta">
          <div className="media-meta-title">Alt Text & Captions <span style={{ "color": "#ef4444" }}>*</span> <span style={{ "fontWeight": "normal", "color": "#64748b", "fontSize": "0.75rem" }}>(Required for accessibility)</span></div>
          <div className="media-meta-grid">
            <div className="media-meta-row">
              <img src="https://placehold.co/40x40/3b82f6/white?text=1" alt="Media thumbnail 1" className="media-thumb" />
              <input type="text" data-field="alt_0" placeholder="Alt text for cover image..." value={alt_0} className="form-input" onChange={(e) => setAlt_0(e.target.value)} />
            </div>
            <div className="media-meta-row">
              <img src="https://placehold.co/40x40/8b5cf6/white?text=2" alt="Media thumbnail 2" className="media-thumb" />
              <input type="text" data-field="alt_1" placeholder="Video caption/transcript link..." value={alt_1} className="form-input" onChange={(e) => setAlt_1(e.target.value)} />
            </div>
            <div className="media-meta-row">
              <img src="https://placehold.co/40x40/22c55e/white?text=3" alt="Media thumbnail 3" className="media-thumb" />
              <input type="text" data-field="alt_2" placeholder="Audio transcript link..." value={alt_2} className="form-input" onChange={(e) => setAlt_2(e.target.value)} />
            </div>
          </div>
        </div>
      </div>
      
      
      <div className="form-section">
        <div className="form-section-title">📝 Content Items (15 questions)</div>
        <div style={{ "color": "#64748b", "fontSize": "0.875rem" }}>
          Content items are managed in the full editor. Use AI Generate to create questions from the course description and media assets.
        </div>
        <div style={{ "marginTop": "1rem", "display": "flex", "gap": "0.75rem" }}>
          <button data-cta-id="open-item-editor" data-action="navigate" data-target="/catalog-builder/items" className="btn btn-secondary" onClick={() => nav("/catalog-builder/items")} type="button">
            ✏️ Edit Items
          </button>
          <button data-cta-id="ai-generate-items" data-action="enqueueJob" data-job-type="ai_course_generate" className="btn btn-ai" onClick={async () => {
            try {
              await mcp.enqueueJob("ai_course_generate", { planBlueprintId: id });
              toast.success("Job enqueued: ai-generate-items");
            } catch (e) {
              toast.error("Job failed: ai-generate-items");
            }
          }} type="button">
            ✨ AI Generate Items
          </button>
        </div>
      </div>
    </div>
  </div>

    </div>
  );
}
