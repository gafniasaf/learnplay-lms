import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listClasses, createClass, addClassMember, removeClassMember, generateClassCode, getClassRoster } from "@/lib/api";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Users, Copy, RefreshCw, Key, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Classes() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRosterSheet, setShowRosterSheet] = useState(false);
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedClassName, setSelectedClassName] = useState<string>("");
  const [newClassName, setNewClassName] = useState("");
  const [newClassDescription, setNewClassDescription] = useState("");
  const [memberEmail, setMemberEmail] = useState("");

  const { data: classesData, isLoading, refetch: refetchClasses } = useQuery({
    queryKey: ["classes"],
    queryFn: listClasses,
  });

  const { data: joinCodeData, isLoading: codeLoading, refetch: refetchCode } = useQuery({
    queryKey: ["class-code", selectedClassId],
    queryFn: () => generateClassCode(selectedClassId!, false),
    enabled: !!selectedClassId && showCodeDialog,
  });

  const createMutation = useMutation({
    mutationFn: createClass,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      setShowCreateDialog(false);
      setNewClassName("");
      setNewClassDescription("");
      toast.success("Class created successfully");
    },
    onError: (error) => {
      toast.error(`Failed to create class: ${error.message}`);
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: addClassMember,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["classes"] });
      await queryClient.invalidateQueries({ queryKey: ["class-roster", selectedClassId] });
      await refetchClasses();
      setMemberEmail("");
      toast.success("Student added to class");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: removeClassMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["class-roster", selectedClassId] });
      toast.success("Student removed from class");
    },
    onError: (error: any) => {
      toast.error(`Failed to remove student: ${error.message}`);
    },
  });

  const handleCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (newClassName.trim()) {
      createMutation.mutate({
        name: newClassName.trim(),
        description: newClassDescription.trim() || undefined,
      });
    }
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (memberEmail.trim() && selectedClassId) {
      addMemberMutation.mutate({
        classId: selectedClassId,
        studentEmail: memberEmail.trim(),
      });
    }
  };

  const handleOpenRoster = async (classId: string, className: string) => {
    setSelectedClassId(classId);
    setSelectedClassName(className);
    await refetchClasses();
    setShowRosterSheet(true);
  };

  const handleOpenCode = (classId: string) => {
    setSelectedClassId(classId);
    setShowCodeDialog(true);
  };

  const handleCopyCode = () => {
    if (joinCodeData?.code) {
      navigator.clipboard.writeText(joinCodeData.code);
      toast.success("Code copied to clipboard");
    }
  };

  const handleRefreshCode = async () => {
    if (!selectedClassId) return;
    
    try {
      await generateClassCode(selectedClassId, true);
      await refetchCode();
      toast.success("New code generated");
    } catch (error) {
      toast.error("Failed to refresh code");
    }
  };

  const handleRemoveMember = (studentId: string) => {
    if (!selectedClassId) return;
    if (confirm("Are you sure you want to remove this student from the class?")) {
      removeMemberMutation.mutate({ classId: selectedClassId, studentId });
    }
  };

  const classes = classesData?.classes ?? [];
  const selectedClass = classes.find(c => c.id === selectedClassId);

  const { data: rosterData, isLoading: rosterLoading, isFetching: rosterFetching } = useQuery({
    queryKey: ["class-roster", selectedClassId, showRosterSheet],
    queryFn: () => getClassRoster(selectedClassId!),
    enabled: !!selectedClassId && showRosterSheet,
  });

  const members = rosterData?.roster ?? selectedClass?.class_members ?? [];
  const isLoadingRoster = rosterLoading || rosterFetching || addMemberMutation.isPending || removeMemberMutation.isPending;

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Classes</h1>
            <p className="text-muted-foreground mt-1">Manage your classes and students</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Class
          </Button>
        </div>

        {/* Classes Grid */}
        {isLoading && (
          <div className="text-center py-12">Loading classes...</div>
        )}

        {!isLoading && classes.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No classes yet</h3>
              <p className="text-muted-foreground mb-6">
                Create your first class to start managing students
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Class
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && classes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls) => {
              const memberCount = (cls as any).student_count ?? cls.class_members?.length ?? 0;
              return (
                <Card key={cls.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      {cls.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {cls.description && (
                      <p className="text-sm text-muted-foreground">{cls.description}</p>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Created {new Date(cls.created_at).toLocaleDateString()}
                      </span>
                      <Badge variant="secondary">
                        {memberCount} {memberCount === 1 ? "student" : "students"}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenRoster(cls.id, cls.name)}
                          className="flex-1"
                        >
                          <Users className="h-4 w-4 mr-1" />
                          Roster
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenCode(cls.id)}
                          className="flex-1"
                        >
                          <Key className="h-4 w-4 mr-1" />
                          Code
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create Class Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Class</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateClass}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="className">Class Name</Label>
                  <Input
                    id="className"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="e.g., Grade 3A, Math 101"
                    required
                    maxLength={200}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="classDescription">Description (optional)</Label>
                  <Input
                    id="classDescription"
                    value={newClassDescription}
                    onChange={(e) => setNewClassDescription(e.target.value)}
                    placeholder="e.g., Morning class, Advanced students"
                    maxLength={1000}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Class"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Class Roster Sheet */}
        <Sheet open={showRosterSheet} onOpenChange={setShowRosterSheet}>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{selectedClassName} Roster</SheetTitle>
            </SheetHeader>
            
            <div className="space-y-6 py-6">
              {/* Add Student Form */}
              <div className="border rounded-lg p-4 bg-muted/50">
                <h3 className="font-semibold mb-3">Add Student by Email</h3>
                <form onSubmit={handleAddMember} className="flex gap-2">
                  <Input
                    type="email"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="student@example.com"
                    required
                    disabled={addMemberMutation.isPending}
                  />
                  <Button type="submit" disabled={addMemberMutation.isPending}>
                    {addMemberMutation.isPending ? "Adding..." : "Add"}
                  </Button>
                </form>
                <p className="text-sm text-muted-foreground mt-2">
                  Student must have an existing account with this email address
                </p>
              </div>

              {/* Students Table */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  Students ({members.length})
                  {isLoadingRoster && (
                    <span className="text-sm text-muted-foreground font-normal">Updating...</span>
                  )}
                </h3>
                {isLoadingRoster && members.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-sm text-muted-foreground">Loading students...</div>
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No students enrolled yet. Add students using the form above.
                  </p>
                ) : (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((member) => (
                          <TableRow key={member.user_id}>
                            <TableCell className="font-medium">
                              {member.profiles?.full_name || "No name"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {member.email || "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveMember(member.user_id)}
                                disabled={removeMemberMutation.isPending}
                                title="Remove student"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Join Code Dialog */}
        <Dialog open={showCodeDialog} onOpenChange={setShowCodeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Class Join Code</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Share this code with students to let them join the class instantly.
              </p>
              
              {codeLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-muted-foreground">Loading code...</div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-4 rounded-lg bg-muted/50 font-mono text-2xl text-center tracking-widest">
                      {joinCodeData?.code}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyCode}
                      title="Copy code"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    Expires: {joinCodeData?.expiresAt ? new Date(joinCodeData.expiresAt).toLocaleDateString() : "—"}
                  </div>

                  <Button
                    variant="outline"
                    onClick={handleRefreshCode}
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Generate New Code
                  </Button>
                </>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCodeDialog(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  );
}
