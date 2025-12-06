/**
 * JoinClass - IgniteZero compliant
 * Uses edge functions via API layer
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { joinClass } from "@/lib/api";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { callEdgeFunctionGet } from "@/lib/api/common";

interface ClassData {
  id: string;
  name: string;
  created_at: string;
}

export default function JoinClass() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");

  // Get current classes via edge function
  const { data: classesData } = useQuery({
    queryKey: ["student-classes"],
    queryFn: async () => {
      try {
        const response = await callEdgeFunctionGet<{ ok: boolean; classes: ClassData[] }>(
          "list-classes",
          { role: "student" }
        );
        return response.classes ?? [];
      } catch (error) {
        console.warn('[JoinClass] Failed to load classes:', error);
        return [];
      }
    },
  });

  const joinMutation = useMutation({
    mutationFn: (code: string) => joinClass(code),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["student-classes"] });
      setCode("");
      toast.success(data.message);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to join class");
    },
  });

  const handleJoinClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length === 6) {
      joinMutation.mutate(code.trim().toUpperCase());
    } else {
      toast.error("Please enter a valid 6-character code");
    }
  };

  return (
    <PageContainer>
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Join a Class</h1>
          <p className="text-muted-foreground mt-1">
            Enter the code provided by your teacher to join a class
          </p>
        </div>

        {/* Join Form */}
        <Card>
          <CardHeader>
            <CardTitle>Enter Class Code</CardTitle>
            <CardDescription>
              Ask your teacher for the 6-character join code
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinClass} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Join Code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  className="font-mono text-xl tracking-widest text-center"
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Enter the 6-character code exactly as shown
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={joinMutation.isPending || code.trim().length !== 6}
                data-cta-id="join-class"
              >
                {joinMutation.isPending ? "Joining..." : "Join Class"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Current Classes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              My Classes
            </CardTitle>
            <CardDescription>
              Classes you're currently enrolled in
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!classesData || classesData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                You haven't joined any classes yet
              </p>
            ) : (
              <div className="space-y-3">
                {classesData.map((cls: ClassData) => (
                  <div
                    key={cls.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{cls.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Joined {new Date(cls.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
