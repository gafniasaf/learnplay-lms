/**
 * GameRouter Component
 * Routes to the correct game engine based on game_type from course/assignment
 * Per IgniteZero: Uses useGameSession hook for MCP-First architecture
 */

import { useRef, useEffect } from 'react';
import { useGameSession } from '@/hooks/useGameSession';
import { AudioMCQ } from './AudioMCQ';
import { VisualMCQ } from './VisualMCQ';
import { VideoPrompt } from './VideoPrompt';
import { DragDropClassify } from './DragDropClassify';
import { MatchingPairs } from './MatchingPairs';
import { OrderingSequence } from './OrderingSequence';
import { DiagramLabeling } from './DiagramLabeling';
import { ManipulativeNumeric } from './ManipulativeNumeric';
import { GraphInterpretation } from './GraphInterpretation';
import { TimedFluency } from './TimedFluency';
import { OptionGrid } from './OptionGrid';
import { NumericPad } from './NumericPad';
import type { CourseItem } from '@/lib/types/course';

interface GameRouterProps {
  courseId: string;
  level: number;
  assignmentId?: string;
  contentVersion?: string;
  gameType?: string;
  item: CourseItem;
  onAnswer: (itemId: number, isCorrect: boolean, latencyMs: number, selectedIndex?: number) => void;
  onComplete?: () => void;
}

export function GameRouter({
  courseId,
  level,
  assignmentId,
  contentVersion,
  gameType,
  item,
  onAnswer,
  onComplete,
}: GameRouterProps) {
  const gameSession = useGameSession({
    courseId,
    level,
    assignmentId,
    contentVersion,
    autoStart: true,
  });

  const itemStartTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    itemStartTimeRef.current = Date.now();
  }, [item.id]);

  const handleAnswer = (selectedIndex: number, isCorrect: boolean) => {
    const latencyMs = Date.now() - itemStartTimeRef.current;
    
    gameSession.submitAnswer(item.id, isCorrect, latencyMs, selectedIndex);
    onAnswer(item.id, isCorrect, latencyMs, selectedIndex);
  };

  // Determine game type from item.mode or gameType prop
  const effectiveGameType = gameType || item.mode || 'mcq';

  // Map game types to components
  switch (effectiveGameType) {
    case 'audio_mcq':
    case 'audio-mcq':
      return (
        <AudioMCQ
          item={{
            id: item.id,
            mode: 'audio-mcq',
            audioUrl: item.stimulus?.type === 'audio' ? item.stimulus.url : '',
            transcript: item.stimulus?.type === 'audio' ? item.stimulus.transcriptUrl : undefined,
            options: item.options,
            correctIndex: item.correctIndex,
          }}
          onSelect={(index) => {
            const isCorrect = index === item.correctIndex;
            handleAnswer(index, isCorrect);
          }}
          selectedIndex={undefined}
          showFeedback={false}
        />
      );

    case 'visual_mcq':
    case 'visual-mcq':
      return (
        <VisualMCQ
          item={{
            id: item.id,
            mode: 'visual-mcq',
            imageUrl: item.stimulus?.type === 'image' ? item.stimulus.url : '',
            options: item.options,
            correctIndex: item.correctIndex,
          }}
          onSelect={(index) => {
            const isCorrect = index === item.correctIndex;
            handleAnswer(index, isCorrect);
          }}
          selectedIndex={undefined}
          showFeedback={false}
        />
      );

    case 'drag_drop':
    case 'drag-drop':
      return (
        <DragDropClassify
          item={item}
          onComplete={(isCorrect) => {
            handleAnswer(0, isCorrect);
          }}
        />
      );

    case 'matching':
      return (
        <MatchingPairs
          item={item}
          onComplete={(isCorrect) => {
            handleAnswer(0, isCorrect);
          }}
        />
      );

    case 'ordering':
      return (
        <OrderingSequence
          item={item}
          onComplete={(isCorrect) => {
            handleAnswer(0, isCorrect);
          }}
        />
      );

    case 'timed_fluency':
      return (
        <TimedFluency
          item={item}
          onComplete={(isCorrect) => {
            handleAnswer(0, isCorrect);
          }}
        />
      );

    case 'numeric':
      return (
        <NumericPad
          item={item}
          onAnswer={(answer) => {
            const isCorrect = answer === item.answer;
            handleAnswer(0, isCorrect);
          }}
        />
      );

    case 'diagram':
      return (
        <DiagramLabeling
          item={item}
          onComplete={(isCorrect) => {
            handleAnswer(0, isCorrect);
          }}
        />
      );

    case 'mcq':
    default:
      return (
        <OptionGrid
          item={item}
          onSelect={(index) => {
            const isCorrect = index === item.correctIndex;
            handleAnswer(index, isCorrect);
          }}
          selectedIndex={undefined}
          showFeedback={false}
        />
      );
  }
}

