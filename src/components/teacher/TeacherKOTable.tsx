import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { X, Target } from "lucide-react";

interface TeacherKOTableProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  /**
   * Callback when a row is clicked or "Assign" is clicked
   *
   * Note: Knowledge Map assignment creation is not enabled yet, so this callback
   * is currently unused. We keep it for API compatibility with the dashboard.
   */
  onAssignKO?: (koId: string) => void;
}

/**
 * TeacherKOTable - Full-screen modal with comprehensive KO table
 *
 * Legacy DAWR had a Knowledge Map-driven teacher skills table. IgniteZero is
 * live-only (no mock data), and class aggregation is not implemented yet in the
 * current backend. We show a clear BLOCKED state rather than fake rows.
 */
export function TeacherKOTable({ isOpen, onClose }: TeacherKOTableProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b">
          <div className="flex-1 pr-4">
            <h2 className="text-xl font-bold mb-1">Class Skills Overview</h2>
            <p className="text-sm text-muted-foreground">
              Knowledge Map class aggregation is not enabled yet.
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

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Target className="h-5 w-5 text-muted-foreground mt-0.5" aria-hidden="true" />
            <Alert>
              <AlertDescription>
                <span className="font-medium">BLOCKED:</span> Teacher Knowledge Map insights require
                class-level mastery aggregation (students ↔ classes ↔ mastery states). Until that
                backend is implemented, this modal is intentionally disabled.
              </AlertDescription>
            </Alert>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}


