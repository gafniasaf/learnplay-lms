/**
 * GenerateCourseForm - IgniteZero compliant
 * Uses useMCP for job enqueueing instead of direct Supabase calls
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { getCourseJob } from "@/lib/api/jobs";

interface GenerateCourseFormProps {
  onGenerated: (course: any) => void;
}

interface GenerationResult {
  course: any;
  sources?: Array<{ url: string; title?: string }>;
  metadata?: {
    subject: string;
    grade: string;
    itemsPerGroup: number;
    mode: string;
    generatedAt: string;
  };
}

export const GenerateCourseForm = ({ onGenerated }: GenerateCourseFormProps) => {
  const { toast } = useToast();
  const { enqueueJob } = useMCP();
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [itemsPerGroup, setItemsPerGroup] = useState(12);
  const [mode, setMode] = useState<"options" | "numeric">("options");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const handleGenerate = async () => {
    if (!subject || !grade) {
      setError("Please fill in all required fields");
      return;
    }

    setGenerating(true);
    setError(null);
    setResult(null);
    
    try {
      // Generate course_id from subject
      const courseId = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      
      // Enqueue job via MCP
      const jobResult = await enqueueJob('ai_course_generate', {
        course_id: courseId,
        subject, 
        grade_band: grade,
        items_per_group: itemsPerGroup, 
        mode 
      });

      if (!jobResult.ok) {
        throw new Error(jobResult.error || 'Failed to enqueue job');
      }

      const jobId = jobResult.jobId as string;
      
      // Poll job status via edge function
      let attempts = 0;
      const maxAttempts = 60; // ~60s
      const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

      while (attempts < maxAttempts) {
        try {
          const jobResponse = await getCourseJob(jobId);
          
          if (jobResponse.ok && jobResponse.job) {
            const job = jobResponse.job;
            
            if (job.status === 'done') {
              // Fetch result from storage
              const resultPath = (job as any).result_path;
              if (resultPath) {
                try {
                  const response = await fetch(resultPath);
                  const courseData = await response.json();
                  setResult({
                    course: courseData,
                    metadata: {
                      subject,
                      grade,
                      itemsPerGroup,
                      mode,
                      generatedAt: new Date().toISOString()
                    }
                  });
                  onGenerated(courseData);
                  toast({
                    title: "Course Generated!",
                    description: `Generated ${courseData?.metadata?.title || subject} successfully`,
                  });
                } catch {
                  setResult({
                    course: { id: courseId },
                    metadata: { subject, grade, itemsPerGroup, mode, generatedAt: new Date().toISOString() }
                  });
                  onGenerated({ id: courseId });
                  toast({
                    title: "Job Completed",
                    description: "Course generation completed. Check the editor for results.",
                  });
                }
              }
              break;
            }

            if (job.status === 'failed') {
              throw new Error(job.error || 'Job failed');
            }
          }
        } catch (pollError) {
          console.warn('[GenerateCourseForm] Poll error:', pollError);
        }

        await delay(1000);
        attempts++;
      }

      if (attempts >= maxAttempts) {
        toast({
          title: "Job Still Running",
          description: "The generation is taking longer than expected. Check the jobs dashboard for status.",
        });
      }
    } catch (err) {
      console.error("[GenerateCourseForm] Generation error:", err);
      setError(err instanceof Error ? err.message : "Generation failed");
      toast({
        title: "Generation Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              placeholder="e.g., Algebra, World History"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={generating}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="grade">Grade Level *</Label>
            <Select value={grade} onValueChange={setGrade} disabled={generating}>
              <SelectTrigger>
                <SelectValue placeholder="Select grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="K-2">K-2</SelectItem>
                <SelectItem value="3-5">3-5</SelectItem>
                <SelectItem value="6-8">6-8</SelectItem>
                <SelectItem value="9-12">9-12</SelectItem>
                <SelectItem value="college">College</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="items">Items Per Group</Label>
            <Input
              id="items"
              type="number"
              min={4}
              max={24}
              value={itemsPerGroup}
              onChange={(e) => setItemsPerGroup(Number(e.target.value))}
              disabled={generating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mode">Question Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "options" | "numeric")} disabled={generating}>
              <SelectTrigger>
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="options">Multiple Choice</SelectItem>
                <SelectItem value="numeric">Numeric Entry</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center gap-2">
                <span>Course generated successfully!</span>
                <Badge variant="secondary">{result.metadata?.generatedAt}</Badge>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Button 
          onClick={handleGenerate} 
          disabled={generating || !subject || !grade}
          className="w-full"
          data-cta-id="generate-course"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Course
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
