import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Trophy, Menu, Home, Target } from "lucide-react";
import { useMCP } from "@/hooks/useMCP";
import { useGameSession } from "@/hooks/useGameSession";
import { isDevEnabled } from "@/lib/env";
import { speak, stop as stopTTS, isTTSAvailable, getTTSPreference, setTTSPreference } from "@/lib/tts";
import { setupAutoFlush, getQueueSize } from "@/lib/offlineQueue";
import { useSessionStore } from "@/store/sessionStore";
import { useGameState } from "@/hooks/useGameState";
import { Stem } from "@/components/game/Stem";
import { OptionGrid } from "@/components/game/OptionGrid";
import { NumericPad } from "@/components/game/NumericPad";
import { GroupGrid } from "@/components/game/GroupGrid";
import { 
  VisualMCQ,
  AudioMCQ,
  VideoPrompt,
  DragDropClassify,
  MatchingPairs,
  OrderingSequence,
  DiagramLabeling,
  ManipulativeNumeric,
  GraphInterpretation,
  TimedFluency,
} from "@/components/game/AllAdvancedExercises";
import { CorrectFlash } from "@/components/game/CorrectFlash";
import WrongModal from "@/components/game/WrongModal";
import { ProgressBar } from "@/components/game/ProgressBar";
import { FeedbackAnnouncer } from "@/components/game/FeedbackAnnouncer";
import { GameSidebar } from "@/components/game/GameSidebar";
import { SkipLink } from "@/components/game/SkipLink";
import { Button } from "@/components/ui/button";
import type { Course } from "@/lib/types/course";
import { isEmbed, postToHost, listenHost } from "@/lib/embed";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { PlayErrorBoundary } from "@/components/game/PlayErrorBoundary";
import { useCoursePreloader } from "@/hooks/useCoursePreloader";
import { getApiMode } from "@/lib/api";

type Phase = 'idle' | 'committing' | 'feedback-correct' | 'feedback-wrong' | 'advancing';

const FLASH_MS = 500;

const Play = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const assignmentId = searchParams.get("assignmentId") || undefined;
  const skillFocus = searchParams.get("skillFocus") || undefined;
  // Admin override for dev/preview: supports top-level ?admin=1 in embedded preview via document.referrer
  const adminOverride = (() => {
    const urlParam = searchParams.get("admin") === "1";
    const envParam = (typeof process !== 'undefined' && (process as any).env?.VITE_FORCE_ADMIN === "1");
    const lsParam = (typeof localStorage !== 'undefined' && localStorage.getItem('force_admin') === '1');
    let refParam = false;
    try {
      if (typeof document !== 'undefined' && document.referrer) {
        const u = new URL(document.referrer);
        refParam = u.searchParams.get('admin') === '1';
      }
    } catch {
      // Ignore URL parsing errors (invalid referrer)
    }
    return urlParam || envParam || lsParam || refParam;
  })();
  
  const [course, setCourse] = useState<(Course & { _metadata?: { dataSource: 'live' | 'mock', etag?: string } }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skillFocusEmpty, setSkillFocusEmpty] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [showVersionBanner, setShowVersionBanner] = useState(false);
  const itemStartTime = useRef<number>(Date.now());
  const [koLabel, setKoLabel] = useState<string | null>(null);
  const mcp = useMCP();
  
  // Parse level from URL, default to 1
  const getLevelFromUrl = (course: Course | null): number => {
    const levelParam = searchParams.get("level");
    if (!levelParam || !course) return 1;
    
    const parsed = parseInt(levelParam, 10);
    if (isNaN(parsed)) return 1;
    
    // Validate level exists in course.levels (from JSON with fallback)
    const courseLevels = course.levels && course.levels.length > 0 
      ? course.levels 
      : [{ id: 1, title: "All Content", start: 0, end: 0 }];
    
    const levelExists = courseLevels.some(l => l.id === parsed);
    return levelExists ? parsed : 1;
  };
  
  const [currentLevel, setCurrentLevel] = useState<number>(1);
  
  const sessionStore = useSessionStore();

  // If a skillFocus (koId) is provided, filter the course to only items mapped to that KO.
  // We create a derived course with filtered items and empty levels to trigger fallback (all groups).
  const effectiveCourse = useMemo(() => {
    if (!course || !skillFocus) return course;
    if (!course.items || !Array.isArray(course.items)) {
      console.error('[Play] Course has no items array:', course);
      return course;
    }
    const filtered = course.items.filter((it: any) => it.learningObjectiveId === skillFocus);
    setSkillFocusEmpty(filtered.length === 0);
    return {
      ...course,
      // force fallback level (all content), so filtered items are not excluded by level guards
      levels: [],
      items: filtered,
    } as Course;
  }, [course, skillFocus]);

  const [gameState, gameActions] = useGameState(effectiveCourse, currentLevel);
  
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined);
  const [isCorrect, setIsCorrect] = useState<boolean | undefined>(undefined);
  const [showWrongModal, setShowWrongModal] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [frozenItem, setFrozenItem] = useState(gameState.currentItem);
  const [showHint, setShowHint] = useState(false);
  const [currentHint, setCurrentHint] = useState<string | undefined>(undefined);

  // Preload all course images in the background once the course and first item are ready
  useCoursePreloader(course);

  // Resolve KO label for Skill Focus chip
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!skillFocus) { setKoLabel(null); return; }
      const ko = await mcp.call<{ name?: string }>('getKnowledgeObjective', { id: skillFocus });
      if (!cancelled) setKoLabel(ko?.name ?? null);
    })();
    return () => { cancelled = true; };
  }, [skillFocus]);

  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(getTTSPreference());
  const hasTTS = isTTSAvailable();

  // Category mode state (legacy mode showing group buttons)
  const [categoryMode, setCategoryMode] = useState(false);
  
  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Offline queue state
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [queuedAttempts, setQueuedAttempts] = useState(0);

  // Safety valve: ensure the correct overlay never hangs indefinitely
  // If for any reason phase stays on 'feedback-correct', force-clear after a short delay
  useEffect(() => {
    if (phase === 'feedback-correct') {
      const timer = setTimeout(() => {
        // Only auto-clear if still stuck on feedback-correct
        setPhase((p) => (p === 'feedback-correct' ? 'idle' : p));
      }, FLASH_MS + 400); // small cushion beyond intended flash time
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // Update frozen item when current item changes and we're idle
  useEffect(() => {
    if (phase === 'idle' && gameState.currentItem) {
      setFrozenItem(gameState.currentItem);
    }
  }, [gameState.currentItem, phase]);
  const distinctItemsRef = useRef(new Set<number>());
  const finalScoreRef = useRef<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs for accessing current state in embed listener without re-registering
  const gameStateRef = useRef(gameState);
  const selectedIndexRef = useRef(selectedIndex);
  const isCorrectRef = useRef(isCorrect);

  // Update refs when state changes
  useEffect(() => {
    gameStateRef.current = gameState;
    selectedIndexRef.current = selectedIndex;
    isCorrectRef.current = isCorrect;
  }, [gameState, selectedIndex, isCorrect]);

  // Embed mode: post ready, setup resize observer, and listen for host commands
  useEffect(() => {
    if (!isEmbed()) return;

    // Post ready event
    postToHost({ type: "ready", payload: { version: "1.0" } });

    // Listen for host commands and session updates
    const handleMessage = async (e: MessageEvent) => {
      // Handle session updates
      if (e.data?.type === "supabase:setSession") {
        try {
          const { access_token, refresh_token } = e.data.payload;
          if (access_token && refresh_token) {
            await supabaseClient.auth.setSession({
              access_token,
              refresh_token,
            });
            console.info("[Play] Session set from parent frame");
          }
        } catch (err) {
          console.warn("[Play] Failed to set session from parent:", err);
        }
      }

      // Handle host commands
      if (e.data?.type === "command") {
        const { action, index } = e.data.payload;
        
        switch (action) {
          case "next":
            // Only advance if on a correct answer (using refs for current state)
            if (selectedIndexRef.current !== undefined && isCorrectRef.current === true) {
              stopTTS();
              gameActions.advanceToNext();
              setSelectedIndex(undefined);
              setIsCorrect(undefined);
              setFeedbackMessage("");
              itemStartTime.current = Date.now();
            }
            break;
            
          case "quit":
            // Navigate to a thanks page when embedded
            stopTTS();
            navigate("/embed/thanks", { replace: true });
            break;
            
          case "focusOption": {
            // Focus on the specified option (0-based index)
            if (typeof index === "number" && index >= 0 && gameStateRef.current?.currentItem) {
              const optionButtons = document.querySelectorAll('[role="button"][aria-label*="Option"]');
              const targetButton = optionButtons[index] as HTMLElement;
              if (targetButton) {
                targetButton.focus();
              }
            }
            break;
          }
            
          case "getStats": {
            // Return current stats snapshot (using ref for current state)
            const currentState = gameStateRef.current;
            postToHost({
              type: "stats",
              payload: {
                score: currentState.score,
                mistakes: currentState.mistakes,
                level: currentState.level,
                itemsRemaining: currentState.pool.length,
                elapsedSeconds: currentState.elapsedTime,
              },
            });
            break;
          }
        }
      }
    };

    listenHost(handleMessage);

    // Set up ResizeObserver
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        postToHost({ 
          type: "resize", 
          payload: { height: entry.contentRect.height } 
        });
      }
    });

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [navigate, gameActions]);

  // Subscribe to catalog_updates for this course and show refresh banner
  useEffect(() => {
    if (!courseId) return;
    const channel = supabaseClient
      .channel('catalog-updates-play')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'catalog_updates' },
        (payload: any) => {
          if (payload?.new?.course_id === courseId) {
            setShowVersionBanner(true);
          }
        }
      )
      .subscribe();
    return () => { supabaseClient.removeChannel(channel); };
  }, [courseId]);

  // Load course data and start session
  useEffect(() => {
    if (!courseId) return;

    const loadCourse = async () => {
      try {
        setLoading(true);
        const data = await mcp.getCourse(courseId) as Course;
        setCourse(data);
        
        // Get level from URL (after course is loaded)
      const level = getLevelFromUrl(data);
      setCurrentLevel(level);
        
        // Check for content version update
        const storageKey = `course:${courseId}:version`;
        const lastVersion = localStorage.getItem(storageKey);
        
        if (lastVersion && lastVersion !== data.contentVersion) {
          console.info("[Play] Content version changed", { lastVersion, newVersion: data.contentVersion });
          setShowVersionBanner(true);
          // Auto-hide banner after 5 seconds
          setTimeout(() => setShowVersionBanner(false), 5000);
        }
        
        // Update stored version
        if (data.contentVersion) {
          localStorage.setItem(storageKey, data.contentVersion);
        }
        
        // Start a new round with selected level
        console.info("[Play] Starting round", { courseId, level, contentVersion: data.contentVersion, assignmentId });
        const roundData = await mcp.startGameRound(courseId, level, assignmentId, data.contentVersion);
        sessionStore.startSession(courseId, level, roundData.sessionId, roundData.roundId);
        
        // Post round:start event to embed parent
        if (isEmbed()) {
          postToHost({
            type: "round:start",
            payload: {
              courseId,
              roundId: roundData.roundId,
              assignmentId,
            },
          });
        }
        
        // Reset item tracking
        distinctItemsRef.current.clear();
        itemStartTime.current = Date.now();
        
        console.info(`[Play] Round started: ${roundData.roundId}`);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load course");
      } finally {
        setLoading(false);
      }
    };

    loadCourse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, searchParams]); // Re-run when courseId or level changes

  // Set up offline queue auto-flush
  useEffect(() => {
    const cleanup = setupAutoFlush(mcp.logGameAttempt);
    
    // Update queue size on load
    setQueuedAttempts(getQueueSize());
    
    return cleanup;
  }, []);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      console.info("[Play] Connection restored");
      setIsOnline(true);
      // Update queue size after flush
      setTimeout(() => {
        setQueuedAttempts(getQueueSize());
      }, 1000);
    };
    
    const handleOffline = () => {
      console.warn("[Play] Connection lost");
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Speak current item when it changes and TTS is enabled
  useEffect(() => {
    if (ttsEnabled && frozenItem && phase === 'idle') {
      const stem = frozenItem.text;
      
      let fullText = stem;
      if (frozenItem.mode === 'numeric') {
        fullText += '. Enter a numeric answer.';
      } else {
        const optionsText = frozenItem.options
          .map((opt, idx) => `Option ${idx + 1}: ${opt}`)
          .join('. ');
        fullText = `${stem}. ${optionsText}`;
      }
      
      // Small delay to ensure screen reader announcements complete first
      setTimeout(() => {
        speak(fullText, { rate: 0.9 });
      }, 100);
    }
    
    return () => {
      // Stop speech when unmounting or item changes
      stopTTS();
    };
  }, [frozenItem, ttsEnabled, phase]);

  // Handle ESC key to stop speech
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopTTS();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Toggle TTS and persist preference
  const toggleTTS = () => {
    const newValue = !ttsEnabled;
    setTtsEnabled(newValue);
    setTTSPreference(newValue);
    
    // Stop any current speech when disabling
    if (!newValue) {
      stopTTS();
    }
  };

  // Toggle category mode
  const toggleCategoryMode = () => {
    setCategoryMode(!categoryMode);
  };

  // Handle group selection in category mode (for display only)
  const handleGroupSelect = (groupId: number) => {
    console.log(`[Play] Group ${groupId} selected in category mode`);
    // Category mode is display-only, no action taken
  };

  // Handle option selection (for options mode) or numeric submission (for numeric mode)
  const handleSelect = async (indexOrValue: number) => {
    if (phase !== 'idle' || !frozenItem || !sessionStore.roundId) return;

    // Lock inputs immediately
    setPhase('committing');
    stopTTS();
    
    const latencyMs = Date.now() - itemStartTime.current;
    
    // Determine if this is numeric or option mode
    const isNumericMode = frozenItem.mode === 'numeric';
    let isCorrect: boolean;
    let selectedIndex: number;
    
    if (isNumericMode) {
      // Numeric mode: compare value with answer
      isCorrect = frozenItem.answer !== undefined && Math.abs(indexOrValue - frozenItem.answer) < 0.001;
      selectedIndex = -1; // No index for numeric mode
    } else {
      // Options mode: check if selected index is correct
      selectedIndex = indexOrValue;
      isCorrect = selectedIndex === frozenItem.correctIndex;
    }
    
    // Process answer (updates pool but doesn't advance)
    // For numeric mode: pass correctIndex only if correct, otherwise pass impossible value (999)
    const result = gameActions.processAnswer(
      isNumericMode 
        ? (isCorrect ? frozenItem.correctIndex : 999) // 999 will never match correctIndex
        : selectedIndex
    );
    setSelectedIndex(selectedIndex);
    setIsCorrect(isCorrect);

    // Track distinct items
    distinctItemsRef.current.add(frozenItem.id);

    // Set feedback message for screen readers
    if (isCorrect) {
      setFeedbackMessage("Correct! Well done.");
      // Show correct feedback immediately
      setPhase('feedback-correct');
    } else {
      const correctAnswer = isNumericMode 
        ? frozenItem.answer?.toString() || 'unknown'
        : result.correctAnswer;
      setFeedbackMessage(`Incorrect. The correct answer is ${correctAnswer}.`);
      // Show wrong feedback immediately
      setPhase('feedback-wrong');
    }

    // Check if this is the last item
    const isLastItem = result.gameEnded;

    // Log attempt asynchronously (don't block UI feedback)
    const logPromise = (async () => {
      try {
        console.info("[Play] Logging attempt", { 
          itemId: frozenItem.id, 
          isCorrect, 
          isLastItem,
          latencyMs 
        });
        
        const attemptResult = await mcp.logGameAttempt(
          sessionStore.roundId!,
          frozenItem.id,
          isCorrect,
          latencyMs,
          isLastItem, // finalize
          isNumericMode ? 0 : selectedIndex,
          `${frozenItem.id}:${frozenItem.clusterId}:${frozenItem.variant}`,
          undefined // idempotencyKey
        );

        // If correct and we have a skill focus + user, update mastery (fire-and-forget)
        if (isCorrect && skillFocus) {
          try {
            const { data } = await supabaseClient.auth.getUser();
            const studentId = data.user?.id;
            if (studentId) {
              await mcp.updateMastery({
                studentId,
                koId: skillFocus,
                exerciseScore: 1.0,
                weight: 1.0,
              });
            }
          } catch (e) {
            console.warn("[Play] updateMastery skipped:", e);
          }
        }
        
        // Post attempt event to embed parent
        if (isEmbed() && courseId) {
          postToHost({
            type: "attempt",
            payload: {
              roundId: sessionStore.roundId,
              itemId: frozenItem.id,
              correct: isCorrect,
              answerIndex: isNumericMode ? indexOrValue : selectedIndex,
            },
          });
        }
        
        // Store final score if returned
        if (attemptResult.final?.finalScore !== undefined) {
          finalScoreRef.current = attemptResult.final.finalScore;
          
          // Post round:end event to embed parent
          if (isEmbed()) {
            postToHost({
              type: "round:end",
              payload: {
                roundId: sessionStore.roundId,
                finalScore: attemptResult.final.finalScore,
                mistakes: gameState.mistakes,
                durationMs: gameState.elapsedTime * 1000,
              },
            });
          }
        }
        
        if (isLastItem) {
          console.info("[Play] ✓ Final attempt logged with round end", {
            finalScore: finalScoreRef.current
          });
        } else {
          console.info("[Play] ✓ Attempt logged");
        }
      } catch (err) {
        console.error("[Play] Failed to log attempt:", err);
      }
      
      // Update queued attempts count
      setQueuedAttempts(getQueueSize());
    })();

    if (result.isCorrect) {
      // Fire-and-forget logging; cap visual flash strictly to FLASH_MS
      logPromise.catch(() => {/* handled inside logPromise */});

      await new Promise(resolve => setTimeout(resolve, FLASH_MS));
      
      if (result.gameEnded) {
        // Game ended - will navigate via useEffect
        setPhase('idle');
      } else {
        setPhase('advancing');
        gameActions.advanceToNext();
        setSelectedIndex(undefined);
        setIsCorrect(undefined);
        setFeedbackMessage("");
        itemStartTime.current = Date.now();
        setPhase('idle');
      }
    } else {
      // Show wrong modal; wait for logging to complete before allowing advance
      setShowWrongModal(true);
      await logPromise;
    }
  };

  // Handle closing wrong modal
  const handleCloseWrongModal = () => {
    setShowWrongModal(false);
    
    // Advance to next item after modal closes
    setPhase('advancing');
    gameActions.advanceToNext();
    setSelectedIndex(undefined);
    setIsCorrect(undefined);
    setFeedbackMessage("");
    itemStartTime.current = Date.now();
    setPhase('idle');
  };

  // Handle game completion - navigate to results
  useEffect(() => {
    if (gameState.isComplete && course && courseId && sessionStore.roundId) {
      console.info("[Play] Round completed - navigating to results", {
        roundId: sessionStore.roundId,
        score: gameState.score,
        mistakes: gameState.mistakes,
        distinctItems: distinctItemsRef.current.size
      });
      sessionStore.endSession();
      
      const accuracy = gameState.poolSize > 0
        ? Math.round((gameState.score / (gameState.score + gameState.mistakes)) * 100)
        : 0;

      // Navigate to results with state
      navigate("/results", {
        state: {
          courseId,
          courseTitle: course.title,
          level: gameState.level,
          score: gameState.score,
          mistakes: gameState.mistakes,
          elapsedSeconds: gameState.elapsedTime,
          accuracy,
          finalScore: finalScoreRef.current,
        },
        replace: true,
      });
    }
  }, [gameState.isComplete, course, courseId, gameState.level, gameState.score, gameState.mistakes, gameState.elapsedTime, gameState.poolSize, sessionStore.roundId, navigate, sessionStore]);

  // Handle level change
  const handleLevelChange = async (newLevel: string) => {
    if (!course || !courseId) return;
    
    const levelNum = parseInt(newLevel, 10);
    if (isNaN(levelNum)) return;
    
    try {
      // Update URL
      const newParams = new URLSearchParams(searchParams);
      newParams.set("level", newLevel);
      if (assignmentId) {
        newParams.set("assignmentId", assignmentId);
      }
      setSearchParams(newParams, { replace: true });
      
      // Start a new round with new level
      console.info("[Play] Changing level", { courseId, level: levelNum, contentVersion: course.contentVersion, assignmentId });
      const roundData = await mcp.startGameRound(courseId, levelNum, assignmentId, course?.contentVersion);
      sessionStore.startSession(courseId, levelNum, roundData.sessionId, roundData.roundId);
      
      // Post round:start event to embed parent
      if (isEmbed()) {
        postToHost({
          type: "round:start",
          payload: {
            courseId,
            roundId: roundData.roundId,
            assignmentId,
          },
        });
      }
      
      // Reset game state and tracking
      gameActions.reset();
      distinctItemsRef.current.clear();
      finalScoreRef.current = undefined;
      itemStartTime.current = Date.now();
      setFeedbackMessage("");
      setCurrentLevel(levelNum);
      
      console.info(`[Play] ✓ Level changed: ${roundData.roundId}`);
    } catch (err) {
      console.error("[Play] Failed to change level:", err);
      setError(err instanceof Error ? err.message : "Failed to change level");
    }
  };

  // Handle reset/play again
  const handlePlayAgain = async () => {
    if (!course || !courseId) return;
    
    try {
      // Start a new round
      const level = currentLevel;
      console.info("[Play] Restarting round", { courseId, level, contentVersion: course.contentVersion, assignmentId });
      const roundData = await mcp.startGameRound(courseId, level, assignmentId, course?.contentVersion);
      sessionStore.startSession(courseId, level, roundData.sessionId, roundData.roundId);
      
      // Post round:start event to embed parent
      if (isEmbed()) {
        postToHost({
          type: "round:start",
          payload: {
            courseId,
            roundId: roundData.roundId,
            assignmentId,
          },
        });
      }
      
      // Reset game state and tracking
      gameActions.reset();
      distinctItemsRef.current.clear();
      finalScoreRef.current = undefined;
      itemStartTime.current = Date.now();
      setFeedbackMessage("");
      
      console.info(`[Play] ✓ New round started: ${roundData.roundId}`);
    } catch (err) {
      console.error("[Play] Failed to start new round:", err);
      setError(err instanceof Error ? err.message : "Failed to start new round");
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <div className="inline-flex p-6 rounded-2xl bg-primary/10 mb-4 animate-pulse">
            <Trophy className="h-12 w-12 text-primary" />
          </div>
          <p className="text-xl font-medium">Loading course...</p>
          <p className="text-sm text-muted-foreground mt-2">
            Mode: {getApiMode()}
          </p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-destructive/5 via-background to-destructive/5 flex items-center justify-center p-6">
        <div className="text-center max-w-md" role="alert">
          <h1 className="text-2xl font-bold mb-4">Error Loading Course</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => navigate("/courses")}>
            <Home className="h-4 w-4 mr-2" />
            Back to Courses
          </Button>
        </div>
      </div>
    );
  }

  // Render game state
  return (
    <div 
      ref={containerRef}
      className="play-root w-full bg-gradient-to-br from-primary/5 via-background to-accent/5 p-2 sm:p-3 md:p-4 rounded-xl"
    >
      <SkipLink />
      {showVersionBanner && (
        <div className="mb-2 rounded-md bg-amber-100 text-amber-900 px-3 py-2 text-sm flex items-center justify-between" role="status">
          <span>New course version available.</span>
          <button className="underline" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
      <FeedbackAnnouncer message={feedbackMessage} />
      
      <div className="w-full max-w-5xl mx-auto h-full flex flex-col overflow-hidden">{/* Container for content */}
        {/* Sidebar Toggle Button */}
        <Button
          variant="outline"
          size="sm"
          className="fixed top-4 left-4 z-30 h-10 w-10 p-0 shadow-lg"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Game Sidebar */}
        <GameSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          courseTitle={course?.title || ""}
          currentLevel={currentLevel}
          levels={course?.levels && course.levels.length > 1 ? course.levels : undefined}
          onLevelChange={handleLevelChange}
          levelChangeDisabled={selectedIndex !== undefined}
          dataSource={course?._metadata?.dataSource}
          studyTexts={course?.studyTexts}
          currentItemRelatedIds={frozenItem?.relatedStudyTextIds}
          score={gameState.score}
          mistakes={gameState.mistakes}
          itemsRemaining={gameState.pool.length}
          elapsedTime={gameState.elapsedTime}
          ttsEnabled={ttsEnabled}
          hasTTS={hasTTS}
          onToggleTTS={toggleTTS}
          categoryMode={categoryMode}
          onToggleCategoryMode={toggleCategoryMode}
          onExit={() => {
            const embedMode = isEmbed();
            if (embedMode) {
              postToHost({ type: "exit", payload: {} });
              window.close();
              setTimeout(() => {
                window.location.replace("/courses");
              }, 100);
            } else {
              navigate("/courses");
            }
          }}
        />

        {/* Progress Bar */}
        <div className="mb-2 flex-shrink-0">
          <ProgressBar progress={gameState.progress} />
          {skillFocus && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-1">
                <Target className="h-3 w-3" /> Skill Focus
              </span>
              <span className="text-muted-foreground">Skill: {koLabel ?? skillFocus}</span>
              {skillFocusEmpty && (
                <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-100 text-amber-900 px-2 py-1">
                  No exercises in this course for this skill.
                  <button
                    className="underline ml-1"
                    onClick={() => navigate(`/courses?recommendedFor=${encodeURIComponent(skillFocus)}`)}
                  >
                    See recommended courses
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Admin quick-edit overlay (visible in dev/preview override) */}
        {adminOverride && courseId && (
          <a
            href={`/admin/editor/${courseId}${frozenItem?.id ? `?itemId=${frozenItem.id}` : ''}`}
            className="fixed top-4 right-20 z-50 bg-purple-600 text-white px-3 py-1 rounded shadow hover:bg-purple-700"
            title="Edit item in course editor"
          >
            Edit item{frozenItem?.id ? '' : ' (course)'}
          </a>
        )}
        {adminOverride && (
          <div className="fixed top-4 right-4 z-50 text-[11px] bg-black/70 text-white px-2 py-1 rounded">
            Admin mode
          </div>
        )}
        
        {/* Game Area */}
        <main id="main-game-area" tabIndex={-1} className="flex-1 min-h-0 overflow-hidden">
          {frozenItem && (
            <div className="flex flex-col items-center justify-start min-h-full gap-6 py-2">
              <Stem
                  text={(frozenItem as any)?.stem?.text || frozenItem.text}
                  stimulus={frozenItem.stimulus}
                  stemMedia={(frozenItem as any)?.stem?.media || null}
                  courseTitle={course?.title}
                  itemId={frozenItem.id}
                  cacheKey={course?.contentVersion || (course as any)?._metadata?.etag}
                  courseId={courseId}
                />

              {/* Hint button */}
              <div className="w-full max-w-5xl mx-auto -mt-2 -mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="btn-hint"
                  onClick={async () => {
                    try {
                    // If hint already present, just reveal it
                    if ((frozenItem as any)?.hint) {
                      setCurrentHint((frozenItem as any).hint as string);
                      setShowHint(true);
                      return;
                    }
                    const json = await mcp.call<any>('lms.generateHint', { courseId, itemId: frozenItem.id });
                    const hintText = String(json?.hint || '');
                    setCurrentHint(hintText);
                    setShowHint(true);
                    console.info('[Play] Hint generated');
                    // Best-effort cache invalidation; log instead of silent swallow
                    try {
                      if (courseId) {
                        const mod = await import("@/lib/utils/cacheInvalidation");
                        await mod.invalidateCourseCache(courseId);
                      }
                    } catch (cacheError) {
                      console.warn('[Play] Cache invalidation skipped', cacheError);
                    }
                    } catch (e) {
                      console.warn('[Play] Hint error', e);
                    (window as any)?.__toast?.error?.('Hint error');
                    }
                  }}
                >
                  Need a hint?
                </Button>
              </div>
              {showHint && (currentHint || (frozenItem as any)?.hint) && (
                <div className="w-full max-w-5xl mx-auto -mt-4">
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <span className="font-medium">Hint:</span>{' '}
                    <span>{currentHint || (frozenItem as any).hint}</span>
                  </div>
                </div>
              )}

              {categoryMode ? (
                // Category mode: Show group buttons (legacy mode)
                <GroupGrid
                  groups={course?.groups || []}
                  visibleGroupIds={gameState.visibleGroups}
                  onSelectGroup={handleGroupSelect}
                  disabled={phase !== 'idle'}
                />
              ) : frozenItem.mode === 'numeric' ? (
                // Numeric mode: Show numeric pad
                <NumericPad
                  onSubmit={handleSelect}
                  disabled={phase !== 'idle'}
                  phase={phase}
                />
              ) : frozenItem.mode === 'visual-mcq' ? (
                <VisualMCQ item={frozenItem} onSelect={handleSelect} selectedIndex={selectedIndex} showFeedback={phase !== 'idle'} isCorrect={isCorrect} />
              ) : frozenItem.mode === 'audio-mcq' ? (
                <AudioMCQ item={frozenItem} onSelect={handleSelect} selectedIndex={selectedIndex} showFeedback={phase !== 'idle'} isCorrect={isCorrect} />
              ) : frozenItem.mode === 'video-prompt' ? (
                <VideoPrompt item={frozenItem} onSelect={handleSelect} selectedIndex={selectedIndex} showFeedback={phase !== 'idle'} isCorrect={isCorrect} />
              ) : frozenItem.mode === 'drag-drop' ? (
                <DragDropClassify item={frozenItem} onComplete={() => handleSelect(0)} />
              ) : frozenItem.mode === 'matching' ? (
                <MatchingPairs item={frozenItem} onComplete={() => handleSelect(0)} />
              ) : frozenItem.mode === 'ordering' ? (
                <OrderingSequence item={frozenItem} onSubmit={() => handleSelect(0)} />
              ) : frozenItem.mode === 'diagram-label' ? (
                <DiagramLabeling item={frozenItem} onSubmit={() => handleSelect(0)} />
              ) : frozenItem.mode === 'manipulative' ? (
                <ManipulativeNumeric item={frozenItem} onSubmit={(value) => handleSelect(value)} />
              ) : frozenItem.mode === 'graph-interpret' ? (
                <GraphInterpretation item={frozenItem} onSelect={handleSelect} />
              ) : frozenItem.mode === 'timed-fluency' ? (
                <TimedFluency items={[frozenItem]} duration={60} onComplete={() => handleSelect(0)} />
              ) : (
                // Default: Options mode
                <OptionGrid
                  options={frozenItem?.options || []}
                  onSelect={handleSelect}
                  disabled={phase !== 'idle'}
                  selectedIndex={selectedIndex}
                  isCorrect={isCorrect}
                  phase={phase}
                  itemId={frozenItem?.id}
                  clusterId={frozenItem?.clusterId}
                  variant={frozenItem?.variant}
                  optionMedia={frozenItem?.optionMedia || []}
                  courseTitle={course?.title}
                  cacheKey={course?.contentVersion || (course as any)?._metadata?.etag}
                  courseId={courseId}
                />
              )}
            </div>
          )}
        </main>

        {/* Wrong Answer Modal */}
        {frozenItem && (
          <WrongModal
            open={showWrongModal}
            onClose={handleCloseWrongModal}
            item={frozenItem}
          />
        )}

        {/* Correct Answer Flash */}
        {phase === 'feedback-correct' && <CorrectFlash />}
      </div>
    </div>
  );
};

// Wrap with error boundary for production resilience
const PlayWithErrorBoundary = () => (
  <PlayErrorBoundary>
    <Play />
  </PlayErrorBoundary>
);

export default PlayWithErrorBoundary;

