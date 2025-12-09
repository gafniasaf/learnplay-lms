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
            stem: { text: item.stem?.text || item.text || '' },
            options: item.optionMedia?.filter((m): m is { type: 'image'; url: string; alt?: string } => m?.type === 'image').map(m => ({ text: m.alt || '', image: m.url })) || [],
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
          item={{
            id: item.id,
            mode: 'drag-drop',
            stem: { text: item.stem?.text || '' },
            items: (item as any).items || [],
            categories: (item as any).categories || [],
          }}
          onComplete={(placements) => {
            // Check if placements are correct
            const isCorrect = (item as any).items?.every((i: any) => placements[i.id] === i.category) ?? false;
            handleAnswer(0, isCorrect);
          }}
        />
      );

    case 'matching':
      return (
        <MatchingPairs
          item={{
            id: item.id,
            mode: 'matching',
            stem: { text: item.stem?.text || '' },
            pairs: (item as any).pairs || [],
          }}
          onComplete={(matches) => {
            // Check if all matches are correct
            const pairs = (item as any).pairs || [];
            const isCorrect = pairs.every((p: any) => matches[p.left] === p.right);
            handleAnswer(0, isCorrect);
          }}
        />
      );

    case 'ordering':
      return (
        <OrderingSequence
          item={{
            mode: 'ordering',
            stem: { text: item.stem?.text || '' },
            steps: (item as any).steps || [],
            correctOrder: (item as any).correctOrder || [],
          }}
          onSubmit={(order) => {
            const correctOrder = (item as any).correctOrder || [];
            const isCorrect = JSON.stringify(order) === JSON.stringify(correctOrder);
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
          onSubmit={(answer) => {
            const isCorrect = answer === (item as any).answer;
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
          options={item.options}
          onSelect={(index) => {
            const isCorrect = index === item.correctIndex;
            handleAnswer(index, isCorrect);
          }}
          selectedIndex={undefined}
          itemId={item.id}
        />
      );
  }
}

