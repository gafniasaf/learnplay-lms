// supabase/functions/_shared/course-validator.ts
// Course validation with comprehensive checks

import { CourseSchema } from "./validation.ts";
import type { FilledCourse } from "./filler.ts";
import { validatePhysicsConsistency, PhysicsValidationError } from "./physics-heuristics.ts";

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  itemId?: number;
  field?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface KnowledgePack {
  pack_id: string;
  topic: string;
  grade: number;
  version: number;
  allowed_vocab?: {
    content?: string[];
    function?: string[];
  };
  banned_terms?: string[];
  reading_level_max?: number;
}

export interface ValidateCourseOptions {
  knowledgePack?: KnowledgePack;
}

// Count syllables in a word (approximate)
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  
  const vowels = word.match(/[aeiouy]+/g);
  let count = vowels ? vowels.length : 1;
  
  // Adjust for silent e
  if (word.endsWith("e") && count > 1) count--;
  // Adjust for -le endings
  if (word.endsWith("le") && word.length > 2 && !/[aeiouy]/.test(word[word.length - 3])) count++;
  
  return Math.max(1, count);
}

// Estimate Flesch-Kincaid grade level
export function estimateReadabilityGrade(text: string): number {
  if (!text || text.trim().length === 0) return 1;
  
  // Clean text
  const cleanText = text.replace(/\[SECTION:[^\]]+\]/g, "").replace(/\[IMAGE:[^\]]+\]/g, "").trim();
  
  // Count sentences (ending with . ! ?)
  const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = Math.max(1, sentences.length);
  
  // Count words
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = Math.max(1, words.length);
  
  // Count syllables
  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);
  
  // Flesch-Kincaid formula
  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllableCount / wordCount;
  
  const grade = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
  
  return Math.max(1, Math.min(12, Math.round(grade)));
}

// Count [blank] placeholders
function countBlanks(text: string): number {
  const matches = text.match(/\[blank\]/gi);
  return matches ? matches.length : 0;
}

// Validate a single item
function validateItem(item: FilledCourse["items"][0], issues: ValidationIssue[]): void {
  // Check for unfilled text
  if (item.text === "__FILL__" || item.text.includes("__FILL__")) {
    issues.push({
      code: "unfilled_text",
      severity: "error",
      message: `Item ${item.id} has unfilled text`,
      itemId: item.id,
      field: "text",
    });
    return;
  }
  
  // Check blank count
  const blankCount = countBlanks(item.text);
  if (blankCount !== 1) {
    issues.push({
      code: "invalid_blank_count",
      severity: "error",
      message: `Item ${item.id}: Expected exactly 1 [blank], found ${blankCount}`,
      itemId: item.id,
      field: "text",
    });
  }
  
  // Mode-specific validation
  if (item.mode === "options") {
    // Options mode checks
    if (!item.options || item.options.length < 3 || item.options.length > 4) {
      issues.push({
        code: "invalid_options_count",
        severity: "error",
        message: `Item ${item.id}: options mode requires 3-4 options, found ${item.options?.length || 0}`,
        itemId: item.id,
        field: "options",
      });
    }
    
    if (item.correctIndex === undefined || item.correctIndex === null) {
      issues.push({
        code: "invalid_correct_index",
        severity: "error",
        message: `Item ${item.id}: options mode requires correctIndex`,
        itemId: item.id,
        field: "correctIndex",
      });
    } else if (item.correctIndex < 0 || (item.options && item.correctIndex >= item.options.length)) {
      issues.push({
        code: "invalid_correct_index",
        severity: "error",
        message: `Item ${item.id}: correctIndex ${item.correctIndex} out of range`,
        itemId: item.id,
        field: "correctIndex",
      });
    }
    
    // Check for duplicate options (warning)
    if (item.options) {
      const unique = new Set(item.options);
      if (unique.size < item.options.length) {
        issues.push({
          code: "duplicate_options",
          severity: "warning",
          message: `Item ${item.id}: has duplicate options`,
          itemId: item.id,
          field: "options",
        });
      }
    }
    
    // Math correctness check for options mode
    if (item._meta && item.options && typeof item.correctIndex === "number") {
      const correctOption = item.options[item.correctIndex];
      const correctValue = parseFloat(correctOption);
      const expected = item._meta.expected;
      
      if (!isNaN(correctValue) && Math.abs(correctValue - expected) > 0.001) {
        issues.push({
          code: "math_incorrect",
          severity: "error",
          message: `Item ${item.id}: math answer mismatch - expected ${expected}, got ${correctValue}`,
          itemId: item.id,
          field: "correctIndex",
        });
      }
    }
    
  } else if (item.mode === "numeric") {
    // Numeric mode checks
    if (item.answer === undefined || typeof item.answer !== "number") {
      issues.push({
        code: "missing_answer",
        severity: "error",
        message: `Item ${item.id}: numeric mode requires answer`,
        itemId: item.id,
        field: "answer",
      });
    }
    
    if (item.options !== undefined) {
      issues.push({
        code: "unexpected_options",
        severity: "error",
        message: `Item ${item.id}: numeric mode should not have options`,
        itemId: item.id,
        field: "options",
      });
    }
    
    // Math correctness check for numeric mode
    if (item._meta && typeof item.answer === "number") {
      const expected = item._meta.expected;
      if (Math.abs(item.answer - expected) > 0.001) {
        issues.push({
          code: "math_incorrect",
          severity: "error",
          message: `Item ${item.id}: math answer mismatch - expected ${expected}, got ${item.answer}`,
          itemId: item.id,
          field: "answer",
        });
      }
    }
  }
}

// Validate study texts
function validateStudyText(
  st: FilledCourse["studyTexts"][0], 
  issues: ValidationIssue[],
  pack?: KnowledgePack
): void {
  // Check for unfilled content
  if (st.content === "__FILL__" || st.content.includes("__FILL__")) {
    issues.push({
      code: "unfilled_content",
      severity: "error",
      message: `Study text ${st.id} has unfilled content`,
      field: "content",
    });
    return;
  }
  
  // Check for section markers (warning if missing)
  if (!st.content.includes("[SECTION:")) {
    issues.push({
      code: "missing_section_markers",
      severity: "warning",
      message: `Study text ${st.id} is missing [SECTION:] markers`,
      field: "content",
    });
  }
  
  // Knowledge pack checks
  if (pack) {
    // Check banned terms
    if (pack.banned_terms) {
      for (const term of pack.banned_terms) {
        if (st.content.toLowerCase().includes(term.toLowerCase())) {
          issues.push({
            code: "banned_term",
            severity: "error",
            message: `Study text ${st.id} contains banned term: ${term}`,
            field: "content",
          });
        }
      }
    }
    
    // Check readability
    if (pack.reading_level_max !== undefined) {
      const grade = estimateReadabilityGrade(st.content);
      if (grade > pack.reading_level_max) {
        issues.push({
          code: "readability",
          severity: "error",
          message: `Study text ${st.id} readability (grade ${grade}) exceeds max (${pack.reading_level_max})`,
          field: "content",
        });
      }
    }
  }
}

// Main validation function
export function validateCourse(
  course: FilledCourse,
  options: ValidateCourseOptions = {}
): ValidationResult {
  const issues: ValidationIssue[] = [];
  
  // Schema validation
  const schemaResult = CourseSchema.safeParse(course);
  if (!schemaResult.success) {
    const details = schemaResult.error.errors
      .map((e) => {
        const p = Array.isArray(e.path) && e.path.length > 0 ? e.path.join(".") : "";
        return p ? `${p}: ${e.message}` : e.message;
      })
      .join("; ");
    issues.push({
      code: "schema_error",
      severity: "error",
      message: `Schema validation failed: ${details}`,
    });
  }
  
  // Validate items
  if (Array.isArray(course.items)) {
    for (const item of course.items) {
      validateItem(item, issues);
    }
  }
  
  // Validate study texts
  if (Array.isArray(course.studyTexts)) {
    for (const st of course.studyTexts) {
      validateStudyText(st, issues, options.knowledgePack);
    }
  }
  
  // Physics consistency check
  try {
    validatePhysicsConsistency(course);
  } catch (e) {
    if (e instanceof PhysicsValidationError) {
      issues.push({
        code: "physics_inconsistent",
        severity: "error",
        message: `Physics consistency error: ${e.message}`,
      });
    } else {
      issues.push({
        code: "physics_validation_error",
        severity: "error",
        message: `Physics validation error: ${String(e)}`,
      });
    }
  }
  
  // Determine validity (no errors = valid)
  const hasErrors = issues.some(i => i.severity === "error");
  
  return {
    valid: !hasErrors,
    issues,
  };
}
