import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
// Badge and Button imports removed - not used
import { ChevronDown, Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PhaseDetail } from '@/lib/pipeline/phaseExtractor';

interface PhaseAccordionProps {
  phase: PhaseDetail;
}

export function PhaseAccordion({ phase }: PhaseAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const statusIcon = {
    complete: <Check className="w-5 h-5 text-white" />,
    active: <Loader2 className="w-5 h-5 text-white animate-spin" />,
    failed: <X className="w-5 h-5 text-white" />,
    pending: <span className="text-sm">{phase.id}</span>
  }[phase.status];

  const statusColor = {
    complete: 'bg-green-500',
    active: 'bg-primary',
    failed: 'bg-red-500',
    pending: 'bg-gray-300'
  }[phase.status];

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', statusColor)}>
            {statusIcon}
          </div>

          <div className="text-left">
            <h3 className="font-semibold text-sm">
              Phase {phase.id}: {phase.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {phase.duration ? `${phase.duration.toFixed(1)}s` : ''} 
              {phase.duration && phase.aiCalls !== undefined ? ' · ' : ''}
              {phase.aiCalls !== undefined ? `AI Calls: ${phase.aiCalls}` : ''}
              {(phase.duration || phase.aiCalls !== undefined) && phase.summary ? ' · ' : ''}
              {phase.summary}
            </p>
          </div>
        </div>

        <ChevronDown className={cn('w-5 h-5 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <CardContent className="pt-0 pb-4 border-t bg-gray-50">
          <div className="space-y-4 mt-4">
            {/* Summary */}
            <div>
              <h4 className="font-semibold text-sm mb-2">📋 Summary</h4>
              <p className="text-sm text-muted-foreground">{phase.summary}</p>
            </div>

            {/* Repairs */}
            {phase.details.repairs && phase.details.repairs.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">🔧 Repairs Performed</h4>
                <div className="space-y-2">
                  {phase.details.repairs.map((repair, idx) => (
                    <Card key={idx}>
                      <CardContent className="p-3">
                        <div className="text-sm mb-1">
                          <strong>Item #{repair.itemId}:</strong> {repair.text}
                        </div>
                        <div className="text-xs text-yellow-600 mb-1">
                          Issue: {repair.issue}
                        </div>
                        <div className="text-xs text-green-600">
                          Fixed: {repair.fix}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Issues */}
            {phase.details.issues && phase.details.issues.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">⚠️ Issues Found</h4>
                <ul className="space-y-1">
                  {phase.details.issues.map((issue, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-yellow-500">•</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Errors */}
            {phase.details.errors && phase.details.errors.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">🔴 Errors</h4>
                <ul className="space-y-1">
                  {phase.details.errors.map((error, idx) => (
                    <li key={idx} className="text-sm text-red-600 flex items-start gap-2">
                      <span>•</span>
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Logs */}
            {phase.details.logs && phase.details.logs.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">📊 Logs</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {phase.details.logs.map((log, idx) => (
                    <div key={idx} className="text-xs flex items-start gap-2">
                      <span className="text-muted-foreground">{log.timestamp}</span>
                      <span className={cn(
                        log.type === 'error' && 'text-red-600',
                        log.type === 'warning' && 'text-yellow-600',
                        log.type === 'success' && 'text-green-600',
                        log.type === 'info' && 'text-gray-600'
                      )}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
