import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMCP } from "@/hooks/useMCP";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { JobProgress } from "@/components/shared/JobProgress";
import { toast } from "sonner";

export default function ClassProgress() {
  const [classId, setClassId] = useState<string>("");
  const mcp = useMCP();
  
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["class-progress", classId],
    queryFn: () => classId ? mcp.getClassProgress(classId) : Promise.resolve(null),
    enabled: !!classId,
  });

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Class Progress</CardTitle>
              <CardDescription>View student performance by course</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Course</label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="modals">English Modals</SelectItem>
                  <SelectItem value="verbs">English Verbs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Time Range</label>
              <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="60">Last 60 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading progress data...
            </div>
          ) : data?.rows && data.rows.length > 0 ? (
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Student</th>
                    <th className="p-3 text-left font-medium">Attempts</th>
                    <th className="p-3 text-left font-medium">Correct</th>
                    <th className="p-3 text-left font-medium">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row: any, idx: number) => (
                    <tr
                      key={row.studentId}
                      className={`border-b ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}
                    >
                      <td className="p-3 font-medium">{row.name}</td>
                      <td className="p-3 text-muted-foreground">{row.attempts}</td>
                      <td className="p-3 text-muted-foreground">{row.correct}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${row.accuracy}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium min-w-[3rem] text-right">
                            {row.accuracy}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No student activity found for this course in the selected time range.
            </div>
          )}

          {data?.since && (
            <p className="text-xs text-muted-foreground mt-4">
              Data since {new Date(data.since).toLocaleDateString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Remediation suggestion */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Suggest remediation</CardTitle>
                <CardDescription>Kick off a practice set job for a weak skill</CardDescription>
              </div>
              {jobId && <JobProgress jobId={jobId} />}
            </div>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={async () => {
                const ko = prompt("Enter weak skill (e.g., Fractions basics):");
                if (!ko) return;
                try {
                  const json = await mcp.call<any>('lms.generateRemediation', { subject: ko, itemsPerGroup: 8 });
                  if (json.jobId) {
                    setJobId(json.jobId);
                    toast.success(`Started remediation job: ${json.jobId}`);
                  } else {
                    toast.error(json?.error?.message || "Failed to start remediation");
                  }
                } catch (e:any) {
                  toast.error(e?.message || "Failed to start remediation");
                }
              }}
            >
              Generate remediation set
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
