import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useMCP } from "@/hooks/useMCP";
import { PageContainer } from "@/components/layout/PageContainer";
import { ParentLayout } from "@/components/parent/ParentLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

export default function LinkChild() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mcp = useMCP();
  const [code, setCode] = useState("");

  // IMPORTANT: Parent linking should NOT trigger teacher-only queries (like list-classes).
  // Use a dedicated mutation instead of the shared useClassManagement hook.
  const linkMutation = useMutation({
    mutationFn: (trimmedCode: string) => mcp.linkChild(trimmedCode),
  });
  
  // Override onSuccess/onError for this component
  const handleLinkSuccess = (data: unknown) => {
    queryClient.invalidateQueries({ queryKey: ["parent-dashboard"] });
    toast.success((data as { message?: string }).message || "Child linked successfully");
    if (!(data as { alreadyLinked?: boolean }).alreadyLinked) {
      navigate("/parent/dashboard");
    }
  };
  
  const handleLinkError = (error: Error) => {
    if (error.message.includes("Invalid code")) {
      toast.error("Invalid code. Please check and try again.");
    } else if (error.message.includes("already been used")) {
      toast.error("This code has already been used.");
    } else if (error.message.includes("expired")) {
      toast.error("This code has expired. Please request a new one.");
    } else {
      toast.error(`Failed to link child: ${error.message}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    
    if (trimmedCode.length !== 6) {
      toast.error("Code must be 6 characters");
      return;
    }

    linkMutation.mutate(trimmedCode, {
      onSuccess: handleLinkSuccess,
      onError: handleLinkError,
    });
  };

  return (
    <PageContainer>
      <ParentLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Link Your Child</h1>
            <p className="text-muted-foreground mt-2">
              Enter the 6-character code provided by your child's teacher
            </p>
          </div>

          {/* Link Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                Enter Child Code
              </CardTitle>
              <CardDescription>
                Your child's teacher can generate a linking code for you. Ask them to provide
                the 6-character code from their student management page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Child Code</Label>
                  <Input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    maxLength={6}
                    required
                    className="text-lg font-mono text-center tracking-widest"
                    autoFocus
                    aria-describedby="code-help"
                  />
                  <p id="code-help" className="text-sm text-muted-foreground">
                    Enter the 6-character code exactly as provided by the teacher
                  </p>
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  size="lg"
                  disabled={linkMutation.isPending || code.length !== 6}
                  aria-label={linkMutation.isPending ? "Linking child account" : "Link child account"}
                >
                  {linkMutation.isPending ? "Linking..." : "Link Child"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Help Card */}
          <Card className="bg-muted/50 border-muted">
            <CardHeader>
              <CardTitle className="text-base">Don't have a code?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Contact your child's teacher and ask them to generate a parent linking code
                from their student management page. The code will be valid for 30 days.
              </p>
              <p>
                Once linked, you'll be able to see your child's courses, assignments, and progress
                from your parent dashboard.
              </p>
            </CardContent>
          </Card>
        </div>
      </ParentLayout>
    </PageContainer>
  );
}
