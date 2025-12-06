import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMCP } from '@/hooks/useMCP';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface ReviewData {
  overall: number;
  clarity: number;
  age_fit: number;
  correctness: number;
  notes: string | null;
}

interface ReviewFeedbackProps {
  jobId: string;
}

export function ReviewFeedback({ jobId }: ReviewFeedbackProps) {
  const mcp = useMCP();
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReview = async () => {
      try {
        // Use MCP to fetch review via getRecord
        const response = await mcp.getRecord('AiCourseReview', jobId) as unknown as { record?: ReviewData };
        const data = response?.record;

        if (data) {
          setReview(data);
        }
      } catch (err) {
        console.error('Failed to fetch review:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReview();
  }, [jobId, mcp]);

  if (loading || !review) {
    return null;
  }

  const getScoreColor = (score: number) => {
    if (score >= 0.75) return 'text-green-600';
    if (score >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 0.75) return 'default';
    if (score >= 0.5) return 'secondary';
    return 'destructive';
  };

  const passed = review.overall >= 0.75;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Quality Review</CardTitle>
          {passed ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-500" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Overall Quality</div>
            <div className={`text-2xl font-bold ${getScoreColor(review.overall)}`}>
              {(review.overall * 100).toFixed(0)}%
            </div>
            <Badge variant={getScoreBadge(review.overall)} className="text-xs">
              {passed ? 'Passed' : 'Needs Review'}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Correctness</span>
              <span className={`text-sm font-semibold ${getScoreColor(review.correctness)}`}>
                {(review.correctness * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Clarity</span>
              <span className={`text-sm font-semibold ${getScoreColor(review.clarity)}`}>
                {(review.clarity * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Age Fit</span>
              <span className={`text-sm font-semibold ${getScoreColor(review.age_fit)}`}>
                {(review.age_fit * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Review Notes */}
        {review.notes && (
          <Alert variant={passed ? 'default' : 'destructive'}>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm whitespace-pre-wrap">
              {review.notes}
            </AlertDescription>
          </Alert>
        )}

        {!passed && (
          <div className="text-xs text-muted-foreground border-t pt-3">
            <strong>Note:</strong> Courses need an overall score of 75% or higher to pass automatic review.
            Scores below this threshold require manual review and approval.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
