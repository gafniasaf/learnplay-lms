import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface TopicRow {
  date: string;
  subject: string;
  topic: string;
  minutes: number;
  items: number;
  accuracyPct: number;
  status: string;
}

interface RecentTopicsCardProps {
  topics: TopicRow[];
}

export const RecentTopicsCard = ({ topics }: RecentTopicsCardProps) => {
  const navigate = useNavigate();
  const recent = topics.slice(0, 3);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "mastered":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "practicing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "new":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (topics.length === 0) {
    return (
      <Card className="p-6 border border-border/40 bg-card">
        <div className="space-y-4 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <div>
            <h3 className="font-semibold mb-1">Recent Topics</h3>
            <p className="text-sm text-muted-foreground">No recent topics to display.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => navigate("/parent/topics")}
          >
            View Topics
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border border-border/40 bg-card hover:shadow-md transition-all duration-200">
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-1">Recent Topics</h3>
          <p className="text-xs text-muted-foreground">What they're learning now</p>
        </div>

        <div className="space-y-2.5">
          {recent.map((topic, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors duration-200 border border-border/40"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm leading-tight line-clamp-1">{topic.topic}</span>
                  {topic.status === "Mastered" && (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  )}
                </div>
                
                <div className="flex items-center flex-wrap gap-2 text-xs">
                  <Badge 
                    variant="outline" 
                    className="text-xs"
                  >
                    {topic.subject}
                  </Badge>
                  <Badge 
                    className={cn("text-xs border-0", getStatusColor(topic.status))}
                  >
                    {topic.status}
                  </Badge>
                  <span className="text-muted-foreground">{topic.accuracyPct}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => navigate("/parent/topics")}
        >
          View Topics
        </Button>
      </div>
    </Card>
  );
};
