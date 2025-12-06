import { Card, CardContent } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PhaseStep {
  id: number;
  label: string;
  duration?: number;
  status: 'complete' | 'active' | 'pending' | 'failed';
}

interface PhaseProgressStepperProps {
  phases: PhaseStep[];
}

export function PhaseProgressStepper({ phases }: PhaseProgressStepperProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="relative flex justify-between items-start">
          {/* Connection line */}
          <div className="absolute top-5 left-10 right-10 h-0.5 bg-gray-200 z-0" />

          {phases.map((phase, index) => (
            <div
              key={phase.id}
              data-testid={`phase-${phase.label.toLowerCase().replace(/\s+/g, '-')}`}
              data-status={phase.status}
              className="flex flex-col items-center gap-2 z-10 bg-gray-50 px-2"
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-full border-2 flex items-center justify-center font-semibold text-sm transition-all',
                  phase.status === 'complete' && 'border-green-500 bg-green-500 text-white',
                  phase.status === 'active' && 'border-primary bg-primary text-white animate-pulse',
                  phase.status === 'failed' && 'border-red-500 bg-red-500 text-white',
                  phase.status === 'pending' && 'border-gray-300 bg-white text-gray-400'
                )}
              >
                {phase.status === 'complete' ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <span>{phase.id}</span>
                )}
              </div>

              <div className="text-center">
                <div className="text-xs font-medium text-gray-700">
                  {phase.label}
                </div>
                {phase.duration !== undefined && (
                  <div className="text-xs text-gray-500">
                    {phase.duration > 0 ? `${phase.duration}s` : '—'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
