import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getAssignmentProgress, exportGradebook } from "@/lib/api";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export default function AssignmentProgress() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["assignment-progress", id],
    queryFn: () => getAssignmentProgress(id!),
    enabled: !!id,
  });

  const handleExportCSV = async () => {
    if (!id) return;
    
    setIsExporting(true);
    try {
      const blob = await exportGradebook(id);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gradebook-${data?.assignmentTitle || id}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success("Gradebook exported successfully");
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to export gradebook");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            Loading assignment progress...
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className="text-center py-12 text-destructive">
          Failed to load assignment progress
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/teacher/assignments")}
              className="mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Assignments
            </Button>
            <h1 className="text-3xl font-bold">Assignment Progress</h1>
            {data?.assignmentTitle && (
              <p className="text-muted-foreground mt-1">{data.assignmentTitle}</p>
            )}
          </div>
          <Button
            onClick={handleExportCSV}
            disabled={isExporting || !data?.rows?.length}
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Student Progress</CardTitle>
          </CardHeader>
          <CardContent>
            {!data?.rows || data.rows.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No students assigned to this assignment yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-3 text-left font-medium">Student</th>
                      <th className="p-3 text-center font-medium">Attempts</th>
                      <th className="p-3 text-center font-medium">Correct</th>
                      <th className="p-3 text-center font-medium">Accuracy</th>
                      <th className="p-3 text-center font-medium">Status</th>
                      <th className="p-3 text-center font-medium">Last Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.studentId} className="border-b hover:bg-muted/50">
                        <td className="p-3 text-left font-medium">{row.name}</td>
                        <td className="p-3 text-center">{row.attempts}</td>
                        <td className="p-3 text-center">{row.correct}</td>
                        <td className="p-3 text-center">
                          <Badge
                            variant={row.accuracy >= 80 ? "default" : row.accuracy >= 60 ? "secondary" : "destructive"}
                          >
                            {row.accuracy}%
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          {row.completed ? (
                            <CheckCircle className="h-5 w-5 text-green-600 mx-auto" />
                          ) : (
                            <XCircle className="h-5 w-5 text-muted-foreground mx-auto" />
                          )}
                        </td>
                        <td className="p-3 text-center text-muted-foreground">
                          {row.lastActivity
                            ? new Date(row.lastActivity).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
