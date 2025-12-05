## Course Format Baseline

This document captures the structure of the existing practice course so that it can serve as the canonical baseline while the generation system evolves to support multiple formats.

### Practice Course Envelope

- **Subject metadata**: `id`, `title`, `description`, `subject`, `gradeBand`, `contentVersion`
- **Groups**: ordered collection of themed clusters, each with `id` and `name`
- **Levels**: progression slices (`id`, `title`, `start`, `end`) computed from pooled items
- **Study Texts**: array with `id`, `title`, `order`, mutable `content`
- **Items**:
  - Immutable scaffolding: `id`, `groupId`, `clusterId`, `variant`, `mode`
  - Optional math metadata `_meta` (`op`, `a`, `b`, `expected`)
  - LLM-filled fields:
    - `text` containing exactly one `[blank]`
    - `options` + `correctIndex` for multiple-choice
    - `answer` for numeric prompts

### Envelope Goals

- Wrap practice content in a unified envelope:  
  `{ "courseId": string, "format": "practice", "version": "1", "content": { ...practice course json... } }`
- Preserve backwards compatibility by continuing to expose the raw course payload to existing consumers while persisting the envelope in storage and metadata.
- Establish a template for future formats (explainer, video, pathway) to extend with their own schema definitions, skeleton builders, fillers, and validators.

