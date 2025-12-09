
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

interface CourseBlueprint {
  id?: string;
  title: string;
  subject: string;
  difficulty: string;
  published: boolean;
  description: string;
  mediaAssets?: MediaAsset[];
}

interface MediaAsset {
  id: string;
  type: "image" | "video" | "audio";
  url: string;
  alt: string;
  isCover?: boolean;
}

export default function CatalogBuilderMedia() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form state
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState("elementary");
  const [published, setPublished] = useState("false");
  const [description, setDescription] = useState("");
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [altTexts, setAltTexts] = useState<Record<string, string>>({});
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [guardStatus, setGuardStatus] = useState<"passed" | "failed" | "pending">("pending");
  const [blockedBanner, setBlockedBanner] = useState("");

  // Load existing course if editing
  const loadCourse = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await mcp.getRecord("course-blueprint", id) as { record?: CourseBlueprint } | null;
      if (result?.record) {
        setTitle(result.record.title || "");
        setSubject(result.record.subject || "");
        setDifficulty(result.record.difficulty || "elementary");
        setPublished(result.record.published ? "true" : "false");
        setDescription(result.record.description || "");
        if (result.record.mediaAssets) {
          setMediaAssets(result.record.mediaAssets);
          const alts: Record<string, string> = {};
          result.record.mediaAssets.forEach(m => { alts[m.id] = m.alt || ""; });
          setAltTexts(alts);
        }
      }
    } catch {
      toast.error("Failed to load course");
    } finally {
      setLoading(false);
    }
  }, [id, mcp, toast]);

  useEffect(() => {
    if (!id) return;
    loadCourse();
  }, [id, loadCourse]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!title || !subject) {
      toast.error("Title and subject are required");
      return;
    }
    try {
      const payload: CourseBlueprint = {
        id: id || undefined,
        title,
        subject,
        difficulty,
        published: published === "true",
        description,
        mediaAssets: mediaAssets.map(m => ({ ...m, alt: altTexts[m.id] || "" })),
      };
      await mcp.saveRecord("course-blueprint", payload as unknown as Record<string, unknown>);
      toast.success("Course saved!");
    } catch {
      toast.error("Failed to save course");
    }
  }, [mcp, id, title, subject, difficulty, published, description, mediaAssets, altTexts]);

  // AI Generate handler
  const handleAIGenerate = useCallback(async () => {
    try {
      await mcp.enqueueJob("ai_course_generate", { 
        title, 
        subject, 
        description,
        courseBlueprintId: id 
      });
      toast.success("AI generation job started!");
    } catch {
      setBlockedBanner("AI generation unavailable. Check API keys.");
      toast.error("AI generation failed - check API keys");
    }
  }, [mcp, id, title, subject, description]);

  // Guard check handler
  const handleGuardCheck = useCallback(async () => {
    try {
      await mcp.enqueueJob("guard_course", { courseBlueprintId: id });
      toast.success("Guard check started!");
      setGuardStatus("pending");
    } catch {
      toast.error("Guard check failed");
      setGuardStatus("failed");
    }
  }, [mcp, id]);

  // File upload handler
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    
    // Validate file count
    if (mediaAssets.length + files.length > 6) {
      toast.error("Maximum 6 media items allowed");
      return;
    }
    
    Array.from(files).forEach(file => {
      // Validate file size
      const maxSize = file.type.startsWith("image") ? 5 * 1024 * 1024 : 20 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error(`${file.name} exceeds size limit`);
        return;
      }
      
      // Create preview URL
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith("image") ? "image" : file.type.startsWith("video") ? "video" : "audio";
      const newAsset: MediaAsset = {
        id: `temp-${Date.now()}-${Math.random()}`,
        type,
        url,
        alt: "",
        isCover: mediaAssets.length === 0,
      };
      setMediaAssets(prev => [...prev, newAsset]);
    });
  }, [mediaAssets]);

  // Delete media handler
  const handleDeleteMedia = useCallback((assetId: string) => {
    setMediaAssets(prev => prev.filter(m => m.id !== assetId));
  }, []);

  // Set cover handler
  const handleSetCover = useCallback((assetId: string) => {
    setMediaAssets(prev => prev.map(m => ({ ...m, isCover: m.id === assetId })));
  }, []);

  return (
    <div className="p-6">
      <input 
        ref={fileInputRef}
        type="file" 
        multiple 
        accept="image/*,video/*,audio/*" 
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />
      
  <div className="editor-container">
    <header className="editor-header">
      <div style={{ "display": "flex", "alignItems": "center", "gap": "1rem" }}>
        <button data-cta-id="back" data-action="navigate" data-target="/admin/console" style={{ "background": "none", "border": "none", "color": "white", "cursor": "pointer", "fontSize": "1.25rem" }} onClick={() => nav("/admin/console")} type="button">←</button>
        <span className="editor-title">Course Builder</span>
      </div>
      <div className="editor-actions">
        <button data-cta-id="ai-generate" data-action="enqueueJob" data-job-type="ai_course_generate" className="btn btn-ai" onClick={handleAIGenerate} type="button" disabled={loading}>
          ✨ AI Generate
        </button>
        <button data-cta-id="guard-course" data-action="enqueueJob" data-job-type="guard_course" className="btn btn-guard" onClick={handleGuardCheck} type="button" disabled={loading}>
          🛡️ Guard Check
        </button>
        <button data-cta-id="save-course" data-action="save" data-entity="course-blueprint" className="btn btn-primary" onClick={handleSave} type="button" disabled={loading}>
          💾 Save Course
        </button>
      </div>
    </header>
    
    <div className="editor-body">
      
      {blockedBanner && (
        <div data-field="blockedBanner" className="blocked-banner" style={{ background: "#fef2f2", color: "#dc2626", padding: "1rem", borderRadius: "0.5rem", marginBottom: "1rem" }}>
          ⚠️ {blockedBanner}
        </div>
      )}
      
      
      <div className="status-bar">
        <div className={`status-indicator ${guardStatus}`} style={{ 
          width: "12px", height: "12px", borderRadius: "50%",
          background: guardStatus === "passed" ? "#22c55e" : guardStatus === "failed" ? "#ef4444" : "#f59e0b"
        }}></div>
        <div className="status-text">
          <strong>Guard Status:</strong> {guardStatus === "passed" ? "Passed" : guardStatus === "failed" ? "Failed" : "Pending"}
        </div>
        <span data-cta-id="rerun-guard" data-action="enqueueJob" data-job-type="guard_course" className="status-action" style={{ cursor: "pointer", color: "#3b82f6" }} onClick={handleGuardCheck}>Re-run</span>
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
              <option value="elementary">Elementary</option>
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
          <div className="media-count">{mediaAssets.length} / 6 items</div>
        </div>
        
        <div 
          data-cta-id="upload-media" 
          data-action="ui" 
          className="upload-zone" 
          onClick={() => fileInputRef.current?.click()}
          style={{ cursor: "pointer", border: "2px dashed #cbd5e1", borderRadius: "0.5rem", padding: "2rem", textAlign: "center" }}
        >
          <div className="upload-icon">📤</div>
          <div className="upload-text">Drop files here or click to upload</div>
          <div className="upload-hint">Images, audio, or video</div>
          <div className="upload-limits">Images ≤5MB • Audio/Video ≤20MB • Max 6 items</div>
        </div>
        
        <div className="media-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
          {mediaAssets.map((asset, index) => (
            <div key={asset.id} className={`media-tile ${asset.isCover ? "cover" : ""}`} style={{ position: "relative", aspectRatio: "1", overflow: "hidden", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
              {asset.isCover && <span className="media-tile-badge" style={{ position: "absolute", top: "0.25rem", left: "0.25rem", background: "#f59e0b", color: "white", padding: "0.125rem 0.5rem", borderRadius: "0.25rem", fontSize: "0.75rem" }}>Cover</span>}
              <span className="media-tile-type" style={{ position: "absolute", top: "0.25rem", right: "0.25rem", background: "#1e293b", color: "white", padding: "0.125rem 0.5rem", borderRadius: "0.25rem", fontSize: "0.625rem" }}>{asset.type.toUpperCase().slice(0, 3)}</span>
              {asset.type === "image" && <img src={asset.url} alt={asset.alt || "Media"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              {asset.type === "video" && <video src={asset.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              {asset.type === "audio" && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "#f1f5f9" }}>🎵</div>}
              <div className="media-tile-overlay" style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.7)", padding: "0.5rem", display: "flex", gap: "0.25rem", justifyContent: "center" }}>
                {!asset.isCover && (
                  <button data-cta-id={`set-cover-${index}`} data-action="ui" className="media-tile-btn" onClick={() => handleSetCover(asset.id)} type="button" style={{ background: "transparent", border: "none", color: "white", cursor: "pointer" }}>⭐</button>
                )}
                <button data-cta-id={`delete-media-${index}`} data-action="ui" className="media-tile-btn" onClick={() => handleDeleteMedia(asset.id)} type="button" style={{ background: "transparent", border: "none", color: "white", cursor: "pointer" }}>🗑️</button>
              </div>
            </div>
          ))}
          {mediaAssets.length === 0 && (
            <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#94a3b8", padding: "2rem" }}>
              No media assets yet. Upload images, videos, or audio above.
            </div>
          )}
        </div>
        
        
        {mediaAssets.length > 0 && (
        <div className="media-meta" style={{ marginTop: "1rem", padding: "1rem", background: "#f8fafc", borderRadius: "0.5rem" }}>
          <div className="media-meta-title">Alt Text & Captions <span style={{ "color": "#ef4444" }}>*</span> <span style={{ "fontWeight": "normal", "color": "#64748b", "fontSize": "0.75rem" }}>(Required for accessibility)</span></div>
          <div className="media-meta-grid" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
            {mediaAssets.map((asset, index) => (
              <div key={asset.id} className="media-meta-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "0.25rem", overflow: "hidden", flexShrink: 0 }}>
                  {asset.type === "image" && <img src={asset.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  {asset.type !== "image" && <div style={{ width: "100%", height: "100%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>{asset.type === "video" ? "🎬" : "🎵"}</div>}
                </div>
                <input 
                  type="text" 
                  data-field={`alt-${index}`}
                  placeholder={asset.type === "image" ? "Alt text for image..." : `${asset.type} caption/transcript link...`}
                  value={altTexts[asset.id] || ""}
                  className="form-input" 
                  style={{ flex: 1, padding: "0.5rem", border: "1px solid #e2e8f0", borderRadius: "0.25rem" }}
                  onChange={(e) => setAltTexts(prev => ({ ...prev, [asset.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>
        )}
      </div>
      
      
      <div className="form-section">
        <div className="form-section-title">📝 Content Items</div>
        <div style={{ "color": "#64748b", "fontSize": "0.875rem" }}>
          Content items are managed in the full editor. Use AI Generate to create questions from the course description and media assets.
        </div>
        <div style={{ "marginTop": "1rem", "display": "flex", "gap": "0.75rem" }}>
          <button data-cta-id="open-item-editor" data-action="navigate" data-target="/catalog-builder/items" className="btn btn-secondary" onClick={() => nav("/catalog-builder/items")} type="button">
            ✏️ Edit Items
          </button>
          <button data-cta-id="ai-generate-items" data-action="enqueueJob" data-job-type="ai_course_generate" className="btn btn-ai" onClick={handleAIGenerate} type="button" disabled={loading}>
            ✨ AI Generate Items
          </button>
        </div>
      </div>
    </div>
  </div>

    </div>
  );
}
