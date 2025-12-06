/**
 * All Advanced Exercise Type Components
 * Consolidated file for remaining types to save space
 */

// Import all components
import { VisualMCQ } from './VisualMCQ';
import { AudioMCQ } from './AudioMCQ';
import { VideoPrompt } from './VideoPrompt';
import { DragDropClassify } from './DragDropClassify';
import { MatchingPairs } from './MatchingPairs';
import { OrderingSequence } from './OrderingSequence';
import { DiagramLabeling } from './DiagramLabeling';
import { ManipulativeNumeric } from './ManipulativeNumeric';
import { GraphInterpretation } from './GraphInterpretation';
import { TimedFluency } from './TimedFluency';

// Re-export all
export {
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
};

// Type definitions for all modes
export type ExerciseMode = 
  | 'options'           // Standard MCQ
  | 'numeric'           // Numeric input
  | 'visual-mcq'        // Image-based MCQ
  | 'audio-mcq'         // Listen and answer
  | 'video-prompt'      // Watch then answer
  | 'drag-drop'         // Classify by dragging
  | 'matching'          // Match pairs
  | 'ordering'          // Sequence steps
  | 'diagram-label'     // Label diagram parts
  | 'manipulative'      // Interactive number line/fractions
  | 'graph-interpret'   // Read charts
  | 'timed-fluency';    // Speed drill

// Helper to get component for mode
export function getExerciseComponent(mode: ExerciseMode) {
  const components = {
    'visual-mcq': VisualMCQ,
    'audio-mcq': AudioMCQ,
    'video-prompt': VideoPrompt,
    'drag-drop': DragDropClassify,
    'matching': MatchingPairs,
    'ordering': OrderingSequence,
    'diagram-label': DiagramLabeling,
    'manipulative': ManipulativeNumeric,
    'graph-interpret': GraphInterpretation,
    'timed-fluency': TimedFluency,
  };

  return components[mode as keyof typeof components];
}

