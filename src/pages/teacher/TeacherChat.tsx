import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";
import styles from "./TeacherChat.module.css";

import type { TeacherChatAssistantResponse } from "@/lib/types/edge-functions";

type Scope = "all" | "materials" | "mes";
type ActiveTab = "lesplan" | "materials" | "sources";

type TeacherChatOkResponse = Extract<TeacherChatAssistantResponse, { ok: true }>;
type Citation = TeacherChatOkResponse["citations"][number];
type Recommendation = NonNullable<TeacherChatOkResponse["recommendations"]>[number];
type LessonPlan = NonNullable<TeacherChatOkResponse["lessonPlan"]>;
type KdCheck = NonNullable<TeacherChatOkResponse["kdCheck"]>;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  recommendations?: Recommendation[];
  lessonPlan?: LessonPlan;
  kdCheck?: KdCheck;
  requestId?: string;
};

type SavedLessonKit = {
  id: string;
  values: Record<string, unknown>;
};

function normalizeScope(v: unknown): Scope {
  const s = String(v || "").toLowerCase().trim();
  if (s === "materials" || s === "mes" || s === "all") return s;
  return "all";
}

function materialLabel(m: Record<string, unknown>): string {
  const title = typeof m.title === "string" ? m.title : "";
  const file = typeof (m as any).file_name === "string" ? String((m as any).file_name) : "";
  const id = typeof m.id === "string" ? m.id : "";
  return title || file || id || "(untitled)";
}

function safeText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function buildKdCheck(kdCode: string): KdCheck {
  const code = String(kdCode || "").toUpperCase().trim();
  const mapping: Record<string, string[]> = {
    "B1-K1-W2": [
      "Zorgplan opstellen/bijstellen → Casus met veranderende situatie",
      "Eigen regie zorgvrager → Afstemming met zorgvrager besproken",
      "Signaleren en analyseren → Observatie en rapportage",
      "SMART-doelen → Concrete aanpassingen formuleren",
    ],
    "B1-K1-W3": [
      "Zorginterventies uitvoeren → Praktijkoefening opgenomen",
      "Eigen regie stimuleren → Toestemming vragen besproken",
      "Veiligheid waarborgen → Protocol en checklist gebruikt",
      "Rapportage → Vastleggen na handeling",
    ],
    "B1-K1-W5": [
      "Acute situaties herkennen → ABCDE-methodiek centraal",
      "Alarmprocedure → Wanneer hulp inschakelen",
      "Veiligheid inschatten → Gevaar voor zelf/anderen",
      "Praktijkgericht → Simulatieoefening",
    ],
    "B1-K2-W2": [
      "Samenwerken met professionals → Rollenspel MDO/overdracht",
      "Professionele communicatie → SBAR-structuur",
      "Informatieoverdracht → Telefoongesprek simulatie",
      "Afstemmen afspraken → Vastleggen in zorgplan",
    ],
    "B1-K3-W2": [
      "Reflecteren op werkzaamheden → STARR-methode",
      "Verbeterpunten formuleren → Concrete acties",
      "Professionele ontwikkeling → Portfolio/stagegesprek",
      "Feedback ontvangen → Peer feedback",
    ],
  };

  const defaultItems = [
    "Leerdoel sluit aan bij het KD",
    "Werkvormen zijn activerend en praktijkgericht",
    "Beoordeling/observatie is duidelijk (wat laat de student zien?)",
    "Reflectie of evaluatie is opgenomen",
  ];

  const items = (mapping[code] || defaultItems).map((text) => ({ ok: true, text }));
  const passed = items.filter((i) => i.ok).length;
  return {
    code: code || "KD-ONBEKEND",
    items,
    score: { passed, total: items.length },
  };
}

const SUGGESTIONS: Array<{ cta: string; label: string; prompt: string }> = [
  {
    cta: "cta-teachergpt-chat-suggestion-b1-k1-w2",
    label: "B1-K1-W2 Zorgplan",
    prompt: "Maak een lesplan (50 min) voor KD B1-K1-W2 (zorgplan opstellen/bijstellen) met een korte casus, activerende werkvorm en reflectie.",
  },
  {
    cta: "cta-teachergpt-chat-suggestion-b1-k1-w3",
    label: "B1-K1-W3 Interventies",
    prompt: "Maak een lesplan (50 min) voor KD B1-K1-W3 (zorginterventies) met veiligheid, eigen regie, en rapportage als vaste onderdelen.",
  },
  {
    cta: "cta-teachergpt-chat-suggestion-b1-k1-w5",
    label: "B1-K1-W5 ABCDE",
    prompt: "Maak een lesplan (50 min) voor KD B1-K1-W5 met ABCDE-methodiek en een simulatie-oefening (acute situatie).",
  },
  {
    cta: "cta-teachergpt-chat-suggestion-b1-k2-w2",
    label: "B1-K2-W2 SBAR",
    prompt: "Maak een lesplan (50 min) voor KD B1-K2-W2 over samenwerken + SBAR-overdracht met rollenspel en beoordelingscriteria.",
  },
  {
    cta: "cta-teachergpt-chat-suggestion-b1-k3-w2",
    label: "B1-K3-W2 Reflectie",
    prompt: "Maak een lesplan (50 min) voor KD B1-K3-W2 met STARR-reflectie, feedbackmoment en concrete verbeteracties.",
  },
];

export default function TeacherChat() {
  const mcp = useMCP();

  const [scope, setScope] = useState<Scope>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [materials, setMaterials] = useState<Array<Record<string, unknown>>>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialId, setMaterialId] = useState<string>("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("lesplan");
  const [openSections, setOpenSections] = useState<{
    quickStart: boolean;
    teacherScript: boolean;
    discussion: boolean;
    groupWork: boolean;
    kdCheck: boolean;
  }>({
    quickStart: true,
    teacherScript: true,
    discussion: false,
    groupWork: false,
    kdCheck: true,
  });

  const [savedLessonKit, setSavedLessonKit] = useState<SavedLessonKit | null>(null);
  const [savingLessonKit, setSavingLessonKit] = useState(false);
  const [savingKdCheck, setSavingKdCheck] = useState(false);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refreshMaterials = useCallback(async () => {
    setLoadingMaterials(true);
    try {
      const res: any = await mcp.listRecords("library-material", 50);
      if (!res || res.ok !== true) {
        throw new Error(typeof res?.error?.message === "string" ? res.error.message : "Failed to load materials");
      }
      setMaterials(Array.isArray(res.records) ? res.records : []);
    } catch (e) {
      toast.error("Failed to load materials", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoadingMaterials(false);
    }
  }, [mcp]);

  useEffect(() => {
    void refreshMaterials();
  }, [refreshMaterials]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  const latestAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === "assistant") return m;
    }
    return null;
  }, [messages]);

  const currentLessonPlan = latestAssistant?.lessonPlan ?? null;
  const currentKdCheck = latestAssistant?.kdCheck ?? null;
  const currentRecommendations = Array.isArray(latestAssistant?.recommendations) ? latestAssistant?.recommendations ?? [] : [];
  const currentCitations = Array.isArray(latestAssistant?.citations) ? latestAssistant?.citations ?? [] : [];

  const selectedMaterial = useMemo(
    () => materials.find((m) => String(m.id || "") === String(materialId || "")) || null,
    [materials, materialId],
  );

  const onClear = useCallback(() => {
    setMessages([]);
    setDraft("");
    setError(null);
    setSavedLessonKit(null);
    setActiveTab("lesplan");
  }, []);

  const onUseMaterial = useCallback((id: string) => {
    if (!id) return;
    setScope("materials");
    setMaterialId(id);
    toast.success("Materiaal geselecteerd", { description: "Dit materiaal wordt gebruikt voor de volgende vraag." });
    inputRef.current?.focus();
  }, []);

  const toggleSection = useCallback(
    (key: keyof typeof openSections) => {
      setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [openSections],
  );

  const onSend = useCallback(async () => {
    setError(null);
    const text = draft.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const nextMessages: ChatMessage[] = [...messages, userMsg];
    setMessages(nextMessages);
    setDraft("");
    setSending(true);

    try {
      const resp: any = await mcp.teacherChatAssistant({
        messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        scope,
        materialId: scope !== "mes" ? (materialId || undefined) : undefined,
      });

      if (!resp || resp.ok !== true) {
        const msg =
          typeof resp?.error?.message === "string"
            ? resp.error.message
            : typeof resp?.error === "string"
              ? resp.error
              : "TeacherGPT chat failed";
        throw new Error(msg);
      }

      const okResp = resp as TeacherChatOkResponse;
      const lessonPlan: LessonPlan | undefined =
        okResp.lessonPlan && typeof okResp.lessonPlan === "object"
          ? (okResp.lessonPlan as LessonPlan)
          : undefined;
      const kdFromApi: KdCheck | undefined =
        okResp.kdCheck && typeof okResp.kdCheck === "object"
          ? (okResp.kdCheck as KdCheck)
          : undefined;
      const kdCheck =
        kdFromApi ?? (lessonPlan?.kdAlignment?.code ? buildKdCheck(String(lessonPlan.kdAlignment.code)) : undefined);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: safeText(okResp.answer) || "(empty response)",
        citations: Array.isArray(okResp.citations) ? okResp.citations : [],
        recommendations: Array.isArray(okResp.recommendations) ? okResp.recommendations : [],
        lessonPlan,
        kdCheck,
        requestId: safeText(okResp.requestId) || undefined,
      };

      // New lesson plan → require a fresh “Gebruiken” action to persist it.
      if (assistantMsg.lessonPlan) {
        setSavedLessonKit(null);
        setActiveTab("lesplan");
      }

      setMessages((prev) => [...prev, assistantMsg]);

      // Compat/backfill: older deployments returned empty citations/recommendations for lesson-plan flows.
      // If needed, do one extra retrieval call and attach results to the same assistant message so the right panel stays “1 klik”.
      const needsBackfill =
        !!assistantMsg.lessonPlan &&
        ((assistantMsg.citations?.length ?? 0) === 0 ||
          (scope !== "mes" && (assistantMsg.recommendations?.length ?? 0) === 0));

      if (needsBackfill) {
        try {
          const kd = assistantMsg.lessonPlan?.kdAlignment?.code ? String(assistantMsg.lessonPlan.kdAlignment.code) : "";
          const kdTitle = assistantMsg.lessonPlan?.kdAlignment?.title ? String(assistantMsg.lessonPlan.kdAlignment.title) : "";
          const focus = assistantMsg.lessonPlan?.quickStart?.oneLiner ? String(assistantMsg.lessonPlan.quickStart.oneLiner) : "";
          const retrievalQuery = [
            "Zoek materialen en bronnen die passen bij deze KD-focus.",
            kd ? `KD ${kd}` : null,
            kdTitle ? `(${kdTitle})` : null,
            focus ? `Focus: ${focus}.` : null,
          ]
            .filter(Boolean)
            .join(" ");

          const extra: any = await mcp.teacherChatAssistant({
            messages: [{ role: "user", content: retrievalQuery }],
            scope,
            materialId: scope !== "mes" ? (materialId || undefined) : undefined,
          });

          if (extra?.ok === true) {
            const extraCits: Citation[] = Array.isArray(extra.citations) ? extra.citations : [];
            const extraRecs: Recommendation[] = Array.isArray(extra.recommendations) ? extra.recommendations : [];

            if (extraCits.length || extraRecs.length) {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMsg.id) return m;
                  return {
                    ...m,
                    citations: extraCits.length ? extraCits : m.citations,
                    recommendations: extraRecs.length ? extraRecs : m.recommendations,
                  };
                }),
              );
            }
          }
        } catch (e) {
          console.warn("[TeacherChat] backfill retrieval failed:", e);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("e-Xpert SAM failed", { description: msg });
    } finally {
      setSending(false);
    }
  }, [draft, materialId, mcp, messages, scope, sending]);

  const onInputKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      void onSend();
    },
    [onSend],
  );

  const onUseLessonPlan = useCallback(async () => {
    if (!currentLessonPlan || savingLessonKit) return;
    setSavingLessonKit(true);
    try {
      const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const title = [
        "Lesplan",
        currentLessonPlan.kdAlignment.code ? `(${currentLessonPlan.kdAlignment.code})` : null,
        safeText(currentLessonPlan.quickStart?.oneLiner) ? `— ${safeText(currentLessonPlan.quickStart.oneLiner)}` : null,
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 140);

      const values: Record<string, unknown> = {
        title,
        status: "draft",
        locale: "nl-NL",
        material_id: scope !== "mes" ? (materialId || undefined) : undefined,
        source_course_id: currentCitations?.[0]?.course_id ? String(currentCitations[0].course_id) : undefined,
        kit: {
          kind: "teachergpt_lesson_plan_v1",
          createdAt: new Date().toISOString(),
          scope,
          query: lastUser,
          selectedMaterialId: materialId || undefined,
          lessonPlan: currentLessonPlan,
          recommendations: currentRecommendations,
          citations: currentCitations,
        },
        guard_report: currentKdCheck
          ? {
              kdCheck: currentKdCheck,
              verifiedAt: null,
            }
          : undefined,
      };

      const res: any = await mcp.saveRecord("lesson-kit", values);
      if (!res || res.ok !== true || typeof res.id !== "string") {
        throw new Error(typeof res?.error?.message === "string" ? res.error.message : "Failed to save lesson kit");
      }

      const id = String(res.id);
      setSavedLessonKit({ id, values: { ...values, id } });
      toast.success("Lesplan opgeslagen", { description: "Opgeslagen als Lesson Kit (draft)." });
    } catch (e) {
      toast.error("Opslaan mislukt", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingLessonKit(false);
    }
  }, [currentCitations, currentKdCheck, currentLessonPlan, currentRecommendations, materialId, mcp, messages, savingLessonKit, scope]);

  const onSaveKdCheck = useCallback(async () => {
    if (!currentKdCheck || savingKdCheck) return;
    if (!savedLessonKit) {
      toast.error("Nog niet opgeslagen", { description: "Klik eerst op ‘Gebruiken’ om een Lesson Kit aan te maken." });
      return;
    }

    setSavingKdCheck(true);
    try {
      const updated: Record<string, unknown> = {
        ...(savedLessonKit.values || {}),
        id: savedLessonKit.id,
        guard_report: {
          ...(typeof (savedLessonKit.values as any)?.guard_report === "object" ? (savedLessonKit.values as any).guard_report : {}),
          kdCheck: currentKdCheck,
          verifiedAt: new Date().toISOString(),
        },
      };

      const res: any = await mcp.saveRecord("lesson-kit", updated);
      if (!res || res.ok !== true) {
        throw new Error(typeof res?.error?.message === "string" ? res.error.message : "Failed to save verification");
      }

      setSavedLessonKit((prev) => (prev ? { ...prev, values: updated } : prev));
      toast.success("Verificatie opgeslagen", { description: `Lesson Kit: ${savedLessonKit.id}` });
    } catch (e) {
      toast.error("Verificatie opslaan mislukt", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingKdCheck(false);
    }
  }, [currentKdCheck, mcp, savedLessonKit, savingKdCheck]);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>eX</div>
          <div className={styles.brandText}>
            <div className={styles.title}>e-Xpert SAM</div>
            <div className={styles.subtitle}>Je lesplan in 1 klik</div>
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.scopeToggle} aria-label="Scope">
            <button
              type="button"
              className={[styles.scopeBtn, scope === "all" ? styles.scopeBtnActive : ""].join(" ")}
              onClick={() => setScope("all")}
              data-cta-id="cta-teachergpt-chat-scope-all"
              data-action="click"
            >
              Alles
            </button>
            <button
              type="button"
              className={[styles.scopeBtn, scope === "materials" ? styles.scopeBtnActive : ""].join(" ")}
              onClick={() => setScope("materials")}
              data-cta-id="cta-teachergpt-chat-scope-materials"
              data-action="click"
            >
              Materialen
            </button>
            <button
              type="button"
              className={[styles.scopeBtn, scope === "mes" ? styles.scopeBtnActive : ""].join(" ")}
              onClick={() => setScope("mes")}
              data-cta-id="cta-teachergpt-chat-scope-mes"
              data-action="click"
            >
              MES
            </button>
          </div>

          <button
            type="button"
            className={styles.btn}
            onClick={onClear}
            data-cta-id="cta-teachergpt-chat-clear"
            data-action="click"
          >
            Wissen
          </button>

          <button
            type="button"
            className={styles.btn}
            onClick={() => setSettingsOpen((v) => !v)}
            data-cta-id="cta-teachergpt-chat-settings-toggle"
            data-action="click"
            aria-expanded={settingsOpen}
          >
            ⚙️
          </button>
        </div>
      </header>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      {settingsOpen ? (
        <section className={styles.settings} aria-label="Settings">
          <div className={styles.settingsGrid}>
            <div className={styles.field}>
              <div className={styles.label}>Zoekomvang</div>
              <select
                className={styles.select}
                value={scope}
                onChange={(e) => setScope(normalizeScope(e.target.value))}
                data-cta-id="cta-teachergpt-chat-settings-scope"
                data-action="select"
              >
                <option value="all">Alles (Materialen + MES)</option>
                <option value="materials">Alleen Materialen</option>
                <option value="mes">Alleen MES</option>
              </select>
            </div>

            <div className={styles.field}>
              <div className={styles.label}>Materiaal (optioneel)</div>
              <div className={styles.selectRow}>
                <select
                  className={styles.select}
                  value={materialId}
                  onChange={(e) => setMaterialId(e.target.value)}
                  disabled={loadingMaterials || materials.length === 0}
                  data-cta-id="cta-teachergpt-chat-settings-material-select"
                  data-action="select"
                >
                  <option value="">(Alle materialen)</option>
                  {materials.map((m) => (
                    <option key={String(m.id)} value={String(m.id)}>
                      {materialLabel(m)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={refreshMaterials}
                  disabled={loadingMaterials}
                  data-cta-id="cta-teachergpt-chat-settings-material-refresh"
                  data-action="click"
                >
                  {loadingMaterials ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                </button>
              </div>
              {selectedMaterial ? (
                <div className={styles.muted}>
                  Selected: <strong>{materialLabel(selectedMaterial as any)}</strong>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <main className={styles.main}>
        <section className={styles.chat} aria-label="Chat">
          <div ref={messagesRef} className={styles.messages}>
            {messages.length ? (
              messages.map((m) => (
                <div key={m.id} className={[styles.bubble, m.role === "user" ? styles.bubbleUser : ""].join(" ")}>
                  <div className={styles.bubbleMeta}>{m.role === "user" ? "Jij" : "e-Xpert SAM"}</div>
                  {m.content}
                </div>
              ))
            ) : (
              <div className={styles.bubble}>
                <div className={styles.bubbleMeta}>e-Xpert SAM</div>
                Kies een suggestie of stel een vraag. Tip: begin met “Maak een lesplan…”
              </div>
            )}

            {sending ? (
              <div className={styles.bubble}>
                <div className={styles.bubbleMeta}>e-Xpert SAM</div>
                Typen…
              </div>
            ) : null}
          </div>

          <div className={styles.inputBar}>
            <div className={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.cta}
                  type="button"
                  className={styles.chip}
                  onClick={() => {
                    setDraft(s.prompt);
                    inputRef.current?.focus();
                  }}
                  data-cta-id={s.cta}
                  data-action="click"
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className={styles.row}>
              <input
                ref={inputRef}
                className={styles.input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Stel je vraag…"
                aria-label="Chat input"
                data-cta-id="cta-teachergpt-chat-input"
                data-action="edit"
              />
              <button
                type="button"
                className={[styles.btn, styles.btnPrimary].join(" ")}
                onClick={() => void onSend()}
                disabled={!draft.trim() || sending}
                data-cta-id="cta-teachergpt-chat-send"
                data-action="click"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verstuur"}
              </button>
            </div>
          </div>
        </section>

        <aside className={styles.side} aria-label="Side panel">
          <div className={styles.tabs} role="tablist" aria-label="Result tabs">
            <button
              type="button"
              className={[styles.tab, activeTab === "lesplan" ? styles.tabActive : ""].join(" ")}
              onClick={() => setActiveTab("lesplan")}
              data-cta-id="cta-teachergpt-chat-tab-lesplan"
              data-action="tab"
              role="tab"
              aria-selected={activeTab === "lesplan"}
            >
              Lesplan
            </button>
            <button
              type="button"
              className={[styles.tab, activeTab === "materials" ? styles.tabActive : ""].join(" ")}
              onClick={() => setActiveTab("materials")}
              data-cta-id="cta-teachergpt-chat-tab-materials"
              data-action="tab"
              role="tab"
              aria-selected={activeTab === "materials"}
            >
              Materialen
            </button>
            <button
              type="button"
              className={[styles.tab, activeTab === "sources" ? styles.tabActive : ""].join(" ")}
              onClick={() => setActiveTab("sources")}
              data-cta-id="cta-teachergpt-chat-tab-sources"
              data-action="tab"
              role="tab"
              aria-selected={activeTab === "sources"}
            >
              Bronnen
            </button>
          </div>

          <div className={styles.panel}>
            {activeTab === "lesplan" ? (
              currentLessonPlan ? (
                <>
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>
                      Lesplan (KD {safeText(currentLessonPlan.kdAlignment?.code)})
                    </h3>
                    <div className={styles.muted}>{safeText(currentLessonPlan.kdAlignment?.title)}</div>

                    <div className={styles.row} style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className={styles.btn}
                        onClick={() => window.print()}
                        data-cta-id="cta-teachergpt-chat-lesplan-print"
                        data-action="click"
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        className={[styles.btn, styles.btnPrimary].join(" ")}
                        onClick={() => void onUseLessonPlan()}
                        disabled={savingLessonKit}
                        data-cta-id="cta-teachergpt-chat-lesplan-use"
                        data-action="click"
                      >
                        {savingLessonKit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gebruiken"}
                      </button>
                    </div>

                    {savedLessonKit ? (
                      <div className={styles.muted} style={{ marginTop: 8 }}>
                        Opgeslagen als Lesson Kit: <strong>{savedLessonKit.id}</strong>
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.card}>
                    <button
                      type="button"
                      className={styles.sectionToggleBtn}
                      onClick={() => toggleSection("quickStart")}
                      data-cta-id="cta-teachergpt-chat-section-quick-start"
                      data-action="click"
                    >
                      <span>Quick Start</span>
                      <span>{openSections.quickStart ? "–" : "+"}</span>
                    </button>
                    {openSections.quickStart ? (
                      <div className={styles.sectionBody}>
                        <div>
                          <strong>{safeText(currentLessonPlan.quickStart?.oneLiner)}</strong>
                          <div className={styles.muted} style={{ marginTop: 6 }}>
                            Tijd: start {currentLessonPlan.quickStart?.timeAllocation?.start ?? 0} min · kern{" "}
                            {currentLessonPlan.quickStart?.timeAllocation?.kern ?? 0} min · afsluiting{" "}
                            {currentLessonPlan.quickStart?.timeAllocation?.afsluiting ?? 0} min
                          </div>
                        </div>
                        <div className={styles.row} style={{ flexWrap: "wrap" }}>
                          {(currentLessonPlan.quickStart?.keyConcepts ?? []).map((k, idx) => (
                            <span key={`${k}-${idx}`} className={styles.badge}>
                              {k}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.card}>
                    <button
                      type="button"
                      className={styles.sectionToggleBtn}
                      onClick={() => toggleSection("teacherScript")}
                      data-cta-id="cta-teachergpt-chat-section-teacher-script"
                      data-action="click"
                    >
                      <span>Docentenscript</span>
                      <span>{openSections.teacherScript ? "–" : "+"}</span>
                    </button>
                    {openSections.teacherScript ? (
                      <div className={styles.sectionBody}>
                        {(currentLessonPlan.teacherScript ?? []).map((s, idx) => (
                          <div key={`${s.time}-${idx}`} className={styles.card} style={{ marginBottom: 0 }}>
                            <div className={styles.muted}>
                              {s.time} · {s.phase} · {s.action}
                            </div>
                            <div style={{ marginTop: 6 }}>{s.content}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.card}>
                    <button
                      type="button"
                      className={styles.sectionToggleBtn}
                      onClick={() => toggleSection("discussion")}
                      data-cta-id="cta-teachergpt-chat-section-discussion"
                      data-action="click"
                    >
                      <span>Discussievragen</span>
                      <span>{openSections.discussion ? "–" : "+"}</span>
                    </button>
                    {openSections.discussion ? (
                      <div className={styles.sectionBody}>
                        {(currentLessonPlan.discussionQuestions ?? []).map((q, idx) => (
                          <div key={`${q.question}-${idx}`} className={styles.card} style={{ marginBottom: 0 }}>
                            <div>
                              <strong>{q.question}</strong>
                            </div>
                            <div className={styles.muted} style={{ marginTop: 6 }}>
                              Verwachte antwoorden: {(q.expectedAnswers ?? []).join(", ")}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {currentLessonPlan.groupWork ? (
                    <div className={styles.card}>
                      <button
                        type="button"
                        className={styles.sectionToggleBtn}
                        onClick={() => toggleSection("groupWork")}
                        data-cta-id="cta-teachergpt-chat-section-group-work"
                        data-action="click"
                      >
                        <span>Groepsopdracht</span>
                        <span>{openSections.groupWork ? "–" : "+"}</span>
                      </button>
                      {openSections.groupWork ? (
                        <div className={styles.sectionBody}>
                          <div>
                            <strong>{safeText(currentLessonPlan.groupWork?.title)}</strong>
                            <div className={styles.muted} style={{ marginTop: 6 }}>
                              Duur: {currentLessonPlan.groupWork?.durationMinutes ?? 0} min
                            </div>
                          </div>
                          <ol style={{ margin: 0, paddingLeft: 18 }}>
                            {(currentLessonPlan.groupWork?.steps ?? []).map((step, idx) => (
                              <li key={`${step}-${idx}`}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className={styles.card}>
                    <button
                      type="button"
                      className={styles.sectionToggleBtn}
                      onClick={() => toggleSection("kdCheck")}
                      data-cta-id="cta-teachergpt-chat-section-kd-check"
                      data-action="click"
                    >
                      <span>KD-Check</span>
                      <span>{openSections.kdCheck ? "–" : "+"}</span>
                    </button>

                    {openSections.kdCheck ? (
                      <div className={styles.sectionBody}>
                        {currentKdCheck ? (
                          <>
                            {(currentKdCheck.items ?? []).map((it, idx) => (
                              <div key={`${it.text}-${idx}`} className={styles.kdCheckRow}>
                                <div className={styles.kdCheckDotOk}>{it.ok ? "✓" : "!"}</div>
                                <div>{it.text}</div>
                              </div>
                            ))}

                            <div className={styles.kdCheckFooter}>
                              <div className={styles.muted}>
                                <span className={styles.scoreOk}>
                                  {currentKdCheck.score?.passed ?? 0}/{currentKdCheck.score?.total ?? 0}
                                </span>{" "}
                                criteria
                              </div>
                              <button
                                type="button"
                                className={styles.btn}
                                onClick={() => void onSaveKdCheck()}
                                disabled={savingKdCheck}
                                data-cta-id="cta-teachergpt-chat-kdcheck-save"
                                data-action="click"
                              >
                                {savingKdCheck ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificatie opslaan"}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className={styles.muted}>Nog geen KD-check (vraag om een lesplan met KD-code).</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Nog geen lesplan</h3>
                  <div className={styles.muted}>Kies een suggestie of typ: “Maak een lesplan voor B1-K2-W2…”</div>
                </div>
              )
            ) : null}

            {activeTab === "materials" ? (
              <>
                {currentRecommendations.length ? (
                  currentRecommendations.map((r) => (
                    <div key={r.material_id} className={styles.card}>
                      <h3 className={styles.cardTitle}>{r.title}</h3>
                      <div className={styles.muted}>
                        {r.file_name ? r.file_name : "Material"}
                        {r.content_type ? ` · ${r.content_type}` : ""}
                        {Number.isFinite(r.score) ? ` · score ${(r.score as number).toFixed(2)}` : ""}
                      </div>
                      {r.snippet ? <div style={{ marginTop: 10 }}>{r.snippet}</div> : null}
                      <div className={styles.row} style={{ marginTop: 10 }}>
                        <button
                          type="button"
                          className={styles.btn}
                          onClick={() => onUseMaterial(r.material_id)}
                          data-cta-id="cta-teachergpt-chat-recommendation-use"
                          data-action="click"
                        >
                          Gebruik dit materiaal
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Geen materialen</h3>
                    <div className={styles.muted}>Vraag om materialen of maak eerst een lesplan (scope ≠ MES).</div>
                  </div>
                )}
              </>
            ) : null}

            {activeTab === "sources" ? (
              <>
                {currentCitations.length ? (
                  currentCitations.slice(0, 12).map((c, idx) => (
                    <div key={`${c.course_id}-${c.item_index}-${idx}`} className={styles.card}>
                      <h3 className={styles.cardTitle}>
                        {c.source.toUpperCase()} · {c.course_id} · chunk {c.item_index}
                      </h3>
                      <div className={styles.muted}>similarity {Number(c.similarity ?? 0).toFixed(3)}</div>
                      <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{c.text}</div>
                    </div>
                  ))
                ) : (
                  <div className={styles.card}>
                    <h3 className={styles.cardTitle}>Nog geen bronnen</h3>
                    <div className={styles.muted}>Stel een vraag zodat e-Xpert SAM bronnen kan citeren.</div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  );
}


