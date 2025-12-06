import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import type { TopicRow } from "./TopicsHandled";

interface TopicsGlanceProps {
  topics: TopicRow[];
}

export const TopicsGlance = ({ topics }: TopicsGlanceProps) => {
  const safeTopics = Array.isArray(topics) ? topics : [];
  const lastThree = safeTopics.slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Topics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {lastThree.map((topic, index) => (
            <div key={index} className="space-y-1 pb-3 border-b last:border-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{topic.topic}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {topic.subject}
                    </Badge>
                    {topic.date ? (
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(topic.date), 'h:mm a')}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No timestamp</span>
                    )}
                  </div>
                </div>
                {topic.status === 'Mastered' && (
                  <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{topic.items} items</span>
                <span className={topic.accuracyPct >= 80 ? 'text-success' : 'text-warning'}>
                  {topic.accuracyPct}% accuracy
                </span>
              </div>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link to="/parent/topics">
            View all topics
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};
