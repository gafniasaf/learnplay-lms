// EC Expert Protocol - Two-Pass Generation (fills an existing skeleton)
// Pass 1: Extract Learning Objectives from study text (bounded to skeleton cluster count)
// Pass 2: Generate variants per objective, mapped onto skeleton cluster variants (1..3)

import type {
  GenerationProtocol,
  LearningObjective,
  ExerciseSet,
  ProtocolOutput,
  ProtocolFillArgs,
  ProtocolFillResult,
  ProtocolInput,
  HintSet,
} from "./types.ts";
import { isValidObjectiveList, isValidExerciseSet, isValidProtocolOutput } from "./types.ts";
import { generateJson } from "../ai.ts";
import { extractJsonFromText, normalizeOptionsItem, normalizeNumericItem } from "../generation-utils.ts";

const EC_EXPERT_SYSTEM_PROMPT = `Je bent een ervaren ExpertCollege-auteur en revisor voor e-learning opgaven.

KERN:
- Schrijf menselijk, kort en duidelijk, passend bij de doelgroep.
- Vermijd academische formuleringen (zoals "bij analyse", "primair bepaald door"). Schrijf actief en concreet.
- Voorkom discussie: precies 1 correct antwoord; afleiders klinken logisch maar zijn ondubbelzinnig fout in deze context.

VASTE OUTPUTREGELS:
- Output ALLEEN geldige JSON (geen markdown of extra tekst).
- Alle tekst is Nederlands.

STIJLREGELS (richtlijn, niet dogmatisch):
- Spreek de student aan in de je-vorm waar passend.
- Vermijd suggestieve/extreme woorden in antwoordopties (altijd/nooit/uitsluitend/alleen/enkel/slechts/volledig/exact).
- Vermijd negatieve vraagstellingen waar mogelijk. Als een negatie de vraag duidelijker maakt, gebruik hem zonder dubbele ontkenning.`;

type ClusterPlan = {
  groupId: number;
  groupName: string;
  clusterId: string;
  itemIndexes: number[]; // indexes into skeleton.items
};

type LintIssue = {
  code: string;
  severity: "error" | "warn";
  message: string;
  location: string;
};

function normalizeForCompare(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u2019’]/g, "'")
    .replace(/[^a-z0-9à-öø-ÿ\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForQuoteMatch(s: string): string {
  return String(s || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenSet(s: string): Set<string> {
  const t = normalizeForCompare(s);
  const toks = t.split(" ").filter(Boolean);
  return new Set(toks);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function containsHedge(s: string): boolean {
  const t = normalizeForCompare(s);
  // Hedging words often create "partly true" distractors (protocol forbids).
  return /\b(meestal|soms|vaak|regelmatig|in enkele gevallen|niet altijd|in principe)\b/.test(t);
}

function containsNegation(s: string): boolean {
  const t = normalizeForCompare(s);
  return /\b(niet|geen|nooit)\b/.test(t);
}

function containsForbiddenNegationForStemsOrOptions(s: string): boolean {
  const t = normalizeForCompare(s);
  // ExpertCollege (mbo) protocol: avoid "niet/geen" in questions/statements where possible.
  return /\b(niet|geen)\b/.test(t);
}

function containsSuggestiveAbsoluteWord(s: string): boolean {
  const t = normalizeForCompare(s);
  // User feedback: avoid suggestive absolutes ("altijd/nooit/uitsluitend/...") in answer options.
  // Keep this list tight and high-signal; we can extend based on outputs.
  return /\b(altijd|nooit|nimmer|uitsluitend|alleen|enkel|slechts)\b/.test(t);
}

function containsAllQuantifier(s: string): boolean {
  const t = normalizeForCompare(s);
  return /\b(alle|allemaal)\b/.test(t);
}

function containsSuggestiveIntensifier(s: string): boolean {
  const t = normalizeForCompare(s);
  // Often used to make distractors obviously wrong (“volledig”, “absoluut”, “exact”).
  return /\b(volledig|totaal|absoluut|exact|per definitie|zonder uitzondering)\b/.test(t);
}

function looksLikeNumericValue(s: string): boolean {
  const t = String(s || "").trim();
  // Allow Dutch decimal comma in pure numeric options (e.g. 7,4).
  return /^[0-9]+([.,][0-9]+)?$/.test(t);
}

function containsDisallowedPunctuationForStemOrOption(s: string): boolean {
  const t = String(s || "");
  // Protocol guidance: avoid commas/parentheses etc in stems/options (often signal overly long phrasing).
  // We allow a trailing period/question mark and numeric decimals.
  if (looksLikeNumericValue(t)) return false;
  return /[(),;:]/.test(t);
}

function containsAllOrNoneOfAbove(s: string): boolean {
  const t = normalizeForCompare(s);
  return /\b(alle bovenstaande|alle bovenstaand|geen van bovenstaande|geen van bovenstaand)\b/.test(t);
}

function looksLikeNumericToken(s: string): boolean {
  const t = normalizeForCompare(s);
  if (/\d/.test(String(s || ""))) return true;
  // Number words (exclude "een" because it's a common article)
  return /\b(twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf|dertien|veertien|vijftien|zestien|zeventien|achttien|negentien|twintig|honderd)\b/.test(t);
}

function containsNumericTriviaUnit(s: string): boolean {
  const t = normalizeForCompare(s);
  // "BS for student" class: prevalence / exact-number facts with these units.
  // Do NOT include pH-style numeric concepts here; we only match on these units/contexts.
  return /\b(procent|percentage|milliliter|ml|jaar|jaren|dagen|weken|maanden|leeftijd)\b/.test(t);
}

function isCountingListQuestionStem(stem: string): boolean {
  const t = normalizeForCompare(stem);
  if (!/\b(hoeveel|aantal)\b/.test(t)) return false;
  // Telvragen over lijstjes/opsommingen zijn lage leerwaarde.
  return /\b(gebieden|onderdelen|aspecten|punten|kenmerken|vormen|stappen)\b/.test(t);
}

function looksLikeNumericTriviaObjective(description: string): boolean {
  const t = normalizeForCompare(description);
  return containsNumericTriviaUnit(t) && looksLikeNumericToken(t);
}

function isNumericTriviaExercise(stem: string, options: string[], correctIndex: number | null): boolean {
  const unitPresent = containsNumericTriviaUnit(stem) || options.some((o) => containsNumericTriviaUnit(o));
  if (!unitPresent) return false;

  const numericOptions = options.filter((o) => looksLikeNumericToken(o)).length;
  const correct = typeof correctIndex === "number" && correctIndex >= 0 ? options[correctIndex] || "" : "";
  const correctIsNumeric = correct ? looksLikeNumericToken(correct) : false;

  // Only block when the "answer space" is numeric-ish (typical trivia).
  return correctIsNumeric || numericOptions >= 2;
}

function isBeideBovenstaande(s: string): boolean {
  const t = normalizeForCompare(s);
  return /\b(beide bovenstaande|beide bovenstaand)\b/.test(t);
}

function isGeenVanBovenstaande(s: string): boolean {
  const t = normalizeForCompare(s);
  return /\b(geen van bovenstaande|geen van bovenstaand)\b/.test(t);
}

function isAlleBovenstaande(s: string): boolean {
  const t = normalizeForCompare(s);
  return /\b(alle bovenstaande|alle bovenstaand)\b/.test(t);
}

function isAllowedBothNonePattern(options: string[]): boolean {
  if (!Array.isArray(options) || options.length !== 4) return false;
  const hasBoth = options.some(isBeideBovenstaande);
  const hasNone = options.some(isGeenVanBovenstaande);
  return hasBoth && hasNone;
}

function looksLikeMultiElementOption(s: string): boolean {
  const t = normalizeForCompare(s);
  // Strong signal: explicit "en/of" is almost always a multi-element option.
  if (/\ben\/of\b/.test(t)) return true;

  // Softer heuristic: " en " / " of " can be a list (bad) but can also be a simple range (ok),
  // e.g. "10 en 16" or "tien en zestien". We'll treat this as a STYLE warning, not a hard error.
  return /\s(en|of)\s/.test(t);
}

function isSimpleNumericRangeOption(s: string): boolean {
  const t = normalizeForCompare(s);
  if (!t) return false;
  const toks = t.split(" ").filter(Boolean);

  // "10 en 16" / "tien en zestien"
  if (toks.length === 3 && toks[1] === "en") {
    return looksLikeNumericToken(toks[0]) && looksLikeNumericToken(toks[2]);
  }
  // "tussen 10 en 16"
  if (toks.length === 4 && toks[0] === "tussen" && toks[2] === "en") {
    return looksLikeNumericToken(toks[1]) && looksLikeNumericToken(toks[3]);
  }
  return false;
}

function findOptionOverlapPairs(options: string[]): Array<{ i: number; j: number }> {
  // Detect "cover-all" options that literally contain another option (common test-writing anti-pattern).
  const norm = options.map(normalizeForCompare);
  const out: Array<{ i: number; j: number }> = [];
  for (let i = 0; i < norm.length; i++) {
    for (let j = 0; j < norm.length; j++) {
      if (i === j) continue;
      const a = norm[i] || "";
      const b = norm[j] || "";
      if (!a || !b) continue;
      // Avoid noisy overlaps on tiny strings (e.g. "A", "7").
      if (a.length < 18 || b.length < 12) continue;
      if (a !== b && a.includes(b)) out.push({ i, j });
    }
  }
  return out;
}

function buildClusterPlan(skeleton: ProtocolFillArgs["skeleton"]): ClusterPlan[] {
  const groupNameById = new Map<number, string>();
  for (const g of skeleton.groups || []) {
    if (typeof g?.id === "number" && typeof g?.name === "string") {
      groupNameById.set(g.id, g.name);
    }
  }

  const seen = new Set<string>();
  const plans: ClusterPlan[] = [];

  const items = Array.isArray(skeleton.items) ? skeleton.items : [];
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const groupId = typeof it?.groupId === "number" ? it.groupId : 0;
    const clusterId = typeof it?.clusterId === "string" ? it.clusterId : "";
    if (!clusterId) continue;
    const key = `${groupId}:${clusterId}`;
    if (!seen.has(key)) {
      seen.add(key);
      plans.push({
        groupId,
        groupName: groupNameById.get(groupId) || `Group ${groupId}`,
        clusterId,
        itemIndexes: [],
      });
    }
    const plan = plans[plans.length - 1];
    // Ensure we append to the correct plan even if items are interleaved (shouldn't happen, but be safe).
    const target = plans.find((p) => p.groupId === groupId && p.clusterId === clusterId) || plan;
    target.itemIndexes.push(idx);
  }

  // Sort each cluster's items by variant (1..3) to keep stable mapping.
  for (const p of plans) {
    p.itemIndexes.sort((a, b) => {
      const va = Number(items[a]?.variant || 0);
      const vb = Number(items[b]?.variant || 0);
      return va - vb;
    });
  }

  return plans;
}

function rebuildLevelsForItems(args: {
  existingLevels: Array<{ id: number; title: string }> | null;
  totalItems: number;
}): Array<{ id: number; title: string; start: number; end: number }> {
  const { existingLevels, totalItems } = args;
  const desiredLevelsCount =
    Array.isArray(existingLevels) && existingLevels.length > 0 ? existingLevels.length : 3;
  const levelsCount = Math.min(Math.max(desiredLevelsCount, 1), 6);
  const safeTotal = Math.max(1, Math.floor(totalItems));
  const itemsPerLevel = Math.ceil(safeTotal / levelsCount);

  const out: Array<{ id: number; title: string; start: number; end: number }> = [];
  for (let i = 0; i < levelsCount; i++) {
    const title = existingLevels?.[i]?.title || `Level ${i + 1}`;
    out.push({
      id: i + 1,
      title,
      start: i * itemsPerLevel,
      end: Math.min((i + 1) * itemsPerLevel - 1, safeTotal - 1),
    });
  }
  return out;
}

function trimSkeletonToFirstNClusters(args: {
  skeleton: ProtocolFillArgs["skeleton"];
  clusterPlan: ClusterPlan[];
  keepClusters: number;
}): ProtocolFillArgs["skeleton"] {
  const { skeleton, clusterPlan, keepClusters } = args;
  const items = Array.isArray(skeleton.items) ? skeleton.items : [];
  const keep = new Set<number>();

  const keptClusters = clusterPlan.slice(0, Math.max(0, Math.floor(keepClusters)));
  for (const c of keptClusters) {
    for (const idx of c.itemIndexes) keep.add(idx);
  }

  const keptItems = items.filter((_, idx) => keep.has(idx));
  const usedGroupIds = new Set<number>();
  for (const it of keptItems) {
    const gid = typeof (it as any)?.groupId === "number" ? (it as any).groupId : 0;
    usedGroupIds.add(gid);
  }

  const originalGroups = Array.isArray(skeleton.groups) ? skeleton.groups : [];
  const groups = originalGroups.filter((g: any) => typeof g?.id === "number" && usedGroupIds.has(g.id));

  const levels = rebuildLevelsForItems({
    existingLevels: Array.isArray(skeleton.levels) ? (skeleton.levels as any) : null,
    totalItems: keptItems.length,
  });

  return {
    ...skeleton,
    groups: groups.length > 0 ? groups : originalGroups.slice(0, 1),
    levels,
    items: keptItems,
  };
}

function countBlankPlaceholders(text: string): number {
  const m = String(text || "").match(/\[blank\]/g);
  return m ? m.length : 0;
}

function hasAbbreviation(s: string): boolean {
  // 2+ consecutive uppercase letters, optionally with digits (ABG, COPD, HCO3, etc.)
  return /[A-Z]{2,}[0-9]{0,2}/.test(String(s || ""));
}

function startsWithCapitalOrDigit(s: string): boolean {
  const t = String(s || "").trim();
  if (!t) return true;
  const ch = t[0];
  return /[A-Z0-9À-ÖØ-Ý]/.test(ch);
}

function lintExercise(ex: any, idx: number, ctx?: { studyText?: string }): LintIssue[] {
  const issues: LintIssue[] = [];
  const locationBase = `Variant ${idx + 1}`;

  const stem = typeof ex?.stem === "string" ? ex.stem : "";
  const options = Array.isArray(ex?.options) ? ex.options.map(String) : [];
  const correctIndex = typeof ex?.correctIndex === "number" ? ex.correctIndex : null;
  const explanation = typeof ex?.explanation === "string" ? ex.explanation : "";

  // Hard structure errors (must pass schema)
  if (!stem.trim()) {
    issues.push({ code: "stem_missing", severity: "error", location: `${locationBase} → Vraag/Stelling`, message: "Vraag/stelling ontbreekt." });
  }
  if (stem && containsForbiddenNegationForStemsOrOptions(stem)) {
    issues.push({
      code: "negative_stem",
      severity: "warn",
      location: `${locationBase} → Vraag/Stelling`,
      message: "Vermijd 'niet/geen' in de vraag/stelling waar mogelijk. Als het helpt, zorg dat het geen trucvraag wordt en vermijd dubbele ontkenning.",
    });
  }
  if (stem && (containsSuggestiveAbsoluteWord(stem) || containsSuggestiveIntensifier(stem))) {
    issues.push({
      code: "suggestive_absolute_stem",
      severity: "warn",
      location: `${locationBase} → Vraag/Stelling`,
      message: "Vermijd suggestieve absolute woorden in de vraag/stelling (altijd/nooit/uitsluitend/alleen/enkel/slechts/volledig/exact/etc.).",
    });
  }
  if (stem && containsDisallowedPunctuationForStemOrOption(stem)) {
    issues.push({
      code: "stem_punctuation",
      severity: "warn",
      location: `${locationBase} → Vraag/Stelling`,
      message: "Vermijd komma's/haakjes/leestekens in de vraag/stelling waar mogelijk (protocol).",
    });
  }
  if (options.length < 3 || options.length > 4) {
    issues.push({ code: "options_count", severity: "error", location: `${locationBase} → Antwoordopties`, message: `Aantal antwoordopties is ${options.length}; dit moet 3 of 4 zijn.` });
  }
  if (typeof correctIndex !== "number" || correctIndex < 0 || correctIndex >= options.length) {
    issues.push({ code: "correctIndex_invalid", severity: "error", location: `${locationBase} → Antwoordopties`, message: "correctIndex is ongeldig of valt buiten bereik." });
  }
  if (!explanation.trim()) {
    issues.push({ code: "explanation_missing", severity: "error", location: `${locationBase} → Extra info/Uitleg`, message: "Uitleg ontbreekt." });
  }

  // Placeholder protocol (EC Expert exercises require exactly one [blank] placeholder)
  const blankCount = countBlankPlaceholders(stem);
  if (blankCount !== 1) {
    issues.push({
      code: "blank_count",
      severity: "error",
      location: `${locationBase} → Vraag/Stelling`,
      message: `De vraag/stelling moet EXACT 1 [blank] hebben; gevonden: ${blankCount}.`,
    });
  }

  // BS filters (student value):
  // - Avoid telvragen (counting a list) like "Hoeveel gebieden..."
  if (stem && isCountingListQuestionStem(stem)) {
    issues.push({
      code: "counting_list_trivia",
      severity: "error",
      location: `${locationBase} → Vraag/Stelling`,
      message: "Vermijd telvragen over opsommingen (lage leerwaarde). Test inhoud/begrippen, niet tellen.",
    });
  }

  // - Avoid prevalence/exact-number trivia when the answer space is numeric (percent/ml/age/days etc).
  if (stem && isNumericTriviaExercise(stem, options, correctIndex)) {
    issues.push({
      code: "numeric_trivia_answer",
      severity: "error",
      location: `${locationBase} → Vraag/Stelling/Antwoordopties`,
      message: "Vermijd prevalentie/exact-getal als antwoord (percentage/ml/leeftijd/dagen). Maak het conceptueel/toepasbaar.",
    });
  }

  // - Avoid multi-element correct answers ("X en Y") unless it's a simple numeric range (e.g. "10 en 16").
  if (typeof correctIndex === "number" && correctIndex >= 0 && correctIndex < options.length) {
    const correctOpt = options[correctIndex] || "";
    if (looksLikeMultiElementOption(correctOpt) && !isSimpleNumericRangeOption(correctOpt)) {
      issues.push({
        code: "correct_option_multiple_elements",
        severity: "error",
        location: `${locationBase} → Antwoordopties`,
        message: "Correcte antwoordoptie combineert meerdere kenniselementen (bijv. 'X en Y'). Kies één duidelijk concept als correct antwoord.",
      });
    }
  }

  // Option hygiene (common senior revision flags)
  const optionLens = options.map((o: unknown) => String(o).trim().length).filter((n: number) => n > 0);
  if (optionLens.length >= 3) {
    const min = Math.min(...optionLens);
    const max = Math.max(...optionLens);
    if (min > 0 && max / min >= 2.8) {
      issues.push({
        code: "option_length_outlier",
        severity: "warn",
        location: `${locationBase} → Antwoordopties`,
        message: "Een antwoordoptie is opvallend veel langer/korter dan de rest. Maak lengte/format vergelijkbaar.",
      });
    }
  }

  const abbrevFlags = options.map(hasAbbreviation);
  if (abbrevFlags.filter(Boolean).length === 1) {
    issues.push({
      code: "option_standout_abbrev",
      severity: "warn",
      location: `${locationBase} → Antwoordopties`,
      message: "Eén antwoordoptie springt eruit door een (enige) afkorting. Maak consistent of schrijf uit.",
    });
  }

  const capFlags = options.map(startsWithCapitalOrDigit);
  if (capFlags.some((ok: boolean) => !ok)) {
    issues.push({
      code: "option_capitalization",
      severity: "warn",
      location: `${locationBase} → Antwoordopties`,
      message: "Antwoordopties starten niet consistent met een hoofdletter (protocol).",
    });
  }

  const allowBothNone = isAllowedBothNonePattern(options);

  for (const opt of options) {
    if (containsForbiddenNegationForStemsOrOptions(opt)) {
      issues.push({
        code: "negative_option",
        severity: "warn",
        location: `${locationBase} → Antwoordopties`,
        message: "Vermijd 'niet/geen' in antwoordopties waar mogelijk. Als het helpt, houd de optie kort en voorkom dubbelzinnigheid.",
      });
    }
    if (containsSuggestiveAbsoluteWord(opt) || containsSuggestiveIntensifier(opt)) {
      issues.push({
        code: "suggestive_absolute_option",
        severity: "error",
        location: `${locationBase} → Antwoordopties`,
        message: "Vermijd suggestieve absolute woorden in antwoordopties (altijd/nooit/uitsluitend/alleen/volledig/exact/etc.). Maak de optie logisch en plausibel zonder extremen.",
      });
    }
    // Protocol nuance:
    // - "Alle bovenstaande" blijft verboden.
    // - "Beide bovenstaande" + "Geen van bovenstaande" is toegestaan als set (exact 4 opties).
    if (isAlleBovenstaande(opt)) {
      issues.push({
        code: "all_of_above_forbidden",
        severity: "error",
        location: `${locationBase} → Antwoordopties`,
        message: "Vermijd 'alle bovenstaande' (niet toegestaan).",
      });
    }
    if ((isBeideBovenstaande(opt) || isGeenVanBovenstaande(opt)) && !allowBothNone) {
      issues.push({
        code: "both_or_none_pattern",
        severity: "warn",
        location: `${locationBase} → Antwoordopties`,
        message: "Gebruik 'Beide bovenstaande'/'Geen van bovenstaande' alleen samen in een 4-opties patroon (optie 1, optie 2, beide, geen).",
      });
    }
    if (/\bkan\b/i.test(opt)) {
      issues.push({
        code: "can_in_option",
        severity: "error",
        location: `${locationBase} → Antwoordopties`,
        message: "Vermijd 'kan' in antwoordopties (protocol). Formuleer direct en helder.",
      });
    }
    if (containsDisallowedPunctuationForStemOrOption(opt)) {
      issues.push({
        code: "option_punctuation",
        severity: "warn",
        location: `${locationBase} → Antwoordopties`,
        message: "Vermijd komma's/haakjes/leestekens in antwoordopties waar mogelijk (protocol).",
      });
    }
    if (looksLikeMultiElementOption(opt)) {
      issues.push({
        code: "option_multiple_elements",
        severity: "warn",
        location: `${locationBase} → Antwoordopties`,
        message: "Antwoordoptie lijkt meerdere elementen te combineren. Vermijd lijsten/combinaties; een simpele range (zoals '10 en 16') is ok.",
      });
    }
  }

  const overlaps = findOptionOverlapPairs(options);
  if (overlaps.length > 0) {
    issues.push({
      code: "option_overlap",
      severity: "error",
      location: `${locationBase} → Antwoordopties`,
      message: "Antwoordopties overlappen inhoudelijk/literally (een optie bevat een andere optie). Opties moeten elkaar uitsluiten; vermijd 'cover-all' opties.",
    });
  }

  // Protocol: avoid ambiguous distractors (must be wholly false, no debate).
  if (options.length >= 3 && typeof correctIndex === "number" && correctIndex >= 0 && correctIndex < options.length) {
    const correct = options[correctIndex] || "";
    const correctSet = tokenSet(correct);
    const study = typeof ctx?.studyText === "string" ? normalizeForCompare(ctx.studyText) : "";
    const correctNorm = normalizeForCompare(correct);

    // Specific correctness trap: study text uses "en/of" but exercise turns it into "en".
    // This can teach the wrong rule, so treat as a hard error when the pattern matches.
    if (study.includes("en/of")) {
      const all = normalizeForCompare([stem, explanation, ...options].join(" "));
      if (
        all.includes("veel afwijkt van het gemiddelde") &&
        all.includes("veel klachten") &&
        all.includes("afwijkt van het gemiddelde en") &&
        !all.includes("en/of")
      ) {
        issues.push({
          code: "and_or_required",
          severity: "error",
          location: `${locationBase} → Vraag/Uitleg`,
          message: "De studietekst gebruikt 'en/of'. Gebruik dit ook (niet 'en'), anders toets je een andere regel.",
        });
      }
    }

    for (let oi = 0; oi < options.length; oi++) {
      if (oi === correctIndex) continue;
      const d = options[oi] || "";
      const dNorm = normalizeForCompare(d);

      // Hedge words in distractors tend to make them partially true or debatable.
      if (containsHedge(d)) {
        issues.push({
          code: "distractor_hedge",
          severity: "error",
          location: `${locationBase} → Antwoordopties`,
          message: `Afleider bevat nuance/hedge ("meestal/soms/vaak/...") en kan daardoor (deels) waar zijn. Maak afleider ondubbelzinnig fout.`,
        });
      }

      // Avoid quantifier-based "giveaway" distractors ("alle ...") which often make options suggestive.
      if (containsAllQuantifier(d)) {
        issues.push({
          code: "distractor_all_quantifier",
          severity: "error",
          location: `${locationBase} → Antwoordopties`,
          message: "Vermijd 'alle/allemaal' in afleiders (te suggestief; vaak niet creatief). Maak de afleider logisch fout zonder kwantificeren.",
        });
      }

      // Near-duplicate distractors create ambiguity (multiple plausible answers).
      const sim = jaccard(correctSet, tokenSet(d));
      if (sim >= 0.7) {
        issues.push({
          code: "distractor_too_similar",
          severity: "error",
          location: `${locationBase} → Antwoordopties`,
          message: "Afleider lijkt te sterk op het correcte antwoord (ambigue). Maak duidelijk fout en inhoudelijk verschillend.",
        });
      }

      // If the distractor is literally supported by the study text (verbatim/near-verbatim),
      // it is likely (partly) true and therefore forbidden as a distractor under this protocol.
      // Avoid false positives for short tokens (e.g., numbers like "0" that can be valid false distractors).
      const dTokens = dNorm ? dNorm.split(" ").filter(Boolean) : [];
      const isShortToken = dNorm.length < 12 || dTokens.length < 3;
      if (study && dNorm && !isShortToken && study.includes(dNorm)) {
        issues.push({
          code: "distractor_supported_by_text",
          severity: "error",
          location: `${locationBase} → Antwoordopties`,
          message: "Afleider komt (bijna letterlijk) voor in de studietekst en kan daardoor (deels) waar zijn. Kies een afleider die de studietekst tegenspreekt.",
        });
      }

      // Avoid double-negative confusion in correctness tasks (general guard).
      if (containsNegation(stem) && containsNegation(d)) {
        issues.push({
          code: "double_negation_risk",
          severity: "warn",
          location: `${locationBase} → Vraag/Stelling`,
          message: "Mogelijke dubbele ontkenning (stem + afleider). Overweeg herformulering.",
        });
      }

      // Basic guard: exact string match duplicates (even if token-similarity misses due to punctuation)
      if (dNorm && correctNorm && dNorm === correctNorm) {
        issues.push({
          code: "distractor_equals_correct",
          severity: "error",
          location: `${locationBase} → Antwoordopties`,
          message: "Afleider is identiek aan het correcte antwoord.",
        });
      }
    }
  }

  // Ambiguity sources
  const sAll = `${stem}\n${explanation}`.toLowerCase();
  if (/\b(altijd|nooit)\b/.test(sAll)) {
    issues.push({
      code: "absolute_language",
      severity: "warn",
      location: `${locationBase} → Vraag/Uitleg`,
      message: "Vermijd absolute termen zoals 'altijd/nooit' (vaak discussiegevoelig).",
    });
  }
  if (/\bkan\b/.test(sAll)) {
    issues.push({
      code: "can_language",
      severity: "warn",
      location: `${locationBase} → Vraag/Uitleg`,
      message: "Vermijd 'kan' als dit verkeerde opties niet 100% fout maakt.",
    });
  }

  return issues;
}

function lintExerciseSet(setCandidate: ExerciseSet, ctx?: { studyText?: string }): LintIssue[] {
  const out: LintIssue[] = [];
  const exercises = Array.isArray(setCandidate?.exercises) ? setCandidate.exercises : [];
  for (let i = 0; i < exercises.length; i++) {
    out.push(...lintExercise(exercises[i], i, ctx));
  }
  return out;
}

const SENIOR_REVISOR_SYSTEM_PROMPT = `Je bent een senior revisor van ExpertCollege. Je geeft feedback op oefenvragen in het Nederlands, alsof je Word-comments plaatst.

Schrijf kort, direct en protocollair. Spreek de auteur aan met "je".
Gebruik waar passend deze stijl-ankers: "Let op…", "Dit is niet toegestaan…", "Protocol:", "Suggestie:", "Verander in:", "Idem.", "Geldt voor de gehele oefenset."

Je taak is niet alleen feedback geven, maar ook de inhoud te corrigeren zodat deze voldoet aan het protocol en geen discussie over juistheid oplevert.

Harde eisen:
- Output ALLEEN geldige JSON (geen markdown).
- Genereer EXACT 3 oefeningen.
- Elke oefening heeft EXACT één [blank] placeholder.
- Elke oefening heeft 3 of 4 antwoordopties, met precies 1 correct antwoord (correctIndex).
- Alle tekst is Nederlands.
- Voeg geen nieuwe feiten toe die niet uit de studietekst volgen.

Controlepunten (kort):
- Eén kenniselement per oefening.
- Distractors moeten 100% fout zijn (geen gedeeltelijk waar, geen "ook waar maar minder compleet", geen ambiguity).
- Afleiders moeten logisch klinken en plausibel zijn, maar in deze context ondubbelzinnig fout (voorkom discussie).
- Vermijd suggestieve absolute woorden in antwoordopties (altijd/nooit/uitsluitend/alleen/enkel/slechts/volledig/exact/etc.).
- Vermijd negatieve formuleringen waar mogelijk. Als een negatie het duidelijker maakt: geen dubbele ontkenning en geen trucvraag.
- Vermijd "kan" in antwoordopties en stelling (formuleer direct).
- GEEN hedges in afleiders zoals "meestal/soms/vaak/in principe/in enkele gevallen".
- Antwoordopties: vergelijkbaar format/lengte; geen opvallende afkorting als enige; begin met hoofdletter.
- Vermijd "en/of" en combinaties van twee losse kenniselementen in één optie. Een simpele range (zoals "10 en 16") is ok.
- Antwoordopties moeten elkaar uitsluiten: geen "cover-all" optie die een andere optie letterlijk bevat, en geen opties die elkaars deelverzameling zijn.
- Vermijd leestekens zoals komma's/haakjes in vraag/stelling en antwoordopties (cijfers met decimale komma zijn OK).
- Theorie/extra info: bondig, verklapt het antwoord niet, geen herhaling zonder waarde.
- Vermijd dubbele ontkenning.
- Als een afleider mogelijk ook waar kan zijn, herschrijf de vraag/casus zodat die afleider ondubbelzinnig fout wordt.

Specifiek voor deze generator:
- Als lint code 'distractor_too_similar' verschijnt: herschrijf de afleider(s) zodat ze een ander kenniselement testen (andere invalshoek), en maak de correcte optie uniek zonder suggestieve woorden.
- Schrijf menselijk (geen academische taal). Houd de zinnen kort.

Output schema:
{
  "comments": [
    { "location": "Variant 1 → Antwoordopties", "comment": "..." }
  ],
  "exercises": [
    { "stem": "...", "options": ["..."], "correctIndex": 0, "explanation": "..." }
  ]
}`;

function buildSeniorRevisionPrompt(args: {
  levelHint: "MBO" | "HBO" | "UNKNOWN";
  subject: string;
  audience: string;
  groupName: string;
  objectiveDescription: string;
  studyText: string;
  issues: LintIssue[];
  exercises: any[];
}): string {
  const {
    levelHint,
    subject,
    audience,
    groupName,
    objectiveDescription,
    studyText,
    issues,
    exercises,
  } = args;

  const issuesText =
    issues.length === 0
      ? "Geen issues gedetecteerd door de validator."
      : issues
          .map((i) => `- [${i.severity}] ${i.code} @ ${i.location}: ${i.message}`)
          .join("\n");

  return `Niveau-hint: ${levelHint}
Doelgroep: ${audience}
Onderwerp: ${subject}
Groep: ${groupName}

Leerdoel (bedoeling):
${objectiveDescription}

Studietekst (bron - baseer je correcties hierop):
${studyText}

Validator issues:
${issuesText}

Huidige oefeningen (JSON):
${JSON.stringify({ exercises }, null, 2)}

Opdracht:
1) Schrijf senior-revision comments (kort, Word-comment stijl).
2) Corrigeer de 3 oefeningen zodat alle issues opgelost zijn en alle harde eisen gelden.
Return alleen JSON volgens het schema uit de system prompt.`;
}

type QualityAuditViolation = {
  exerciseIndex: number;
  optionIndex?: number;
  code: string;
  message: string;
  evidenceQuote?: string;
};

type QualityAuditEvidence = {
  exerciseIndex: number;
  correctQuote: string;
  distractors: Array<{ optionIndex: number; quote: string }>;
};

type QualityAuditResult = {
  ok: boolean;
  violations?: QualityAuditViolation[];
  fixed?: { exercises: any[] };
  evidence?: QualityAuditEvidence[];
};

const EC_EXPERT_QUALITY_AUDIT_SYSTEM_PROMPT = `Je bent een extreem strenge kwaliteitscontroleur voor ExpertCollege (maximale strictheid).

Doel: afdwingen dat afleiders logisch klinken maar 100% fout zijn, zonder suggestieve/extreme taal.

Harde eisen (MOETEN):
- Output ALLEEN geldige JSON (geen markdown).
- EXACT 3 oefeningen.
- EXACT 1 [blank] per stem.
- 3 of 4 antwoordopties, precies 1 correct antwoord (correctIndex).
- Geen negatieve formuleringen met "niet" of "geen" in stem of antwoordopties.
- Geen suggestieve/extreme woorden in stem of antwoordopties: altijd/nooit/uitsluitend/alleen/enkel/slechts/volledig/exact/per definitie/zonder uitzondering/alle/elk.
- Geen "kan" in antwoordopties.
- Geen opties met "en/of" (één kenniselement per optie).
- Opties sluiten elkaar uit: geen overlap en geen "cover-all" optie die een andere optie letterlijk bevat.

Semantische eis (MAX STRICT):
- Elke afleider moet expliciet door de studietekst worden weerlegd.
- Je moet per afleider een quote uit de studietekst geven die de afleider weerlegt (kopieer letterlijk; geen parafrase; geen extra tekst).
- Als je geen letterlijke quote kunt geven die de afleider weerlegt, dan is de afleider NIET toegestaan → herschrijf de oefening met nieuwe afleiders die wél expliciet tegenspreken.

Output schema:
{
  "ok": true | false,
  "fixed": {
    "exercises": [
      { "stem": "...", "options": ["..."], "correctIndex": 0, "explanation": "...", "hints": { "nudge": "...", "guide": "...", "reveal": "..." } }
    ]
  },
  "evidence": [
    {
      "exerciseIndex": 0,
      "correctQuote": "Quote uit de studietekst die het correcte antwoord ondersteunt",
      "distractors": [
        { "optionIndex": 1, "quote": "Quote uit de studietekst die deze afleider weerlegt" }
      ]
    }
  ],
  "violations": [
    { "exerciseIndex": 0, "optionIndex": 1, "code": "distractor_not_contradicted", "message": "...", "evidenceQuote": "..." }
  ]
}

Regels:
- Return ALLEEN JSON. Niets erbuiten.
- ALWAYS return fixed.exercises (dit is de definitieve set die je wilt dat wij gebruiken).
- ALWAYS return evidence voor fixed.exercises (alle 3 oefeningen; alle afleiders).
- Zet ok=true alleen als je bewijs compleet is en fixed.exercises aan alle harde eisen voldoet.`;

function buildQualityAuditPrompt(args: {
  subject: string;
  audience: string;
  groupName: string;
  objectiveDescription: string;
  studyText: string;
  exercises: any[];
}): string {
  const { subject, audience, groupName, objectiveDescription, studyText, exercises } = args;
  return `Onderwerp: ${subject}
Doelgroep: ${audience}
Groep: ${groupName}
Leerdoel:
${objectiveDescription}

Studietekst (bron):
${studyText}

Oefeningen (JSON):
${JSON.stringify({ exercises }, null, 2)}

Opdracht:
Controleer maximaal strikt. Return JSON volgens schema.`;
}

function coerceBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
  }
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "1") return true;
    if (s === "0") return false;
  }
  return null;
}

function extractQualityAuditResult(parsed: any, depth = 0): QualityAuditResult | null {
  if (!parsed || typeof parsed !== "object") return null;
  if (depth > 3) return null;

  const okRaw =
    (parsed as any).ok ??
    (parsed as any).OK ??
    (parsed as any).valid ??
    (parsed as any).passed ??
    (parsed as any).pass ??
    (parsed as any).success;
  const ok = coerceBoolean(okRaw);
  if (ok !== null) {
    return { ...(parsed as any), ok } as QualityAuditResult;
  }

  // Common nested wrappers
  const candidates = [
    (parsed as any).result,
    (parsed as any).audit,
    (parsed as any).data,
    (parsed as any).output,
  ].filter(Boolean);
  for (const c of candidates) {
    const found = extractQualityAuditResult(c, depth + 1);
    if (found) return found;
  }

  return null;
}

function parseAuditJsonFromText(raw: string): any {
  const looksLikeAuditRoot = (x: any): boolean => {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return (
      "ok" in o ||
      "OK" in o ||
      "evidence" in o ||
      "violations" in o ||
      "fixed" in o ||
      "result" in o ||
      "audit" in o
    );
  };

  // First try the shared extractor (handles fences, repairs, etc.).
  // IMPORTANT: if it returns an inner object (e.g., first element of evidence array),
  // we must not accept it; fall through to brace-less recovery.
  try {
    const parsed = extractJsonFromText(raw);
    if (looksLikeAuditRoot(parsed)) return parsed;
  } catch {
    // fall through
  }

  // Handle brace-less or "missing-opening-brace" top-level objects (common with JSON prefill).
  // Example: `"ok": true, "evidence": [...], "fixed": {...}`
  // We reconstruct the top-level object by extracting balanced regions for known keys.
  const t = String(raw || "").trim();
  if (!t) throw new Error("invalid_json");
  if (!/\"ok\"\s*:/i.test(t)) throw new Error("invalid_json");

  function extractBalanced(input: string, openChar: "{" | "[", closeChar: "}" | "]", startIndex: number): { text: string; end: number } | null {
    const start = input.indexOf(openChar, startIndex);
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let esc = false;
    for (let i = start; i < input.length; i++) {
      const ch = input[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === "\"") { inString = !inString; continue; }
      if (inString) continue;
      if (ch === openChar) depth++;
      else if (ch === closeChar) {
        depth--;
        if (depth === 0) {
          return { text: input.slice(start, i + 1), end: i + 1 };
        }
      }
    }
    return null;
  }

  function extractRegionAfterKey(input: string, key: string, openChar: "{" | "[", closeChar: "}" | "]"): string | null {
    const needle = `"${String(key || "").toLowerCase()}"`;
    const lower = input.toLowerCase();
    const keyIdx = lower.indexOf(needle);
    if (keyIdx === -1) return null;

    // Scan forward:  "key"  <ws> : <ws> [ or {
    let i = keyIdx + needle.length;
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length || input[i] !== ":") return null;
    i++;
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length || input[i] !== openChar) return null;

    const start = i;
    const region = extractBalanced(input, openChar, closeChar, start);
    return region?.text || null;
  }

  const okMatch = t.match(/\"ok\"\s*:\s*(true|false|\"true\"|\"false\"|1|0)/i);
  if (!okMatch) throw new Error("invalid_json");
  const okValRaw = okMatch[1];
  const okVal =
    okValRaw === "1" ? "true" :
    okValRaw === "0" ? "false" :
    okValRaw.replace(/\"/g, "");

  const evidence = extractRegionAfterKey(t, "evidence", "[", "]");
  const violations = extractRegionAfterKey(t, "violations", "[", "]");
  const fixed = extractRegionAfterKey(t, "fixed", "{", "}");

  const parts: string[] = [];
  parts.push(`\"ok\": ${okVal}`);
  if (evidence) parts.push(`\"evidence\": ${evidence}`);
  if (violations) parts.push(`\"violations\": ${violations}`);
  if (fixed) parts.push(`\"fixed\": ${fixed}`);

  const reconstructed = `{\n  ${parts.join(",\n  ")}\n}`;
  return JSON.parse(reconstructed);
}

function validateAuditEvidenceAgainstStudyText(studyText: string, set: ExerciseSet, audit: QualityAuditResult): { ok: boolean; reason?: string } {
  if (!audit || audit.ok !== true) return { ok: false, reason: "audit_not_ok" };
  if (!Array.isArray(audit.evidence) || audit.evidence.length !== set.exercises.length) {
    return { ok: false, reason: "audit_evidence_missing_or_wrong_count" };
  }

  const studyNorm = normalizeForQuoteMatch(studyText);
  if (!studyNorm) return { ok: false, reason: "study_text_empty" };

  for (const e of audit.evidence) {
    if (!e || typeof e !== "object") return { ok: false, reason: "audit_evidence_invalid" };
    if (typeof e.exerciseIndex !== "number" || e.exerciseIndex < 0 || e.exerciseIndex >= set.exercises.length) {
      return { ok: false, reason: "audit_evidence_bad_exerciseIndex" };
    }
    if (typeof e.correctQuote !== "string" || !e.correctQuote.trim()) {
      return { ok: false, reason: "audit_correctQuote_missing" };
    }
    const cq = normalizeForQuoteMatch(e.correctQuote);
    if (cq.length < 12) return { ok: false, reason: "audit_correctQuote_too_short" };
    if (!studyNorm.includes(cq)) {
      return { ok: false, reason: "audit_correctQuote_not_in_text" };
    }

    const ex: any = set.exercises[e.exerciseIndex];
    const options = Array.isArray(ex?.options) ? ex.options.map(String) : [];
    const correctIndex = typeof ex?.correctIndex === "number" ? ex.correctIndex : -1;
    const expectedDistractors = Math.max(0, options.length - 1);

    if (!Array.isArray(e.distractors) || e.distractors.length !== expectedDistractors) {
      return { ok: false, reason: "audit_distractors_missing_or_wrong_count" };
    }

    for (const d of e.distractors) {
      if (!d || typeof d !== "object") return { ok: false, reason: "audit_distractor_invalid" };
      if (typeof d.optionIndex !== "number" || d.optionIndex < 0 || d.optionIndex >= options.length) {
        return { ok: false, reason: "audit_distractor_bad_optionIndex" };
      }
      if (d.optionIndex === correctIndex) return { ok: false, reason: "audit_distractor_points_to_correct" };
      if (typeof d.quote !== "string" || !d.quote.trim()) return { ok: false, reason: "audit_distractor_quote_missing" };
      const dq = normalizeForQuoteMatch(d.quote);
      if (dq.length < 12) return { ok: false, reason: "audit_distractor_quote_too_short" };
      if (!studyNorm.includes(dq)) return { ok: false, reason: "audit_distractor_quote_not_in_text" };
    }
  }

  return { ok: true };
}

function deriveLevelHint(audience: string): "MBO" | "HBO" | "UNKNOWN" {
  const s = String(audience || "").toLowerCase();
  if (s.includes("mbo")) return "MBO";
  if (s.includes("hbo")) return "HBO";
  return "UNKNOWN";
}

function buildAnalysisPrompt(args: {
  studyText: string;
  subject: string;
  audience: string;
  clusterPlan: ClusterPlan[];
}): string {
  const { studyText, subject, audience, clusterPlan } = args;
  const total = clusterPlan.length;
  // Ask for more candidates than we ultimately need so we can skip "hard to write well" objectives.
  // Keep bounded to avoid token blow-ups.
  const maxCandidates = Math.min(12, Math.max(4, total * 3));
  // Prefer maximum candidates (bounded) so we have enough slack to fill all clusters even under retries/filters.
  const desiredCandidates = maxCandidates;
  const countsByGroup = new Map<number, { name: string; n: number }>();
  for (const c of clusterPlan) {
    const prev = countsByGroup.get(c.groupId) || { name: c.groupName, n: 0 };
    countsByGroup.set(c.groupId, { name: prev.name, n: prev.n + 1 });
  }
  const groupLines = Array.from(countsByGroup.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([groupId, v]) => `- groupId=${groupId} "${v.name}": richtlijn max ${v.n} leerdoel(en)`)
    .join("\n");

  return `Lees de studietekst en formuleer alleen heldere, relevante leerdoelen die je ook écht goed kunt toetsen.

ONDERWERP: ${subject}
DOELGROEP: ${audience}

CONTEXT:
- We moeten ${total} clusters vullen (1 leerdoel per cluster → 3 oefenvarianten).
- Geef bij voorkeur MINIMAAL ${desiredCandidates} leerdoelen (max ${maxCandidates}) zodat we genoeg keuze hebben om alle clusters te vullen.
- Geef alleen minder als het echt niet lukt om goede, discussie-vrije afleiders te bedenken.
- Vul NIET op met vage of twijfelachtige leerdoelen. Als het lastig is om goede afleiders te bedenken zonder discussie, neem dat leerdoel dan niet op.

RICHTLIJNEN VOOR GOEDE LEERDOELEN:
- 1 kenniselement per leerdoel (concreet, niet abstract).
- Direct af te leiden uit de tekst (geen extra kennis toevoegen).
- "Opgavebaar": je kunt 3 oefeningen maken met 3-4 opties, 1 [blank], en afleiders die logisch klinken maar in deze context duidelijk fout zijn.
- Vermijd "getallenfeitjes" als leerdoel (ml/jaar/%). Kies liever leerdoelen over begrippen, rollen, taken, definities, verschil tussen termen, of wat het doel van iets is.
- Als een leerdoel tóch om een getal draait, neem het alleen op als het echt essentieel is voor begrip (geen triviale cijferquiz).

GROEPEN (optioneel, helpt met variatie):
${groupLines}

STUDIETEKST:
${studyText}

OUTPUT FORMAAT (JSON):
{
  "objectives": [
    {
      "id": "obj-1",
      "description": "De student weet dat ...",
      "bloomLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create",
      "exerciseable": true,
      "whyEasy": "1 zin waarom dit goed toetsbaar is zonder discussie",
      "evidenceQuote": "Letterlijke quote uit de studietekst die dit leerdoel ondersteunt"
    }
  ]
}

BELANGRIJK:
- Output ALLEEN geldige JSON (geen markdown).
- Geef tussen 1 en ${maxCandidates} leerdoelen.
- Schrijf menselijk (geen academische formuleringen).
`;
}

function buildExerciseGenerationPrompt(args: {
  objective: LearningObjective;
  studyText: string;
  subject: string;
  audience: string;
  groupName: string;
  variantsNeeded: number;
}): string {
  const { objective, studyText, subject, audience, groupName, variantsNeeded } = args;
  return `Genereer EXACT ${variantsNeeded} oefenvarianten voor het volgende leerdoel.

ONDERWERP: ${subject}
DOELGROEP: ${audience}
GROEP: ${groupName}
BLOOM NIVEAU: ${objective.bloomLevel}

LEERDOEL:
${objective.description}

STUDIETEKST (referentie):
${studyText}

EISEN PER OEFENING:
- 1 duidelijke vraag/stelling met EXACT één [blank] placeholder
- 3-4 antwoordopties (waarvan precies één correct)
- correctIndex als 0-based index
- uitleg (explanation) waarom het correcte antwoord correct is (Nederlands, menselijk, 1-3 zinnen)
- hints als object: { nudge, guide, reveal } (allemaal korte zinnen)
- Schrijf menselijk en op niveau. Vermijd academische formuleringen ("bij analyse", "primair bepaald door").
- Gebruik bij voorkeur de je-vorm.
- Optioneel: begin met een korte "Theorie:" of "Casus:" (1-2 zinnen) als dat helpt.
- Maak dit géén getallenquiz. Kies bij voorkeur een leerdoel met tekstuele opties (begrippen/rollen/taken/definities).
- Afleiders: plausibel, zelfde format/lengte, maar ondubbelzinnig fout in deze context.
- Vermijd suggestieve/extreme woorden in antwoordopties: altijd/nooit/uitsluitend/alleen/enkel/slechts/volledig/exact.
- Vermijd hedges in afleiders: meestal/soms/vaak/in principe/in enkele gevallen.
- Vermijd "kan" in antwoordopties (maakt het vaak debatbaar).
- Vermijd dubbelzinnige overlap tussen opties.
- Vermijd lijsten/combinaties van twee kenniselementen in één optie. "En/of" is niet toegestaan. Een simpele range zoals "10 en 16" is ok.
- Negatie: liever positief formuleren. Als "niet/geen" de vraag duidelijker maakt, gebruik het zonder dubbele ontkenning en zonder trucvraag.
- Vermijd komma's/haakjes in stem en antwoordopties (cijfers met decimale komma zijn OK).
- Afleiders moeten logisch klinken, qua format vergelijkbaar, en strijdig zijn met de studietekst of met de context van de vraag.
- Antwoordopties moeten elkaar uitsluiten; vermijd "cover-all" opties zoals "A of B of beide" of opties die andere opties letterlijk bevatten.

OUTPUT FORMAAT (JSON):
{
  "exercises": [
    {
      "stem": "Vraag met [blank] placeholder",
      "options": ["optie 1", "optie 2", "optie 3", "optie 4"],
      "correctIndex": 0,
      "explanation": "Uitleg waarom het correcte antwoord correct is"
    }
  ]
}

BELANGRIJK:
- ALLE tekst moet in het Nederlands zijn.
- Return alleen geldige JSON, geen markdown.`;
}

function toHintSet(hints: unknown): HintSet | undefined {
  if (!hints) return undefined;
  if (typeof hints === "object" && hints !== null) {
    const h = hints as Record<string, unknown>;
    const nudge = typeof h.nudge === "string" ? h.nudge : undefined;
    const guide = typeof h.guide === "string" ? h.guide : undefined;
    const reveal = typeof h.reveal === "string" ? h.reveal : undefined;
    if (nudge || guide || reveal) return { nudge, guide, reveal };
  }
  if (Array.isArray(hints)) {
    const [n, g, r] = hints.map((x) => (typeof x === "string" ? x : ""));
    const out: HintSet = {};
    if (n) out.nudge = n;
    if (g) out.guide = g;
    if (r) out.reveal = r;
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

const BLOOM_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"] as const;
type BloomLevel = (typeof BLOOM_LEVELS)[number];

function normalizeBloomLevel(v: unknown): BloomLevel | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  // Accept minor variants
  const normalized =
    s === "analyse" ? "analyze" :
    s === "analyseren" ? "analyze" :
    s === "onthouden" ? "remember" :
    s === "begrijpen" ? "understand" :
    s === "toepassen" ? "apply" :
    s === "evalueren" ? "evaluate" :
    s === "creëren" ? "create" :
    s;
  return (BLOOM_LEVELS as readonly string[]).includes(normalized) ? (normalized as BloomLevel) : null;
}

function extractObjectives(parsed: any, maxCount: number): LearningObjective[] | null {
  let arr: any[] | null = null;
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === "object") {
    // Some models prefer grouped output: { "groups": [ { groupId, objectives: [...] }, ... ] }
    if (Array.isArray((parsed as any).groups)) {
      const groups = (parsed as any).groups as any[];
      const flattened: any[] = [];
      for (const g of groups) {
        const objArr =
          (g && typeof g === "object" && Array.isArray((g as any).objectives) && (g as any).objectives) ||
          (g && typeof g === "object" && Array.isArray((g as any).learningObjectives) && (g as any).learningObjectives) ||
          null;
        if (Array.isArray(objArr)) {
          for (const o of objArr) flattened.push(o);
        }
      }
      if (flattened.length > 0) {
        arr = flattened;
      }
    }
    const direct =
      (Array.isArray(parsed.objectives) && parsed.objectives) ||
      (Array.isArray(parsed.learningObjectives) && parsed.learningObjectives) ||
      (Array.isArray(parsed.learning_objectives) && parsed.learning_objectives);
    if (direct) {
      arr = direct;
    } else {
      const arrays = Object.values(parsed).filter((v) => Array.isArray(v)) as any[][];
      if (arrays.length === 1) arr = arrays[0];
      else if (arrays.length > 1) {
        // Prefer an array of objects that looks like objectives (has description)
        const likely = arrays.find((a) => a.some((x) => x && typeof x === "object" && ("description" in x || "doel" in x)));
        if (likely) arr = likely;
      }
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const out: LearningObjective[] = [];
  for (let i = 0; i < arr.length && out.length < maxCount; i++) {
    const cand = arr[i];
    // If the model returns a list of strings, interpret them as descriptions.
    if (typeof cand === "string") {
      const description = cand.trim();
      if (!description) return null;
      out.push({ id: `obj-${out.length + 1}`, description, bloomLevel: "understand" } as LearningObjective);
      continue;
    }
    if (!cand || typeof cand !== "object") return null;
    const c = cand as Record<string, unknown>;

    // New: models may mark objectives as "not exerciseable" — skip them instead of padding with weak objectives.
    const exerciseableRaw =
      (typeof (c as any).exerciseable === "boolean" ? (c as any).exerciseable : null) ??
      (typeof (c as any).exerciseAble === "boolean" ? (c as any).exerciseAble : null) ??
      (typeof (c as any).isExerciseable === "boolean" ? (c as any).isExerciseable : null);
    const skipRaw =
      (typeof (c as any).skip === "boolean" ? (c as any).skip : null) ??
      (typeof (c as any).skipped === "boolean" ? (c as any).skipped : null);
    const difficultyRaw = typeof (c as any).difficulty === "string" ? String((c as any).difficulty).toLowerCase() : "";
    const shouldSkip =
      exerciseableRaw === false ||
      skipRaw === true ||
      /\bhard\b/.test(difficultyRaw) ||
      /\bskip\b/.test(difficultyRaw);
    if (shouldSkip) {
      continue;
    }

    const descriptionRaw =
      (typeof c.description === "string" && c.description) ||
      (typeof c.text === "string" && c.text) ||
      (typeof c.objective === "string" && c.objective) ||
      (typeof c.learningObjective === "string" && c.learningObjective) ||
      (typeof c.learning_objective === "string" && c.learning_objective) ||
      (typeof c.title === "string" && c.title) ||
      (typeof c.doel === "string" && c.doel) ||
      "";
    const description = String(descriptionRaw || "").trim();
    // Filter: skip "BS" objectives that mainly test prevalence / exact numbers (low value).
    if (looksLikeNumericTriviaObjective(description)) {
      continue;
    }
    const bloom =
      normalizeBloomLevel(c.bloomLevel) ||
      normalizeBloomLevel(c.bloom_level) ||
      normalizeBloomLevel(c.bloom) ||
      normalizeBloomLevel(c.level) ||
      // Default if the model omitted the bloom level despite instructions.
      "understand";
    const idRaw =
      (typeof c.id === "string" && c.id) ||
      (typeof c.objectiveId === "string" && c.objectiveId) ||
      (typeof c.objective_id === "string" && c.objective_id) ||
      `obj-${out.length + 1}`;
    const id = String(idRaw).trim();
    if (!id || !description || !bloom) return null;
    out.push({ id, description, bloomLevel: bloom } as LearningObjective);
  }

  // We allow fewer than maxCount; do not pad with weak objectives.
  if (out.length === 0) return null;
  return out;
}

function extractExerciseSet(parsed: any, objectiveId: string, variantsNeeded: number): ExerciseSet | null {
  let arr: any[] | null = null;
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === "object") {
    const direct =
      (Array.isArray(parsed.exercises) && parsed.exercises) ||
      (Array.isArray(parsed.items) && parsed.items) ||
      (Array.isArray(parsed.questions) && parsed.questions);
    if (direct) arr = direct;
    else {
      const arrays = Object.values(parsed).filter((v) => Array.isArray(v)) as any[][];
      if (arrays.length === 1) arr = arrays[0];
      else if (arrays.length > 1) {
        const likely = arrays.find((a) => a.some((x) => x && typeof x === "object" && ("options" in x || "choices" in x)));
        if (likely) arr = likely;
      }
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const exercises: any[] = [];
  for (let i = 0; i < arr.length; i++) {
    const cand = arr[i];
    if (!cand || typeof cand !== "object") continue;
    const c = cand as Record<string, unknown>;
    const stemRaw =
      (typeof c.stem === "string" && c.stem) ||
      (typeof c.question === "string" && c.question) ||
      (typeof c.text === "string" && c.text) ||
      "";
    const stem = String(stemRaw).trim();
    const optionsRaw = (Array.isArray(c.options) && c.options) || (Array.isArray(c.choices) && c.choices) || null;
    const options = Array.isArray(optionsRaw) ? optionsRaw.map(String).map((s) => s.trim()).filter(Boolean) : null;
    const correctIndex =
      (typeof c.correctIndex === "number" ? c.correctIndex : null) ??
      (typeof c.correct_index === "number" ? c.correct_index : null) ??
      (typeof c.correctAnswerIndex === "number" ? c.correctAnswerIndex : null) ??
      null;
    const explanationRaw =
      (typeof c.explanation === "string" && c.explanation) ||
      (typeof c.explain === "string" && c.explain) ||
      (typeof c.rationale === "string" && c.rationale) ||
      "";
    const explanation = String(explanationRaw).trim();
    const hints = (c.hints as unknown) ?? undefined;

    if (!stem || !options || options.length < 3) continue;
    const fixedOptions = options.slice(0, 4);
    if (typeof correctIndex !== "number" || correctIndex < 0 || correctIndex >= fixedOptions.length) continue;
    if (!explanation) continue;

    exercises.push({
      stem,
      options: fixedOptions,
      correctIndex,
      explanation,
      hints,
      difficulty: (typeof c.difficulty === "string" ? c.difficulty : undefined),
    });
  }

  if (exercises.length < variantsNeeded) return null;
  const trimmed = exercises.slice(0, variantsNeeded);
  const set: ExerciseSet = { objectiveId, exercises: trimmed as any };
  return isValidExerciseSet(set) ? set : null;
}

export const ecExpertProtocol: GenerationProtocol = {
  id: "ec-expert",
  name: "ExpertCollege Exercise Protocol",
  requiresStudyText: true,
  supportsFormats: ["practice", "learnplay-v1"],

  async fillCourse(args: ProtocolFillArgs): Promise<ProtocolFillResult> {
    const { skeleton, ctx, input } = args;
    const timeoutMs = typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs) ? args.timeoutMs : 120_000;

    const studyText = typeof input.studyText === "string" ? input.studyText.trim() : "";
    if (!studyText) return { ok: false, error: "missing_studyText" };

    const clusterPlan = buildClusterPlan(skeleton);
    if (clusterPlan.length === 0) return { ok: false, error: "missing_clusters" };
    // This protocol relies on the system's fixed variant model (1/2/3).
    // If the skeleton has incomplete clusters (e.g. itemsPerGroup not divisible by 3),
    // we fail loud so the caller can adjust generation parameters.
    for (const c of clusterPlan) {
      if (c.itemIndexes.length !== 3) {
        return { ok: false, error: `cluster_variants_mismatch:${c.clusterId}:${c.itemIndexes.length}` };
      }
    }

    // Ask for more candidates than we ultimately need so we can skip low-value / hard-to-write objectives.
    // Keep bounded to avoid token blow-ups.
    const maxCandidateObjectives = Math.min(12, Math.max(4, clusterPlan.length * 3));

    // PASS 1: Extract ONLY exerciseable objectives (we prefer to skip hard/ambiguous objectives).
    const analysisPrompt = buildAnalysisPrompt({
      studyText,
      subject: input.subject,
      audience: input.audience,
      clusterPlan,
    });

    const analysisRes = await generateJson({
      system: EC_EXPERT_SYSTEM_PROMPT,
      prompt: analysisPrompt,
      maxTokens: 1700,
      temperature: 0.2,
      prefillJson: true,
      timeoutMs: Math.min(timeoutMs, 70_000),
    });

    if (!analysisRes.ok) return { ok: false, error: `analysis_failed: ${analysisRes.error || "llm_failed"}` };

    // Best-effort debug artifact: store the raw analysis response for troubleshooting.
    // NOTE: Do not log secrets; this stores only model output under the course bucket.
    try {
      // @ts-ignore - npm import in Deno edge
      const { createClient } = await import("npm:@supabase/supabase-js@2");
      const url = Deno.env.get("SUPABASE_URL");
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (url && key) {
        const supabase = createClient(url, key);
        const path = `debug/protocol-ec-expert/analysis-${skeleton.id}-${Date.now()}.json`;
        await supabase.storage.from("courses").upload(
          path,
          JSON.stringify(
            {
              requestId: ctx.requestId,
              courseId: skeleton.id,
              maxObjectiveCount: clusterPlan.length,
              maxCandidateObjectives,
              clusterPlan: clusterPlan.map((c) => ({ groupId: c.groupId, groupName: c.groupName, clusterId: c.clusterId })),
              raw: analysisRes.text,
            },
            null,
            2
          ),
          { upsert: true, contentType: "application/json" }
        );
      }
    } catch {
      // best-effort only
    }

    let parsedAnalysis: any;
    try {
      parsedAnalysis = extractJsonFromText(analysisRes.text);
    } catch (e) {
      return { ok: false, error: `analysis_json_parse_failed: ${String(e)}` };
    }
    let objectives = extractObjectives(parsedAnalysis, maxCandidateObjectives);
    if (!objectives) {
      // Bounded retry with stricter instruction (common failure mode: wrong key names or wrong count).
      const retryPrompt =
        analysisPrompt +
        `\n\nREPAIR:\nJe vorige output was ongeldig. Output nu 1..${clusterPlan.length} objectives in het schema {"objectives":[{"id":"obj-1","description":"De student weet dat ...","bloomLevel":"understand","exerciseable":true,"whyEasy":"...","evidenceQuote":"..."}]}.`;
      const retryRes = await generateJson({
        system: EC_EXPERT_SYSTEM_PROMPT,
        prompt: retryPrompt,
        maxTokens: 2500,
        temperature: 0.1,
        prefillJson: true,
        timeoutMs: Math.min(timeoutMs, 70_000),
      });
      if (!retryRes.ok) return { ok: false, error: `analysis_failed_retry: ${retryRes.error || "llm_failed"}` };
      let retryParsed: any;
      try {
        retryParsed = extractJsonFromText(retryRes.text);
      } catch (e) {
        return { ok: false, error: `analysis_json_parse_failed_retry: ${String(e)}` };
      }
      objectives = extractObjectives(retryParsed, maxCandidateObjectives);
      if (!objectives) return { ok: false, error: "analysis_invalid_objectives" };
    }
    // Keep legacy validator check as a guardrail (should always pass if extractObjectives succeeded).
    if (!isValidObjectiveList(objectives)) return { ok: false, error: "analysis_invalid_objectives" };

    // If we don't have enough candidates to reliably fill all clusters, ask for additional objectives.
    // We do this BEFORE exercise generation so later clusters don't starve.
    const desiredCandidateObjectives = maxCandidateObjectives;
    if (objectives.length < desiredCandidateObjectives) {
      const need = desiredCandidateObjectives - objectives.length;
      const existingLines = objectives.map((o) => `- ${o.description}`).join("\n");
      const topUpPrompt = `Je vorige output bevatte te weinig leerdoelen om alle clusters te vullen.

ONDERWERP: ${input.subject}
DOELGROEP: ${input.audience}

We hebben al deze leerdoelen:
${existingLines || "(geen)"}

TAAK:
- Bedenk EXACT ${need} EXTRA leerdoelen die duidelijk verschillend zijn van de bovenstaande.
- Elk leerdoel moet goed toetsbaar zijn met 3 oefenvarianten (MCQ met 3-4 opties) en EXACT 1 [blank].
- Vermijd 'niet/geen', dubbele ontkenning, en telvragen ("hoeveel/aantal ...").
- Blijf strikt binnen de gegeven tekst (geen extra kennis toevoegen).

STUDIETEKST:
${studyText}

OUTPUT FORMAAT (JSON):
{
  "objectives": [
    {
      "id": "obj-extra-1",
      "description": "De student weet dat ...",
      "bloomLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create",
      "exerciseable": true,
      "whyEasy": "1 zin waarom dit goed toetsbaar is zonder discussie",
      "evidenceQuote": "Letterlijke quote uit de studietekst die dit leerdoel ondersteunt"
    }
  ]
}

BELANGRIJK:
- Output ALLEEN geldige JSON (geen markdown).
- Geef EXACT ${need} leerdoelen.`;

      const topUpRes = await generateJson({
        system: EC_EXPERT_SYSTEM_PROMPT,
        prompt: topUpPrompt,
        maxTokens: 1700,
        temperature: 0.2,
        prefillJson: true,
        timeoutMs: Math.min(timeoutMs, 70_000),
      });

      if (topUpRes.ok) {
        try {
          const parsedTopUp = extractJsonFromText(topUpRes.text);
          const extra = extractObjectives(parsedTopUp, need);
          if (Array.isArray(extra) && extra.length > 0) {
            // Merge, prefer original order, dedupe by description, and ensure stable unique ids.
            const merged: LearningObjective[] = [];
            const seen = new Set<string>();
            for (const o of [...objectives, ...extra]) {
              const desc = typeof o?.description === "string" ? o.description.trim() : "";
              if (!desc) continue;
              const key = normalizeForCompare(desc);
              if (seen.has(key)) continue;
              seen.add(key);
              merged.push({
                ...o,
                id: `obj-${merged.length + 1}`,
                description: desc,
              });
            }
            objectives = merged.slice(0, desiredCandidateObjectives);
          }
        } catch {
          // Best-effort only; continue with whatever we already have.
        }
      }
    }

    // PASS 2: We attempt to generate exercises only for objectives that are "not too hard".
    // If an objective is hard to turn into debate-free MCQs (or the revisor can't fix it),
    // we SKIP it and try the next candidate objective. If we still can't fill a cluster, we stop.
    const objectiveCandidates = objectives;
    const selectedObjectives: LearningObjective[] = [];
    const exerciseSets: ExerciseSet[] = [];

    // With strict linting + hard filters, we need enough attempts to find an exerciseable objective
    // without failing the whole run. This only increases cost when candidates are bad.
    const MAX_OBJECTIVE_TRIES_PER_CLUSTER = 6;
    let objectiveCursor = 0;

    const generateSetForObjective = async (objective: LearningObjective, cluster: ClusterPlan): Promise<
      { ok: true; set: ExerciseSet } | { ok: false; error: string }
    > => {
      const variantsNeeded = 3;
      const prompt = buildExerciseGenerationPrompt({
        objective,
        studyText,
        subject: input.subject,
        audience: input.audience,
        groupName: cluster.groupName,
        variantsNeeded,
      });

      const res = await generateJson({
        system: EC_EXPERT_SYSTEM_PROMPT,
        prompt,
        maxTokens: 2200,
        temperature: 0.3,
        prefillJson: true,
        timeoutMs: Math.min(timeoutMs, 90_000),
      });

      if (!res.ok) {
        return { ok: false, error: `exercise_generation_failed:${objective.id}:${res.error || "llm_failed"}` };
      }

      let parsed: any;
      try {
        parsed = extractJsonFromText(res.text);
      } catch (e) {
        return { ok: false, error: `exercise_json_parse_failed:${objective.id}:${String(e)}` };
      }
      let setCandidate = extractExerciseSet(parsed, objective.id, variantsNeeded);
      if (!setCandidate) {
        // Bounded retry with stricter repair instruction
        const repairPrompt =
          prompt +
          `\n\nREPAIR:\nJe vorige output was ongeldig. Output nu EXACT ${variantsNeeded} exercises als JSON {\"exercises\":[{\"stem\":\"... [blank] ...\",\"options\":[\"...\",\"...\",\"...\"],\"correctIndex\":0,\"explanation\":\"...\"}]}.`;
        const retryRes = await generateJson({
          system: EC_EXPERT_SYSTEM_PROMPT,
          prompt: repairPrompt,
          maxTokens: 2200,
          temperature: 0.1,
          prefillJson: true,
          timeoutMs: Math.min(timeoutMs, 90_000),
        });
        if (!retryRes.ok) {
          return { ok: false, error: `exercise_generation_failed_retry:${objective.id}:${retryRes.error || "llm_failed"}` };
        }
        let retryParsed: any;
        try {
          retryParsed = extractJsonFromText(retryRes.text);
        } catch (e) {
          return { ok: false, error: `exercise_json_parse_failed_retry:${objective.id}:${String(e)}` };
        }
        setCandidate = extractExerciseSet(retryParsed, objective.id, variantsNeeded);
        if (!setCandidate) return { ok: false, error: `exercise_set_invalid:${objective.id}` };
      }

      // Deterministic lint pass (used to decide whether to trigger senior revision step).
      // Always lint with study-text context so we catch "partly true" distractors.
      let lintIssues = lintExerciseSet(setCandidate, { studyText });
      const hasErrors = lintIssues.some((x) => x.severity === "error");
      const hasWarnings = lintIssues.some((x) => x.severity === "warn");

      // Hard filters: exclude low-value items rather than trying to "fix" them.
      const excludedCodes = new Set(["counting_list_trivia", "numeric_trivia_answer", "correct_option_multiple_elements"]);
      const excludedHit = lintIssues.find((i) => excludedCodes.has(i.code));
      if (excludedHit) {
        return { ok: false, error: `objective_excluded:${objective.id}:${excludedHit.code}` };
      }

      // Performance + quality tradeoff:
      // - Revision is expensive; only run it when there are HARD errors.
      // - Warnings are allowed (we prefer to skip hard objectives rather than perfect every style nit).
      if (hasErrors) {
        const levelHint = deriveLevelHint(input.audience);
        const revisionPrompt = buildSeniorRevisionPrompt({
          levelHint,
          subject: input.subject,
          audience: input.audience,
          groupName: cluster.groupName,
          objectiveDescription: objective.description,
          studyText,
          issues: lintIssues,
          exercises: setCandidate.exercises,
        });

        const MAX_REVISION_ATTEMPTS = 2;
        let revisionAttempt = 0;
        let revised: ExerciseSet | null = null;
        let lastRevisionText: string | null = null;

        while (revisionAttempt < MAX_REVISION_ATTEMPTS) {
          revisionAttempt++;

          const revRes = await generateJson({
            system: SENIOR_REVISOR_SYSTEM_PROMPT,
            prompt: revisionPrompt,
            maxTokens: 2400,
            temperature: 0.2,
            prefillJson: true,
            timeoutMs: Math.min(timeoutMs, 110_000),
          });
          if (!revRes.ok) {
            return { ok: false, error: `revision_failed:${objective.id}:${revRes.error || "llm_failed"}` };
          }
          lastRevisionText = revRes.text;

          let parsedRev: any;
          try {
            parsedRev = extractJsonFromText(revRes.text);
          } catch (e) {
            if (revisionAttempt >= MAX_REVISION_ATTEMPTS) {
              return { ok: false, error: `revision_json_parse_failed:${objective.id}:${String(e)}` };
            }
            continue;
          }

          const candidate = extractExerciseSet(parsedRev, objective.id, variantsNeeded);
          if (!candidate) {
            if (revisionAttempt >= MAX_REVISION_ATTEMPTS) {
              return { ok: false, error: `revision_set_invalid:${objective.id}` };
            }
            continue;
          }

          const newIssues = lintExerciseSet(candidate, { studyText });
          const stillErrors = newIssues.some((x) => x.severity === "error");
          if (!stillErrors) {
            revised = candidate;
            lintIssues = newIssues;
            break;
          }

          if (revisionAttempt >= MAX_REVISION_ATTEMPTS) {
            return { ok: false, error: `revision_incomplete:${objective.id}:${newIssues.map(i => i.code).join(",")}` };
          }
        }

        if (revised) {
          setCandidate = revised;
        }

        // Persist revision artifact (best-effort) for debugging.
        try {
          // @ts-ignore - npm import in Deno edge
          const { createClient } = await import("npm:@supabase/supabase-js@2");
          const url = Deno.env.get("SUPABASE_URL");
          const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
          if (url && key && lastRevisionText) {
            const supabase = createClient(url, key);
            const path = `debug/protocol-ec-expert/revision-${skeleton.id}-${objective.id}-${Date.now()}.json`;
            await supabase.storage.from("courses").upload(
              path,
              JSON.stringify(
                {
                  courseId: skeleton.id,
                  objectiveId: objective.id,
                  lintIssues,
                  raw: lastRevisionText,
                },
                null,
                2
              ),
              { upsert: true, contentType: "application/json" }
            );
          }
        } catch {
          // best-effort only
        }
      }

      return { ok: true, set: setCandidate };
    };

    for (let ci = 0; ci < clusterPlan.length; ci++) {
      const cluster = clusterPlan[ci];

      let filled = false;
      let tries = 0;

      while (!filled && objectiveCursor < objectiveCandidates.length && tries < MAX_OBJECTIVE_TRIES_PER_CLUSTER) {
        const objective = objectiveCandidates[objectiveCursor++];
        tries++;

        const gen = await generateSetForObjective(objective, cluster);
        if (!gen.ok) {
          // Skip objective; try next candidate.
          continue;
        }

        selectedObjectives.push(objective);
        exerciseSets.push(gen.set);
        filled = true;
      }

      if (!filled) break;
    }

    if (exerciseSets.length === 0) {
      return { ok: false, error: "no_exerciseable_objectives_generated" };
    }

    const filledClusterCount = exerciseSets.length;
    objectives = selectedObjectives.slice(0, filledClusterCount);

    const workingSkeleton =
      filledClusterCount < clusterPlan.length
        ? trimSkeletonToFirstNClusters({ skeleton, clusterPlan, keepClusters: filledClusterCount })
        : skeleton;

    const workingClusterPlan = buildClusterPlan(workingSkeleton);
    if (workingClusterPlan.length !== filledClusterCount) {
      return { ok: false, error: `cluster_plan_trim_failed: expected ${filledClusterCount}, got ${workingClusterPlan.length}` };
    }
    for (const c of workingClusterPlan) {
      if (c.itemIndexes.length !== 3) {
        return { ok: false, error: `cluster_variants_mismatch:${c.clusterId}:${c.itemIndexes.length}` };
      }
    }

    const protocolOutput: ProtocolOutput = { objectives, exerciseSets };
    if (!isValidProtocolOutput(protocolOutput)) {
      return { ok: false, error: "protocol_output_invalid" };
    }

    // Merge filled content back into the skeleton while preserving identity fields strictly.
    const filledStudyTexts = (Array.isArray(workingSkeleton.studyTexts) ? workingSkeleton.studyTexts : []).map((st: any, idx: number) => ({
      ...st,
      // For this protocol, use the provided studyText as the canonical reference material.
      content: studyText,
      // Keep title/id/order stable.
      title: typeof st?.title === "string" && st.title.trim() ? st.title : idx === 0 ? "Studietekst" : `Studietekst ${idx + 1}`,
    }));

    const items = Array.isArray(workingSkeleton.items) ? workingSkeleton.items : [];
    const filledItems: Array<{
      _meta?: any;
      id: any;
      text: string;
      groupId: any;
      clusterId: any;
      variant: any;
      mode: any;
      options?: string[];
      correctIndex?: number;
      explain?: string;
      hints?: HintSet;
      learningObjectiveId?: string;
      relatedStudyTextIds?: string[];
    }> = items.map((sk: any) => ({
      id: sk.id,
      text: "__FILL__",
      groupId: sk.groupId,
      clusterId: sk.clusterId,
      variant: sk.variant,
      mode: sk.mode,
      // Preserve metadata if present
      ...(sk._meta ? { _meta: sk._meta } : {}),
    }));

    for (let i = 0; i < workingClusterPlan.length; i++) {
      const cluster = workingClusterPlan[i];
      const objective = objectives[i];
      const set = exerciseSets[i];
      const studyTextId = typeof filledStudyTexts?.[0]?.id === "string" ? filledStudyTexts[0].id : undefined;

      for (let v = 0; v < set.exercises.length; v++) {
        const idx = cluster.itemIndexes[v];
        const ex = set.exercises[v];
        const target = filledItems[idx];
        if (!target) continue;

        target.text = ex.stem;
        target.options = Array.isArray(ex.options) ? ex.options.slice(0, 4).map(String) : undefined;
        target.correctIndex = typeof ex.correctIndex === "number" ? ex.correctIndex : undefined;
        target.explain = typeof ex.explanation === "string" ? ex.explanation : "";
        target.hints = toHintSet((ex as any).hints);
        target.learningObjectiveId = objective.id;
        if (studyTextId) target.relatedStudyTextIds = [studyTextId];

        // Enforce invariants (exactly one [blank], option constraints)
        try {
          if (target.mode === "options") normalizeOptionsItem(target);
          else normalizeNumericItem(target);
        } catch {
          // Fail loud later via validation checks.
        }
      }
    }

    // Ensure no unfilled items remain
    for (const it of filledItems) {
      if (typeof it?.text !== "string" || it.text.includes("__FILL__") || it.text.trim() === "__FILL__") {
        return { ok: false, error: "items_incomplete" };
      }
      if (it.mode === "options") {
        if (!Array.isArray(it.options) || it.options.length < 3 || it.options.length > 4) {
          return { ok: false, error: `options_invalid:${String(it.id)}` };
        }
        if (typeof it.correctIndex !== "number" || it.correctIndex < 0 || it.correctIndex >= it.options.length) {
          return { ok: false, error: `correctIndex_invalid:${String(it.id)}` };
        }
      }
    }

    const course = {
      ...workingSkeleton,
      studyTexts: filledStudyTexts,
      items: filledItems,
      ...(ctx?.retry ? { _repair: { retry: true } } : {}),
    };

    return { ok: true, course };
  },

  validateInput(input: ProtocolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.studyText || input.studyText.trim().length === 0) errors.push("studyText is required for EC Expert protocol");
    if (!input.subject || input.subject.trim().length === 0) errors.push("subject is required");
    if (!input.audience || input.audience.trim().length === 0) errors.push("audience is required");
    if (!input.locale || input.locale.trim().length === 0) errors.push("locale is required");
    return { valid: errors.length === 0, errors };
  },
};

