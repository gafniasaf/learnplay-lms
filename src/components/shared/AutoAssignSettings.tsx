import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bot,
  Bell,
  Target,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Sparkles,
  Calendar,
} from "lucide-react";
import { useState } from "react";
import type { AutoAssignSettings, AutoAssignFrequency, AssignmentWithDetails } from "@/lib/types/knowledgeMap";

interface AutoAssignSettingsProps {
  studentId: string;
  /**
   * Student name for display
   */
  studentName?: string;
  /**
   * Is open state (controlled by parent)
   */
  isOpen: boolean;
  /**
   * Callback to close modal
   */
  onClose: () => void;
  /**
   * Callback when settings are saved
   */
  onSave?: (settings: AutoAssignSettings) => void;
  /**
   * Mock data mode
   */
  useMockData?: boolean;
}

/**
 * AutoAssignSettings - Configure autonomous AI assignment mode
 * 
 * Allows teachers/parents to enable AI-driven automatic skill assignments
 * based on mastery thresholds, practice frequency, and concurrent limits.
 * 
 * Features:
 * - Enable/disable autonomous mode
 * - Mastery threshold slider (30-70%, default 50%)
 * - Assignment frequency (daily/weekly/on_completion)
 * - Max concurrent assignments (1-5)
 * - Email notification toggle
 * - Recent AI assignments history (last 5)
 * 
 * Permission: Teacher or Parent (if no teacher)
 */
export function AutoAssignSettings({
  studentId,
  studentName,
  isOpen,
  onClose,
  onSave,
  useMockData = true,
}: AutoAssignSettingsProps) {
  // TODO: Replace with API call when service layer is ready
  const currentSettings = useMockData ? getMockSettings(studentId) : getDefaultSettings(studentId);
  const recentAssignments = useMockData ? getMockRecentAssignments(studentId) : [];

  const [enabled, setEnabled] = useState(currentSettings.enabled);
  const [masteryThreshold, setMasteryThreshold] = useState(
    Math.round(currentSettings.masteryThreshold * 100)
  );
  const [frequency, setFrequency] = useState<AutoAssignFrequency>(currentSettings.frequency);
  const [maxConcurrent, setMaxConcurrent] = useState(currentSettings.maxConcurrent);
  const [notifyOnAssign, setNotifyOnAssign] = useState(currentSettings.notifyOnAssign);
  const [notifyEmail, setNotifyEmail] = useState(currentSettings.notifyEmail || "");

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);

    const updatedSettings: AutoAssignSettings = {
      studentId,
      enabled,
      masteryThreshold: masteryThreshold / 100,
      frequency,
      maxConcurrent,
      notifyOnAssign,
      notifyEmail: notifyOnAssign ? notifyEmail : undefined,
      createdAt: currentSettings.createdAt,
      updatedAt: new Date().toISOString(),
    };

    // TODO: API call to save settings
    await new Promise((resolve) => setTimeout(resolve, 500));

    onSave?.(updatedSettings);
    setIsSaving(false);
    onClose();
  };

  const hasChanges =
    enabled !== currentSettings.enabled ||
    masteryThreshold !== Math.round(currentSettings.masteryThreshold * 100) ||
    frequency !== currentSettings.frequency ||
    maxConcurrent !== currentSettings.maxConcurrent ||
    notifyOnAssign !== currentSettings.notifyOnAssign ||
    notifyEmail !== (currentSettings.notifyEmail || "");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <DialogTitle>Autonomous AI Assignments</DialogTitle>
          </div>
          <DialogDescription>
            Configure AI-driven automatic skill assignments for{" "}
            <span className="font-semibold">{studentName || "student"}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Enable/Disable Toggle */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="auto-assign-toggle" className="text-base font-semibold">
                      Enable Autonomous Mode
                    </Label>
                    {enabled && (
                      <Badge variant="outline" className="border-success/30 text-success">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    AI will automatically create skill assignments when mastery falls below threshold
                  </p>
                </div>
                <Switch id="auto-assign-toggle" checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </CardContent>
          </Card>

          {/* Configuration Options */}
          {enabled && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assignment Rules</CardTitle>
                <CardDescription>
                  Configure when and how AI creates assignments
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Mastery Threshold */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Mastery Threshold
                    </Label>
                    <Badge variant="secondary">{masteryThreshold}%</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Assign practice when skill mastery drops below this level
                  </p>
                  <input
                    type="range"
                    min="30"
                    max="70"
                    step="5"
                    value={masteryThreshold}
                    onChange={(e) => setMasteryThreshold(parseInt(e.target.value))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>30% (More practice)</span>
                    <span>70% (Less practice)</span>
                  </div>
                </div>

                <Separator />

                {/* Frequency */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Assignment Frequency
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    How often AI checks for new assignment opportunities
                  </p>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as AutoAssignFrequency)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>Daily - Check every 24 hours</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="weekly">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>Weekly - Check every 7 days</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="on_completion">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>On Completion - After finishing assignments</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Max Concurrent */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Max Concurrent Assignments
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Maximum active AI assignments at once (prevents overwhelm)
                  </p>
                  <Select
                    value={maxConcurrent.toString()}
                    onValueChange={(v) => setMaxConcurrent(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={n.toString()}>
                          {n} assignment{n > 1 ? "s" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notification Settings */}
          {enabled && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Notifications
                </CardTitle>
                <CardDescription>
                  Get notified when AI creates new assignments
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="notify-toggle" className="text-sm font-medium">
                    Email notifications
                  </Label>
                  <Switch
                    id="notify-toggle"
                    checked={notifyOnAssign}
                    onCheckedChange={setNotifyOnAssign}
                  />
                </div>

                {notifyOnAssign && (
                  <div className="space-y-2">
                    <Label htmlFor="notify-email" className="text-sm">
                      Email Address
                    </Label>
                    <Input
                      id="notify-email"
                      type="email"
                      placeholder="parent@example.com"
                      value={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.value)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent AI Assignments */}
          {recentAssignments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent AI Assignments</CardTitle>
                <CardDescription>Last 5 autonomous assignments created</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentAssignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between p-3 rounded-md bg-muted/30 border"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                          <span className="text-sm font-medium">{assignment.ko.name}</span>
                          {assignment.status === "completed" && (
                            <Badge variant="outline" className="border-success/30 text-success">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Done
                            </Badge>
                          )}
                          {assignment.status === "active" && (
                            <Badge variant="outline" className="border-info/30 text-info">
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {assignment.courseName} • Target: {Math.round((assignment.completionCriteria.target_mastery || 0) * 100)}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {Math.round(assignment.currentMastery * 100)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(assignment.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {enabled ? (
              <>
                <AlertCircle className="h-3.5 w-3.5" />
                <span>AI will check {frequency === "daily" ? "daily" : frequency === "weekly" ? "weekly" : "after completions"}</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Autonomous mode is disabled</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Get default settings for new students
 */
function getDefaultSettings(studentId: string): AutoAssignSettings {
  return {
    studentId,
    enabled: false,
    masteryThreshold: 0.5, // 50%
    frequency: "on_completion",
    maxConcurrent: 2,
    notifyOnAssign: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Mock settings for testing
 * TODO: Replace with API call
 */
function getMockSettings(studentId: string): AutoAssignSettings {
  // Drew (student-4) has autonomous mode enabled
  if (studentId === "student-4") {
    return {
      studentId,
      enabled: true,
      masteryThreshold: 0.55, // 55%
      frequency: "on_completion",
      maxConcurrent: 2,
      notifyOnAssign: true,
      notifyEmail: "parent@example.com",
      createdAt: "2025-01-05T00:00:00Z",
      updatedAt: "2025-01-08T00:00:00Z",
    };
  }

  return getDefaultSettings(studentId);
}

/**
 * Mock recent assignments
 * TODO: Replace with API call
 */
function getMockRecentAssignments(studentId: string): AssignmentWithDetails[] {
  if (studentId !== "student-4") return [];

  return [
    {
      id: "assign-ai-1",
      studentId,
      koId: "ko-math-mult-2digit",
      courseId: "course-multiplication",
      assignedBy: "ai-system",
      assignedByRole: "ai_autonomous",
      completionCriteria: {
        primary_kpi: "mastery_score",
        target_mastery: 0.75,
        min_evidence: 10,
      },
      llmRationale: "Mastery dropped to 52% after 3-day break",
      llmConfidence: 0.89,
      status: "active",
      createdAt: "2025-01-10T08:00:00Z",
      ko: {
        id: "ko-math-mult-2digit",
        name: "Two-Digit Multiplication",
        domain: "math",
        topicClusterId: "math.arithmetic",
        prerequisites: [],
        examples: [],
        status: "published",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      courseName: "Multiplication Masters",
      currentMastery: 0.58,
      progressCurrent: 12,
      progressTarget: 20,
      progressPercentage: 60,
    },
    {
      id: "assign-ai-2",
      studentId,
      koId: "ko-math-fractions-add",
      courseId: "course-fractions",
      assignedBy: "ai-system",
      assignedByRole: "ai_autonomous",
      completionCriteria: {
        primary_kpi: "mastery_score",
        target_mastery: 0.75,
        min_evidence: 10,
      },
      llmRationale: "Prerequisite for upcoming algebra unit",
      llmConfidence: 0.92,
      status: "completed",
      completedAt: "2025-01-09T16:30:00Z",
      completionReason: "mastery_achieved",
      finalMastery: 0.78,
      createdAt: "2025-01-07T09:00:00Z",
      ko: {
        id: "ko-math-fractions-add",
        name: "Adding Fractions",
        domain: "math",
        topicClusterId: "math.fractions",
        prerequisites: [],
        examples: [],
        status: "published",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      courseName: "Fraction Fundamentals",
      currentMastery: 0.78,
      progressCurrent: 24,
      progressTarget: 20,
      progressPercentage: 100,
    },
  ];
}

/**
 * Format relative time (e.g., "2 days ago")
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}
