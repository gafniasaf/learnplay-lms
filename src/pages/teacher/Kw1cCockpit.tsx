import React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";
import { supabase } from "@/integrations/supabase/client";
import { CuratedMaterialPackV1Schema } from "@/lib/types/curated-material";

type CuratedResult = {
  id: string;
  title: string;
  meta?: string;
  preview?: string;
  course_name?: string;
  category?: string;
  mbo_level?: string;
  source?: string;
  storage_bucket?: string;
  storage_path?: string;
  material_type?: string;
  language_variant?: string;
  kd_codes?: string[];
  metadata?: {
    mbo_track?: string;
    module_family?: string;
    topic_tags?: string[];
    exercise_format?: string;
    scenario_present?: boolean;
    law_topics?: string[];
    communication_context?: string[];
  };
};

const MATERIAL_TYPE_LABELS: Record<string, string> = {
  casus: "Casuïstiek",
  werkopdracht: "Werkopdracht",
  examen: "Examenvraag",
  theorie: "Theorie",
  oefening: "Oefening",
};

const MBO_TRACK_LABELS: Record<string, string> = {
  verpleegkunde: "Verpleegkunde",
  verzorgende_ig: "Verzorgende IG",
  assisterende_gezondheidszorg: "Assisterende Gezondheidszorg",
  ggz: "GGZ",
  doktersassistent: "Doktersassistent",
  apothekersassistent: "Apothekersassistent",
  tandartsassistent: "Tandartsassistent",
  vvt: "VVT",
};

const MODULE_FAMILY_LABELS: Record<string, string> = {
  pvwh: "Pvwh",
  pkr: "Pkr",
  triage: "Triage",
  vms: "VMS",
  wetgeving: "Wetgeving",
  communicatie: "Communicatie",
  verpleegtechnische_handelingen: "Verpleegtechnische handelingen",
  pathologie: "Pathologie",
};

const TOPIC_TAG_LABELS: Record<string, string> = {
  communication: "Communicatie",
  woundcare: "Wondzorg",
  medication: "Medicatie",
  incident: "Incidenten",
  law: "Wetgeving",
  privacy: "Privacy",
  hygiene: "Hygiene",
  clinical_reasoning: "Klinisch redeneren",
  anatomy: "Anatomie",
  physiology: "Fysiologie",
  triage: "Triage",
  patient_safety: "Patientveiligheid",
  ethics: "Ethiek",
};

const LAW_TOPIC_LABELS: Record<string, string> = {
  wkkgz: "Wkkgz",
  wzd: "Wzd",
  wvggz: "Wvggz",
  zvw: "Zvw",
  wlz: "Wlz",
  big: "BIG",
  wgbo: "WGBO",
  avg: "AVG",
};

const COMMUNICATION_CONTEXT_LABELS: Record<string, string> = {
  triage: "Triage",
  voorlichting: "Voorlichting",
  advies: "Advies",
  instructie: "Instructie",
  weigering: "Weigering",
  clientgesprek: "Clientgesprek",
};

function formatMaterialType(value?: string): string {
  const key = (value || "").trim().toLowerCase();
  return MATERIAL_TYPE_LABELS[key] || (value || "");
}

function formatTag(value: string | undefined, labels: Record<string, string>): string {
  const key = (value || "").trim().toLowerCase();
  if (!key) return "";
  return labels[key] || value || "";
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function formatSource(value?: string): string {
  const key = (value || "").trim().toLowerCase();
  if (!key) return "";
  if (key === "expertcollege-mes") return "MES";
  if (key === "book-corpus") return "Boek";
  return value || "";
}

function formatMboLevel(value?: string): string {
  const key = (value || "").trim();
  return key ? key.toUpperCase() : "";
}

function extractCategoryLabels(category?: string): string[] {
  if (!category) return [];
  return category
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const parts = segment.split("\\").map((p) => p.trim()).filter(Boolean);
      return parts.length ? parts[parts.length - 1] : "";
    })
    .filter(Boolean);
}

function formatCategory(category?: string): string {
  const labels = extractCategoryLabels(category);
  return labels.length ? labels[0] : "";
}

export default function Kw1cCockpit() {
  const nav = useNavigate();
  const mcp = useMCP();

  const [totalClasses, setTotalClasses] = React.useState<string>("…");
  const [totalStudents, setTotalStudents] = React.useState<string>("…");
  const [totalMaterials, setTotalMaterials] = React.useState<string>("…");
  const [totalStandardsDocs, setTotalStandardsDocs] = React.useState<string>("…");
  const [overviewLoading, setOverviewLoading] = React.useState(false);

  const [query, setQuery] = React.useState("");
  const [kdCode, setKdCode] = React.useState("");
  const [materialType, setMaterialType] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [mboLevelFilter, setMboLevelFilter] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("");
  const [mboTrackFilter, setMboTrackFilter] = React.useState("");
  const [moduleFamilyFilter, setModuleFamilyFilter] = React.useState("");
  const [topicTagFilter, setTopicTagFilter] = React.useState("");
  const [lawTopicFilter, setLawTopicFilter] = React.useState("");
  const [communicationContextFilter, setCommunicationContextFilter] = React.useState("");
  const [scenarioOnly, setScenarioOnly] = React.useState(false);
  const [languageVariant, setLanguageVariant] = React.useState<"b2" | "b1" | "a2" | "ar">("b2");

  const [curatedResults, setCuratedResults] = React.useState<CuratedResult[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);

  const [activeCurated, setActiveCurated] = React.useState<CuratedResult | null>(null);
  const [activeCuratedUrl, setActiveCuratedUrl] = React.useState<string>("");
  const [activeCuratedUrlLoading, setActiveCuratedUrlLoading] = React.useState(false);
  const [activeCuratedPackLoading, setActiveCuratedPackLoading] = React.useState(false);
  const [activeCuratedPackHtml, setActiveCuratedPackHtml] = React.useState<string>("");
  const [activeCuratedPackError, setActiveCuratedPackError] = React.useState<string>("");

  const openAsCard = React.useCallback(
    (path: string) => {
      nav(path);
    },
    [nav],
  );

  const onCardKeyDown = React.useCallback(
    (e: React.KeyboardEvent, path: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openAsCard(path);
      }
    },
    [openAsCard],
  );

  const refreshOverview = React.useCallback(async () => {
    setOverviewLoading(true);
    try {
      // Fetch in parallel so the overview doesn’t block on sequential 30s Edge timeouts.
      const [classesResp, studentsResp, materialsResp, standardsResp] = await Promise.all([
        mcp.listClasses(),
        mcp.listOrgStudents(),
        // list-records is capped server-side at 100; use 100 so we can show "100+".
        mcp.listRecords("library-material", 100),
        mcp.listRecords("standards-document", 100),
      ]);

      if (!classesResp || !Array.isArray((classesResp as any).classes)) {
        throw new Error("list-classes returned an invalid response");
      }
      if (!studentsResp || !Array.isArray((studentsResp as any).students)) {
        throw new Error("list-org-students returned an invalid response");
      }
      if (!materialsResp || (materialsResp as any).ok !== true || !Array.isArray((materialsResp as any).records)) {
        throw new Error("list-records(library-material) returned an invalid response");
      }
      if (!standardsResp || (standardsResp as any).ok !== true || !Array.isArray((standardsResp as any).records)) {
        throw new Error("list-records(standards-document) returned an invalid response");
      }

      const materialsN = (materialsResp as any).records.length as number;
      const standardsN = (standardsResp as any).records.length as number;

      setTotalClasses(String((classesResp as any).classes.length));
      setTotalStudents(String((studentsResp as any).students.length));
      setTotalMaterials(materialsN >= 100 ? "100+" : String(materialsN));
      setTotalStandardsDocs(standardsN >= 100 ? "100+" : String(standardsN));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("KW1C cockpit kon overzicht niet laden", { description: msg });
      setTotalClasses("—");
      setTotalStudents("—");
      setTotalMaterials("—");
      setTotalStandardsDocs("—");
    } finally {
      setOverviewLoading(false);
    }
  }, [mcp]);

  React.useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

  const runCuratedSearch = React.useCallback(async () => {
    setSearchLoading(true);
    try {
      const resp: any = await mcp.searchCuratedMaterials({
        query: query.trim() || undefined,
        kd_code: kdCode.trim() || undefined,
        material_type: materialType.trim() || undefined,
        category: categoryFilter.trim() || undefined,
        mbo_level: mboLevelFilter.trim() || undefined,
        source: sourceFilter.trim() || undefined,
        mbo_track: mboTrackFilter.trim() || undefined,
        module_family: moduleFamilyFilter.trim() || undefined,
        topic_tag: topicTagFilter.trim() || undefined,
        law_topic: lawTopicFilter.trim() || undefined,
        communication_context: communicationContextFilter.trim() || undefined,
        scenario_present: scenarioOnly ? true : undefined,
        language_variant: languageVariant,
        limit: 20,
      });

      const payload = resp && typeof resp === "object" && "json" in resp ? (resp as any).json : resp;
      if (!payload || payload.ok !== true) {
        const msg = typeof payload?.error?.message === "string"
          ? payload.error.message
          : typeof payload?.error === "string"
            ? payload.error
            : "search-curated-materials failed";
        throw new Error(msg);
      }

      const results = Array.isArray(payload.results) ? payload.results : [];
      setCuratedResults(
        results.map((r: any) => {
          const title = typeof r?.title === "string" ? r.title : "";
          const mt = typeof r?.material_type === "string" ? r.material_type : "";
          const lv = typeof r?.language_variant === "string" ? r.language_variant : "";
          const kd = Array.isArray(r?.kd_codes) ? r.kd_codes.map((x: any) => String(x || "")).filter(Boolean) : [];
          const preview = typeof r?.preview === "string" ? r.preview : "";
          const courseName = typeof r?.course_name === "string" ? r.course_name : "";
          const category = typeof r?.category === "string" ? r.category : "";
          const mboLevel = typeof r?.mbo_level === "string" ? r.mbo_level : "";
          const source = typeof r?.source === "string" ? r.source : "";
          const metadata = (r?.metadata && typeof r.metadata === "object") ? r.metadata as Record<string, unknown> : {};
          const mboTrack = typeof metadata.mbo_track === "string" ? metadata.mbo_track : "";
          const moduleFamily = typeof metadata.module_family === "string" ? metadata.module_family : "";
          const topicTags = Array.isArray(metadata.topic_tags) ? metadata.topic_tags : [];
          const scenarioPresent = metadata.scenario_present === true;
          const storage_bucket = typeof r?.storage_bucket === "string" ? r.storage_bucket : "";
          const storage_path = typeof r?.storage_path === "string" ? r.storage_path : "";
          const sourceLabel = formatSource(source);
          const mboLabel = formatMboLevel(mboLevel);
          const typeLabel = formatMaterialType(mt);
          const trackLabel = formatTag(mboTrack, MBO_TRACK_LABELS);
          const moduleLabel = formatTag(moduleFamily, MODULE_FAMILY_LABELS);
          const topicLabel = topicTags
            .map((tag) => formatTag(tag, TOPIC_TAG_LABELS))
            .filter(Boolean)
            .slice(0, 2)
            .join(", ");
          const scenarioLabel = scenarioPresent ? "Scenario" : "";
          const metaParts = [
            sourceLabel ? sourceLabel : null,
            mboLabel ? mboLabel : null,
            typeLabel ? typeLabel : null,
            lv ? lv.toUpperCase() : null,
            trackLabel ? trackLabel : null,
            moduleLabel ? moduleLabel : null,
            topicLabel ? topicLabel : null,
            scenarioLabel ? scenarioLabel : null,
            kd.length ? kd.slice(0, 3).join(", ") : null,
          ].filter(Boolean);
          return {
            id: String(r?.id || crypto.randomUUID()),
            title,
            meta: metaParts.join(" · "),
            preview: preview || undefined,
            course_name: courseName || undefined,
            category: category || undefined,
            mbo_level: mboLevel || undefined,
            source: source || undefined,
            metadata: r?.metadata,
            storage_bucket: storage_bucket || undefined,
            storage_path: storage_path || undefined,
            material_type: mt || undefined,
            language_variant: lv || undefined,
            kd_codes: kd.length ? kd : undefined,
          } satisfies CuratedResult;
        }).filter((r: CuratedResult) => !!r.title),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Zoeken in curated packs faalde", { description: msg });
      setCuratedResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [
    mcp,
    query,
    kdCode,
    materialType,
    categoryFilter,
    mboLevelFilter,
    sourceFilter,
    mboTrackFilter,
    moduleFamilyFilter,
    topicTagFilter,
    lawTopicFilter,
    communicationContextFilter,
    scenarioOnly,
    languageVariant,
  ]);

  const categoryOptions = React.useMemo(() => {
    const unique = new Set<string>();
    curatedResults.forEach((r) => {
      extractCategoryLabels(r.category).forEach((label) => unique.add(label));
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [curatedResults]);

  const mboTrackOptions = React.useMemo(() => {
    const values: string[] = [];
    curatedResults.forEach((r) => {
      const track = r.metadata?.mbo_track;
      if (track) values.push(track);
    });
    return uniqueSorted(values);
  }, [curatedResults]);

  const moduleFamilyOptions = React.useMemo(() => {
    const values: string[] = [];
    curatedResults.forEach((r) => {
      const moduleFamily = r.metadata?.module_family;
      if (moduleFamily) values.push(moduleFamily);
    });
    return uniqueSorted(values);
  }, [curatedResults]);

  const topicTagOptions = React.useMemo(() => {
    const values: string[] = [];
    curatedResults.forEach((r) => {
      const tags = r.metadata?.topic_tags || [];
      tags.forEach((tag) => values.push(tag));
    });
    return uniqueSorted(values);
  }, [curatedResults]);

  const lawTopicOptions = React.useMemo(() => {
    const values: string[] = [];
    curatedResults.forEach((r) => {
      const topics = r.metadata?.law_topics || [];
      topics.forEach((topic) => values.push(topic));
    });
    return uniqueSorted(values);
  }, [curatedResults]);

  const communicationContextOptions = React.useMemo(() => {
    const values: string[] = [];
    curatedResults.forEach((r) => {
      const contexts = r.metadata?.communication_context || [];
      contexts.forEach((context) => values.push(context));
    });
    return uniqueSorted(values);
  }, [curatedResults]);

  const openCuratedResult = React.useCallback(async (result: CuratedResult) => {
    setActiveCurated(result);
    setActiveCuratedUrl("");
    setActiveCuratedPackHtml("");
    setActiveCuratedPackError("");

    const bucket = String(result.storage_bucket || "").trim();
    const path = String(result.storage_path || "").trim();
    if (!bucket || !path) {
      toast.error("BLOCKED: curated item mist opslaglocatie", {
        description: "Dit item heeft geen storage_bucket/storage_path voor deze taalvariant.",
      });
      return;
    }

    setActiveCuratedUrlLoading(true);
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
      if (error || !data?.signedUrl) {
        throw new Error(error?.message || "Failed to create signed URL for curated material");
      }
      setActiveCuratedUrl(data.signedUrl);

      // Fetch + render the stored pack payload (pre-rendered content_html).
      setActiveCuratedPackLoading(true);
      try {
        const res = await fetch(data.signedUrl, { method: "GET" });
        if (!res.ok) {
          throw new Error(`Curated pack download failed (HTTP ${res.status})`);
        }
        const rawText = await res.text();
        let json: unknown = null;
        try {
          json = rawText ? JSON.parse(rawText) : null;
        } catch {
          json = null;
        }
        const parsed = CuratedMaterialPackV1Schema.safeParse(json);
        if (!parsed.success) {
          const first = parsed.error.issues?.[0]?.message || "Unknown schema error";
          throw new Error(`Invalid curated pack schema: ${first}`);
        }
        setActiveCuratedPackHtml(parsed.data.content_html || "");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setActiveCuratedPackError(msg);
        setActiveCuratedPackHtml("");
      } finally {
        setActiveCuratedPackLoading(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Curated item openen faalde", { description: msg });
      setActiveCuratedUrl("");
      setActiveCuratedPackHtml("");
      setActiveCuratedPackError("");
    } finally {
      setActiveCuratedUrlLoading(false);
    }
  }, []);

  return (
    <div className="p-6">
      <style>
        {`
          .kw1c-curated-html .nl-term { color: #2563eb; font-weight: 700; }
        `}
      </style>
      <header className="header">
        <h1>Docent Cockpit (KW1C)</h1>
        <div className="header-actions">
          <button
            data-cta-id="cta-kw1c-to-teacher-dashboard"
            data-action="navigate"
            data-target="/teacher/dashboard"
            type="button"
            onClick={() => nav("/teacher/dashboard")}
          >
            Naar dashboard
          </button>
          <button
            data-cta-id="cta-kw1c-open-teachergpt-chat"
            data-action="navigate"
            data-target="/teacher/teachergpt/chat"
            type="button"
            onClick={() => nav("/teacher/teachergpt/chat")}
          >
            e-Xpert SAM
          </button>
        </div>
      </header>

      <main className="container">
        <section className="card">
          <h2>Overzicht</h2>
          <div className="stats-row">
            <div
              className="stat-card"
              role="button"
              tabIndex={0}
              style={{ cursor: "pointer" }}
              onClick={() => openAsCard("/teacher/classes")}
              onKeyDown={(e) => onCardKeyDown(e, "/teacher/classes")}
              data-cta-id="cta-kw1c-open-classes"
              data-action="navigate"
              data-target="/teacher/classes"
            >
              <span className="stat-value">{totalClasses}</span>
              <span className="stat-label">Klassen</span>
            </div>
            <div
              className="stat-card"
              role="button"
              tabIndex={0}
              style={{ cursor: "pointer" }}
              onClick={() => openAsCard("/teacher/students")}
              onKeyDown={(e) => onCardKeyDown(e, "/teacher/students")}
              data-cta-id="cta-kw1c-open-students"
              data-action="navigate"
              data-target="/teacher/students"
            >
              <span className="stat-value">{totalStudents}</span>
              <span className="stat-label">Studenten</span>
            </div>
            <div
              className="stat-card"
              role="button"
              tabIndex={0}
              style={{ cursor: "pointer" }}
              onClick={() => openAsCard("/teacher/materials")}
              onKeyDown={(e) => onCardKeyDown(e, "/teacher/materials")}
              data-cta-id="cta-kw1c-open-materials"
              data-action="navigate"
              data-target="/teacher/materials"
            >
              <span className="stat-value">{totalMaterials}</span>
              <span className="stat-label">Materialen</span>
            </div>
            <div
              className="stat-card"
              role="button"
              tabIndex={0}
              style={{ cursor: "pointer" }}
              onClick={() => openAsCard("/teacher/standards")}
              onKeyDown={(e) => onCardKeyDown(e, "/teacher/standards")}
              data-cta-id="cta-kw1c-open-standards"
              data-action="navigate"
              data-target="/teacher/standards"
            >
              <span className="stat-value">{totalStandardsDocs}</span>
              <span className="stat-label">KD documenten</span>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Curated materialen (alleen zoeken &amp; aanbevelen)</h2>
          <p className="muted">
            Deze cockpit genereert niets live. Casuïstiek, werkopdrachten en examenvragen worden vooraf gebouwd in een
            kwaliteits-pipeline.
          </p>

          <div className="action-grid">
            <label>
              Zoekvraag
              <input
                data-cta-id="cta-kw1c-query"
                data-action="edit"
                placeholder="bijv. COPD, zuurstof, WP2.3"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>

            <label>
              KD code (optioneel)
              <input
                data-cta-id="cta-kw1c-kd-code"
                data-action="edit"
                placeholder="bijv. WP2.3"
                value={kdCode}
                onChange={(e) => setKdCode(e.target.value)}
              />
            </label>

            <label>
              Type
              <select
                data-cta-id="cta-kw1c-type"
                data-action="select"
                value={materialType}
                onChange={(e) => setMaterialType(e.target.value)}
              >
                <option value="">Alles</option>
                <option value="casus">Casuïstiek</option>
                <option value="werkopdracht">Werkopdracht</option>
                <option value="examen">Examenvraag</option>
                <option value="theorie">Theorie (boek)</option>
                <option value="oefening">Oefening (MES)</option>
              </select>
            </label>

            <label>
              Categorie
              <select
                data-cta-id="cta-kw1c-category"
                data-action="select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">Alle categorieën</option>
                {categoryOptions.length === 0 ? (
                  <option value="" disabled>
                    Geen categorieën gevonden (eerst zoeken)
                  </option>
                ) : (
                  categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label>
              MBO niveau
              <select
                data-cta-id="cta-kw1c-mbo-level"
                data-action="select"
                value={mboLevelFilter}
                onChange={(e) => setMboLevelFilter(e.target.value)}
              >
                <option value="">Alle niveaus</option>
                <option value="n3">N3</option>
                <option value="n4">N4</option>
              </select>
            </label>

            <label>
              MBO track
              <select
                data-cta-id="cta-kw1c-mbo-track"
                data-action="select"
                value={mboTrackFilter}
                onChange={(e) => setMboTrackFilter(e.target.value)}
              >
                <option value="">Alle tracks</option>
                {mboTrackOptions.length === 0 ? (
                  <option value="" disabled>
                    Geen tracks gevonden (eerst zoeken)
                  </option>
                ) : (
                  mboTrackOptions.map((track) => (
                    <option key={track} value={track}>
                      {formatTag(track, MBO_TRACK_LABELS)}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label>
              Module
              <select
                data-cta-id="cta-kw1c-module-family"
                data-action="select"
                value={moduleFamilyFilter}
                onChange={(e) => setModuleFamilyFilter(e.target.value)}
              >
                <option value="">Alle modules</option>
                {moduleFamilyOptions.length === 0 ? (
                  <option value="" disabled>
                    Geen modules gevonden (eerst zoeken)
                  </option>
                ) : (
                  moduleFamilyOptions.map((moduleFamily) => (
                    <option key={moduleFamily} value={moduleFamily}>
                      {formatTag(moduleFamily, MODULE_FAMILY_LABELS)}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label>
              Onderwerp
              <select
                data-cta-id="cta-kw1c-topic-tag"
                data-action="select"
                value={topicTagFilter}
                onChange={(e) => setTopicTagFilter(e.target.value)}
              >
                <option value="">Alle onderwerpen</option>
                {topicTagOptions.length === 0 ? (
                  <option value="" disabled>
                    Geen onderwerpen gevonden (eerst zoeken)
                  </option>
                ) : (
                  topicTagOptions.map((topic) => (
                    <option key={topic} value={topic}>
                      {formatTag(topic, TOPIC_TAG_LABELS)}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label>
              Wetgeving onderwerp
              <select
                data-cta-id="cta-kw1c-law-topic"
                data-action="select"
                value={lawTopicFilter}
                onChange={(e) => setLawTopicFilter(e.target.value)}
              >
                <option value="">Alle onderwerpen</option>
                {lawTopicOptions.length === 0 ? (
                  <option value="" disabled>
                    Geen wetgeving gevonden (eerst zoeken)
                  </option>
                ) : (
                  lawTopicOptions.map((topic) => (
                    <option key={topic} value={topic}>
                      {formatTag(topic, LAW_TOPIC_LABELS)}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label>
              Communicatie context
              <select
                data-cta-id="cta-kw1c-communication-context"
                data-action="select"
                value={communicationContextFilter}
                onChange={(e) => setCommunicationContextFilter(e.target.value)}
              >
                <option value="">Alle contexten</option>
                {communicationContextOptions.length === 0 ? (
                  <option value="" disabled>
                    Geen context gevonden (eerst zoeken)
                  </option>
                ) : (
                  communicationContextOptions.map((context) => (
                    <option key={context} value={context}>
                      {formatTag(context, COMMUNICATION_CONTEXT_LABELS)}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label>
              Alleen scenario
              <input
                data-cta-id="cta-kw1c-scenario"
                data-action="toggle"
                type="checkbox"
                checked={scenarioOnly}
                onChange={(e) => setScenarioOnly(e.target.checked)}
              />
            </label>

            <label>
              Bron
              <select
                data-cta-id="cta-kw1c-source"
                data-action="select"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="">Alle bronnen</option>
                <option value="expertcollege-mes">MES Expertcollege</option>
                <option value="book-corpus">Boek corpus</option>
              </select>
            </label>

            <label>
              Taalvariant
              <select
                data-cta-id="cta-kw1c-language"
                data-action="select"
                value={languageVariant}
                onChange={(e) => setLanguageVariant(e.target.value as any)}
              >
                <option value="b2">B2</option>
                <option value="b1">B1</option>
                <option value="a2">A2</option>
                <option value="ar">Arabisch (met NL termen)</option>
              </select>
            </label>

            <button
              data-cta-id="cta-kw1c-search"
              data-action="action"
              type="button"
              className="btn-primary"
              onClick={() => void runCuratedSearch()}
              disabled={searchLoading}
            >
              {searchLoading ? "Zoeken…" : "Zoeken"}
            </button>

            <button
              data-cta-id="cta-kw1c-refresh"
              data-action="action"
              type="button"
              className="btn-secondary"
              onClick={() => void refreshOverview()}
              disabled={overviewLoading}
            >
              Refresh
            </button>
          </div>

          <div style={{ marginTop: "1rem" }} className="card">
            <h3>Resultaten</h3>
            <p className="muted">Alleen vooraf gebouwde items. Als er niets is, zie je een lege lijst (geen live generatie).</p>

            <ul data-list="curated_results">
              {curatedResults.length === 0 ? (
                <li className="muted">
                  {searchLoading
                    ? "Laden…"
                    : "Nog geen curated resultaten. (Zoeken gebeurt alleen in vooraf gebouwde packs.)"}
                </li>
              ) : (
                curatedResults.map((r) => (
                  <li key={r.id}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
                      <div>
                        <strong>{r.title}</strong>
                        {r.meta ? <div className="muted">{r.meta}</div> : null}
                        {r.course_name || r.category ? (
                          <div className="muted">
                            {[r.course_name, formatCategory(r.category)].filter(Boolean).join(" › ")}
                          </div>
                        ) : null}
                        {r.preview ? <p className="muted">{r.preview}</p> : null}
                      </div>
                      <button
                        data-cta-id="cta-kw1c-open-result"
                        data-action="action"
                        type="button"
                        onClick={() => openCuratedResult(r)}
                      >
                        Open
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>

        <section className="card">
          <h2>Tools</h2>
          <div className="action-grid">
            <button
              data-cta-id="cta-kw1c-open-lesson-kits"
              data-action="navigate"
              data-target="/teacher/lesson-kits"
              type="button"
              className="action-btn"
              onClick={() => nav("/teacher/lesson-kits")}
            >
              Lesson Kits
            </button>
            <button
              data-cta-id="cta-kw1c-open-mes"
              data-action="navigate"
              data-target="/teacher/teachergpt/mes"
              type="button"
              className="action-btn"
              onClick={() => nav("/teacher/teachergpt/mes")}
            >
              MES aanbevelingen
            </button>
          </div>
        </section>
      </main>

      {activeCurated && (
        <div
          role="dialog"
          aria-label="Curated materiaal"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 50,
          }}
          onClick={() => {
            setActiveCurated(null);
            setActiveCuratedUrl("");
            setActiveCuratedPackHtml("");
            setActiveCuratedPackError("");
          }}
        >
          <div
            className="card"
            style={{
              width: "min(900px, 100%)",
              maxHeight: "85vh",
              overflow: "auto",
              padding: "1rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
              <div>
                <h3 style={{ margin: 0 }}>{activeCurated.title}</h3>
                <p className="muted" style={{ marginTop: "0.25rem" }}>
                  {activeCurated.meta || ""}
                </p>
                {activeCurated.course_name || activeCurated.category ? (
                  <p className="muted" style={{ marginTop: "0.25rem" }}>
                    {[activeCurated.course_name, formatCategory(activeCurated.category)].filter(Boolean).join(" › ")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setActiveCurated(null);
                  setActiveCuratedUrl("");
                  setActiveCuratedPackHtml("");
                  setActiveCuratedPackError("");
                }}
              >
                Sluiten
              </button>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-primary"
                disabled={activeCuratedUrlLoading || !activeCuratedUrl}
                onClick={() => {
                  if (!activeCuratedUrl) return;
                  window.open(activeCuratedUrl, "_blank", "noopener,noreferrer");
                }}
              >
                {activeCuratedUrlLoading ? "Link maken…" : "Open JSON bestand"}
              </button>
              {!activeCuratedUrl && !activeCuratedUrlLoading && (
                <span className="muted">Geen link beschikbaar (controleer opslagrechten of pad).</span>
              )}
            </div>

            <div style={{ marginTop: "1rem" }}>
              <h4 style={{ marginBottom: "0.5rem" }}>Inhoud (pre-rendered)</h4>
              {activeCuratedPackLoading ? (
                <p className="muted">Inhoud laden…</p>
              ) : activeCuratedPackHtml ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none kw1c-curated-html"
                  dangerouslySetInnerHTML={{ __html: activeCuratedPackHtml }}
                />
              ) : (
                <div>
                  {activeCuratedPackError ? (
                    <p className="muted">Kon curated pack niet renderen: {activeCuratedPackError}</p>
                  ) : (
                    <p className="muted">(Geen content_html gevonden.)</p>
                  )}
                  <h4 style={{ marginTop: "0.75rem" }}>Preview</h4>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      background: "rgba(0,0,0,0.04)",
                      padding: "0.75rem",
                      borderRadius: 8,
                      maxHeight: "30vh",
                      overflow: "auto",
                      margin: 0,
                    }}
                  >
                    {activeCurated.preview || "(Geen preview beschikbaar in dit curated item.)"}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

