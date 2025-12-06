import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

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
    
    // Insert AI job; browser reads live without calling functions
    try {
      // Generate course_id from subject
      const courseId = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      
      const { data, error: insertErr } = await supabase
        .from('ai_course_jobs')
        .insert({ 
          course_id: courseId,
          subject, 
          grade_band: grade,
          items_per_group: itemsPerGroup, 
          mode 
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      const jobId = data.id as string;
      // Poll job status
      let attempts = 0;
      const maxAttempts = 60; // ~60s
      const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

      while (attempts < maxAttempts) {
        const { data: job, error: selErr } = await supabase
          .from('ai_course_jobs')
          .select('status, result_path, error')
          .eq('id', jobId)
          .single();

        if (selErr) throw selErr;

        if (job.status === 'done' && job.result_path) {
          // Fetch course JSON from Storage public URL
          const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${job.result_path}`;
          const resp = await fetch(url);
          const courseJson = await resp.json();
          setResult({ course: courseJson });
          break;
        }
        if (job.status === 'failed') {
          setError(job.error || 'AI job failed');
          break;
        }
        attempts++;
        await delay(1000);
      }
      if (attempts >= maxAttempts) setError('Timed out waiting for AI job');
    } catch (e: any) {
      setError(e?.message || 'Failed to submit AI job');
    } finally {
      setGenerating(false);
    }
  };

  const handleUse = () => {
    if (result?.course) {
      onGenerated(result.course);
    }
  };

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="subject">Subject *</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g., Modal Verbs, Fractions, Ancient Rome"
            disabled={generating}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="grade">Grade Level *</Label>
          <Select value={grade} onValueChange={setGrade} disabled={generating}>
            <SelectTrigger id="grade">
              <SelectValue placeholder="Select grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="K-2">K-2</SelectItem>
              <SelectItem value="3-5">3-5</SelectItem>
              <SelectItem value="6-8">6-8</SelectItem>
              <SelectItem value="9-12">9-12</SelectItem>
              <SelectItem value="College">College</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="itemsPerGroup">Items per Group</Label>
          <Input
            id="itemsPerGroup"
            type="number"
            min={8}
            max={20}
            value={itemsPerGroup}
            onChange={(e) => setItemsPerGroup(parseInt(e.target.value) || 12)}
            disabled={generating}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mode">Question Mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as "options" | "numeric")} disabled={generating}>
            <SelectTrigger id="mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="options">Multiple Choice</SelectItem>
              <SelectItem value="numeric">Numeric Answer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Alert className="border-destructive bg-destructive/10">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button onClick={handleGenerate} disabled={generating || !subject || !grade} className="w-full">
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating Course...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Course
          </>
        )}
      </Button>

      {/* Result Preview */}
      {result && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-lg">{result.course.title}</h3>
                <p className="text-sm text-muted-foreground">{result.course.description}</p>
              </div>
              <Badge variant="secondary">Generated</Badge>
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Items</p>
                <p className="font-semibold">{result.course.items?.length || 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Groups</p>
                <p className="font-semibold">{result.course.groups?.length || 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Levels</p>
                <p className="font-semibold">{result.course.levels?.length || 0}</p>
              </div>
            </div>

            {result.sources && result.sources.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Research Sources:</p>
                <div className="space-y-1">
                  {result.sources.map((source, idx) => (
                    <div key={idx} className="text-xs">
                      <Badge variant="outline" className="mr-2">
                        {idx + 1}
                      </Badge>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {source.title || source.url}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleUse} className="w-full">
              Use This Course
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
