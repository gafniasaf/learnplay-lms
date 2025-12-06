import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle2, Info, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CourseV2 } from "@/lib/schemas/courseV2";

interface ValidationIssue {
  severity: "error" | "warning" | "info";
  path: string;
  message: string;
  suggestion?: string;
}

interface ReviewData {
  issues: ValidationIssue[];
  patch: any[];
  suggestions: string[];
  summary: string;
}

interface CourseReviewTabProps {
  course: CourseV2 | null;
  onPatchApplied: (updatedCourse: CourseV2) => void;
}

export const CourseReviewTab = ({ course, onPatchApplied }: CourseReviewTabProps) => {
  const [reviewing, setReviewing] = useState(false);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleReview = async () => {
    if (!course) return;

    setReviewing(true);
    setError(null);
    setReviewData(null);
    setSuccess(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke("review-course", {
        body: { course }
      });

      if (functionError) {
        throw functionError;
      }

      if (!data.success) {
        throw new Error(data.error || "Review failed");
      }

      setReviewData({
        issues: data.issues || [],
        patch: data.patch || [],
        suggestions: data.suggestions || [],
        summary: data.summary || ""
      });
    } catch (err) {
      console.error("Review error:", err);
      setError(err instanceof Error ? err.message : "Failed to review course");
    } finally {
      setReviewing(false);
    }
  };

  const handleApplyPatch = async () => {
    if (!course || !reviewData?.patch || reviewData.patch.length === 0) return;

    setApplying(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke("apply-course-patch", {
        body: {
          courseId: course.id,
          patch: reviewData.patch,
          description: "Applied AI review suggestions"
        }
      });

      if (functionError) {
        throw functionError;
      }

      if (!data.success) {
        throw new Error(data.error || "Patch application failed");
      }

      setSuccess(`Patch applied successfully! Version: ${data.versionPath}`);
      onPatchApplied(data.patchedCourse);
      setReviewData(null);
    } catch (err) {
      console.error("Apply patch error:", err);
      setError(err instanceof Error ? err.message : "Failed to apply patch");
    } finally {
      setApplying(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "info":
        return <Info className="h-4 w-4 text-blue-600" />;
      default:
        return null;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "error":
        return "border-destructive bg-destructive/10";
      case "warning":
        return "border-yellow-500 bg-yellow-50 dark:bg-yellow-950";
      case "info":
        return "border-blue-500 bg-blue-50 dark:bg-blue-950";
      default:
        return "";
    }
  };

  if (!course) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Course Review</CardTitle>
          <CardDescription>
            AI-powered quality assurance and content review
          </CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center text-muted-foreground">
          No valid course to review. Upload or paste valid JSON first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Course Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{course.title}</CardTitle>
              <CardDescription>
                {course.items.length} items • {course.groups.length} groups • {course.levels.length} levels
              </CardDescription>
            </div>
            <Button onClick={handleReview} disabled={reviewing}>
              {reviewing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reviewing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Start AI Review
                </>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Error/Success Messages */}
      {error && (
        <Alert className="border-destructive bg-destructive/10">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {/* Review Results */}
      {reviewData && (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Review Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{reviewData.summary}</p>
            </CardContent>
          </Card>

          {/* Issues */}
          {reviewData.issues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Issues Found ({reviewData.issues.length})</CardTitle>
                <CardDescription>
                  Validation issues and potential improvements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {reviewData.issues.map((issue, idx) => (
                      <Card key={idx} className={getSeverityColor(issue.severity)}>
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-3">
                            {getSeverityIcon(issue.severity)}
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {issue.severity}
                                </Badge>
                                <span className="text-xs font-mono text-muted-foreground">
                                  {issue.path}
                                </span>
                              </div>
                              <p className="text-sm">{issue.message}</p>
                              {issue.suggestion && (
                                <p className="text-sm text-muted-foreground italic">
                                  💡 {issue.suggestion}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Patch Preview */}
          {reviewData.patch.length > 0 && (
            <Card className="border-primary">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Suggested Changes ({reviewData.patch.length})</CardTitle>
                    <CardDescription>
                      AI-generated patch to fix identified issues
                    </CardDescription>
                  </div>
                  <Button onClick={handleApplyPatch} disabled={applying}>
                    {applying ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Applying...
                      </>
                    ) : (
                      "Apply Patch"
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {reviewData.patch.map((op, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{op.op}</Badge>
                          <span className="text-xs font-mono text-muted-foreground">
                            {op.path}
                          </span>
                        </div>
                        {op.value !== undefined && (
                          <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                            {JSON.stringify(op.value, null, 2)}
                          </pre>
                        )}
                        {idx < reviewData.patch.length - 1 && <Separator />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* General Suggestions */}
          {reviewData.suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>General Suggestions</CardTitle>
                <CardDescription>
                  Pedagogical improvements and recommendations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {reviewData.suggestions.map((suggestion, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Course Preview */}
      {!reviewData && (
        <Card>
          <CardHeader>
            <CardTitle>Course Preview</CardTitle>
            <CardDescription>First 10 items from the course</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {course.items.slice(0, 10).map(item => (
                  <Card key={item.id}>
                    <CardContent className="pt-6">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <p className="font-medium">{item.text}</p>
                          <Badge>{item.mode}</Badge>
                        </div>
                        {item.mode === 'options' && item.options && (
                          <div className="grid grid-cols-2 gap-2">
                            {item.options.map((opt, idx) => (
                              <div
                                key={idx}
                                className={`p-2 rounded border text-sm ${
                                  idx === item.correctIndex
                                    ? 'border-green-500 bg-green-50 dark:bg-green-950'
                                    : 'border-border'
                                }`}
                              >
                                {opt}
                              </div>
                            ))}
                          </div>
                        )}
                        {item.mode === 'numeric' && (
                          <div className="p-2 rounded border border-green-500 bg-green-50 dark:bg-green-950 text-sm">
                            Answer: {item.answer}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {course.items.length > 10 && (
                  <p className="text-center text-muted-foreground text-sm">
                    Showing first 10 of {course.items.length} items
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
