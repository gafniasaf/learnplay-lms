
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";
import { useGameStateStore } from "@/store/gameState";
import type { Course } from "@/lib/types/course";

// Demo course for when no real course is available
const DEMO_COURSE: Course = {
  id: "demo-fractions",
  title: "Fractions Practice",
  description: "Learn to work with fractions",
  levels: [
    { id: 1, title: "Basics", start: 1, end: 2 },
    { id: 2, title: "Intermediate", start: 1, end: 4 },
    { id: 3, title: "Advanced", start: 1, end: 6 },
  ],
  groups: [{ id: 1, name: "Addition" }, { id: 2, name: "Subtraction" }],
  items: [
    { id: 1, groupId: 1, text: "What is 1/2 + 1/4?", explain: "2/4 + 1/4 = 3/4", clusterId: "add-1", variant: "1", options: ["1/4", "3/4", "1/2", "1"], correctIndex: 1 },
    { id: 2, groupId: 1, text: "What is 1/3 + 1/6?", explain: "2/6 + 1/6 = 1/2", clusterId: "add-2", variant: "1", options: ["1/2", "2/9", "1/3", "5/6"], correctIndex: 0 },
    { id: 3, groupId: 2, text: "What is 3/4 - 1/4?", explain: "3/4 - 1/4 = 1/2", clusterId: "sub-1", variant: "1", options: ["1/2", "1/4", "2/4", "3/4"], correctIndex: 0 },
  ],
};

export default function PlayWelcome() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get("courseId");
  const mcp = useMCP();
  const gameStore = useGameStateStore();
  
  const [course, setCourse] = useState<Course | null>(null);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [loading, setLoading] = useState(true);

  // Load course on mount
  useEffect(() => {
    async function loadCourse() {
      setLoading(true);
      try {
        if (courseId) {
          const result = await mcp.getRecord("course-blueprint", courseId) as { record?: Course } | null;
          if (result?.record) {
            setCourse(result.record);
          } else {
            setCourse(DEMO_COURSE);
          }
        } else {
          setCourse(DEMO_COURSE);
        }
      } catch {
        setCourse(DEMO_COURSE);
      } finally {
        setLoading(false);
      }
    }
    loadCourse();
  }, [courseId]);

  const handleStart = () => {
    if (!course) {
      toast.error("No course loaded");
      return;
    }
    gameStore.initialize(course, selectedLevel);
    toast.success(`Starting Level ${selectedLevel}!`);
    nav("/play");
  };

  const title = course?.title || "Loading...";
  const subject = course?.description || "";
  const itemCount = course?.items?.length || 0;

  return (
    <div className="p-6">
      
  <div className="welcome-container">
    <div className="welcome-card">
      <div className="course-icon">📐</div>
      <h1 data-field="title" className="course-title">{title}</h1>
      <p data-field="subject" className="course-meta">{subject}</p>
      
      <div className="session-info">
        <div className="info-row">
          <span className="info-label">Questions</span>
          <span className="info-value">{itemCount} items</span>
        </div>
        <div className="info-row">
          <span className="info-label">Est. Time</span>
          <span className="info-value">~{Math.ceil(itemCount * 0.75)} min</span>
        </div>
        <div className="info-row">
          <span className="info-label">Level</span>
          <span className="info-value">{course?.levels?.find(l => l.id === selectedLevel)?.title || `Level ${selectedLevel}`}</span>
        </div>
      </div>
      
      <p style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)", "marginBottom": "0.5rem" }}>Select Level</p>
      <div className="level-selector">
        {(course?.levels || [{ id: 1 }, { id: 2 }, { id: 3 }]).map((level, idx) => (
          <button
            key={level.id}
            className={`level-btn ${selectedLevel === level.id ? "active" : ""} ${idx >= 3 ? "locked" : ""}`}
            onClick={() => idx < 3 && setSelectedLevel(level.id)}
            disabled={idx >= 3}
          >
            {level.id}
          </button>
        ))}
      </div>
      
      <button style={{ "width": "100%" }} data-cta-id="start-session" data-action="navigate" data-target="/play" className="btn-primary btn-large" onClick={handleStart} type="button" disabled={loading || !course}>
        {loading ? "Loading..." : "Start Learning 🚀"}
      </button>
      
      <button style={{ "marginTop": "1rem" }} data-cta-id="go-back" data-action="navigate" data-target="/student/dashboard" className="btn-ghost" onClick={() => nav("/student/dashboard")} type="button">
        ← Back to Dashboard
      </button>
    </div>
  </div>

    </div>
  );
}
