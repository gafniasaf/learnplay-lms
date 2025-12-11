import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMCP } from "@/hooks/useMCP";
import { useClassManagement } from "@/hooks/useClassManagement";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Users, Key, Copy, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function Students() {
  const queryClient = useQueryClient();
  const mcp = useMCP();
  const classMgmt = useClassManagement();
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ["org-students"],
    queryFn: () => mcp.listOrgStudents(),
  });
  
  const generateCodeMutation = classMgmt.createChildCode;
  
  const handleGenerateSuccess = (data: unknown, _studentId: string) => {
    const codeData = data as { code: string; isNew?: boolean };
    setGeneratedCode(codeData.code);
    setShowCodeDialog(true);
    queryClient.invalidateQueries({ queryKey: ["org-students"] });
    
    if (codeData.isNew) {
      toast.success("New code generated successfully");
    } else {
      toast.success("Retrieved existing code");
    }
  };
  
  const handleGenerateError = (error: Error) => {
    toast.error(`Failed to generate code: ${error.message}`);
  };

  const handleGenerateCode = (studentId: string, studentName: string) => {
    setSelectedStudent({ id: studentId, name: studentName });
    generateCodeMutation.mutate(studentId, {
      onSuccess: handleGenerateSuccess,
      onError: handleGenerateError,
    });
  };

  const handleCopyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setCopiedCode(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCloseDialog = () => {
    setShowCodeDialog(false);
    setGeneratedCode(null);
    setSelectedStudent(null);
    setCopiedCode(false);
  };

  const students = ((studentsData as any)?.students ?? []) as Array<{ id: string; name: string; classIds: string[]; email?: string }>;

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-muted-foreground mt-1">
            Manage student access codes for parent linking
          </p>
        </div>

        {/* Students List */}
        {isLoading && (
          <div className="text-center py-12">Loading students...</div>
        )}

        {!isLoading && students.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No students yet</h3>
              <p className="text-muted-foreground">
                Students will appear here once they're enrolled in your classes
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && students.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Student Roster</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div>
                      <div className="font-medium">{student.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {student.classIds.length > 0 
                          ? `${student.classIds.length} class${student.classIds.length !== 1 ? 'es' : ''}`
                          : "No classes"
                        }
                      </div>
                    </div>
                    <Button
                      onClick={() => handleGenerateCode(student.id, student.name)}
                      disabled={generateCodeMutation.isPending}
                      variant="outline"
                      size="sm"
                    >
                      <Key className="h-4 w-4 mr-2" />
                      {generateCodeMutation.isPending && generateCodeMutation.variables === student.id
                        ? "Generating..."
                        : "Parent Code"
                      }
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Code Display Dialog */}
        <Dialog open={showCodeDialog} onOpenChange={handleCloseDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Parent Linking Code</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Code for: <span className="font-medium">{selectedStudent?.name}</span>
                </p>
                <div className="p-6 bg-primary/10 rounded-lg">
                  <div className="text-4xl font-bold font-mono tracking-widest text-primary">
                    {generatedCode}
                  </div>
                </div>
                <Button
                  onClick={handleCopyCode}
                  variant="outline"
                  className="mt-4"
                >
                  {copiedCode ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Code
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong>Instructions for parents:</strong>
                </p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Share this 6-character code with the parent</li>
                  <li>Parent logs in to their account</li>
                  <li>Parent navigates to "Link Child" page</li>
                  <li>Parent enters this code to link to {selectedStudent?.name}</li>
                </ol>
                <p className="mt-4">
                  <Badge variant="outline">Valid for 30 days</Badge>
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCloseDialog}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  );
}
