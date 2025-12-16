import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { X, Info } from "lucide-react";

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  koId: string;
  /**
   * User creating the assignment (teacher or parent)
   */
  assignerId: string;
  assignerRole: "teacher" | "parent";
  /**
   * Class or child ID for filtering students
   */
  contextId: string;
  /**
   * Callback when assignment is created
   *
   * Note: Knowledge Map assignment creation is not enabled yet in live mode.
   */
  onCreateAssignment?: () => void;
}

/**
 * AssignmentModal - Knowledge Map skill assignment creation (Legacy DAWR parity surface)
 *
 * IgniteZero is **live-only** (no mock data). The Knowledge Map assignment backend
 * (students/classes selection, KO assignment persistence, and AI recommendation)
 * is not implemented in this repo right now, so we show a clear BLOCKED state.
 */
export function AssignmentModal({ isOpen, onClose }: AssignmentModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b">
          <div className="flex-1 pr-4">
            <h2 className="text-xl font-bold mb-1">Assign Practice</h2>
            <p className="text-sm text-muted-foreground">
              Skill-based assignments are not enabled yet.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5" aria-hidden="true" />
            <Alert>
              <AlertDescription>
                <span className="font-medium">BLOCKED:</span> This modal previously used mock data.
                To keep IgniteZero live-only, the Knowledge Map assignment pipeline must be wired to
                real Edge Functions and database tables before it can be enabled.
              </AlertDescription>
            </Alert>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}


