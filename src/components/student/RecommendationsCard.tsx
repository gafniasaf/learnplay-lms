import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Lightbulb, Play } from "lucide-react";

interface Recommendation {
  id: string;
  title: string;
  courseId?: string;
  level?: number;
}

interface RecommendationsCardProps {
  recommendations: Recommendation[];
}

export function RecommendationsCard({ recommendations }: RecommendationsCardProps) {
  if (recommendations.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Lightbulb className="h-8 w-8 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Great work! Keep it up.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Recommendations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.slice(0, 2).map((rec) => (
          <div key={rec.id} className="p-3 rounded-md bg-gradient-to-r from-warning/10 to-accent/10 space-y-2">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm leading-relaxed flex-1">{rec.title}</p>
            </div>
            {rec.courseId && (
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link to={`/play/${rec.courseId}/welcome${rec.level ? `?level=${rec.level}` : ''}`}>
                  <Play className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Start Practice
                </Link>
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

