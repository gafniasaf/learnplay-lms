import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, MoveUp, MoveDown, Sparkles } from "lucide-react";
import { StudyText } from "@/lib/types/course";
import { parseStudyText } from "@/lib/types/studyText";
import { useMCP } from "@/hooks/useMCP";
// supabase import removed - using useMCP
import { resolvePublicMediaUrl } from "@/lib/media/resolvePublicMediaUrl";
import { toast } from "sonner";

interface StudyTextsEditorProps {
  courseId: string;
  studyTexts: StudyText[];
  onChange: (studyTexts: StudyText[]) => void;
}

export const StudyTextsEditor = ({ courseId, studyTexts, onChange }: StudyTextsEditorProps) => {
  const mcp = useMCP();
  const [editingId, setEditingId] = useState<string | null>(null);

  const addStudyText = () => {
    const newId = `study-text-${Date.now()}`;
    const newStudyText: StudyText = {
      id: newId,
      title: "New Study Text",
      content: "[SECTION:Introduction]\nEnter your content here...",
      order: studyTexts.length + 1,
    };

    onChange([...studyTexts, newStudyText]);
    setEditingId(newId);
  };

  const updateStudyText = (id: string, updates: Partial<StudyText>) => {
    onChange(
      studyTexts.map((st) => (st.id === id ? { ...st, ...updates } : st))
    );
  };

  const deleteStudyText = (id: string) => {
    onChange(studyTexts.filter((st) => st.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const moveStudyText = (id: string, direction: 'up' | 'down') => {
    const index = studyTexts.findIndex((st) => st.id === id);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= studyTexts.length) return;

    const reordered = [...studyTexts];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];

    // Update order values
    reordered.forEach((st, i) => {
      st.order = i + 1;
    });

    onChange(reordered);
  };

  const insertSectionMarker = (id: string) => {
    const studyText = studyTexts.find((st) => st.id === id);
    if (!studyText) return;

    updateStudyText(id, {
      content: studyText.content + '\n[SECTION:New Section Title]\n',
    });
  };

  const insertImageMarker = (id: string) => {
    const studyText = studyTexts.find((st) => st.id === id);
    if (!studyText) return;

    updateStudyText(id, {
      content: studyText.content + '\n[IMAGE:path/to/image.png]\n',
    });
  };

  const editing = studyTexts.find((st) => st.id === editingId);

  return (
    <div className="space-y-4">
      {/* Study Texts List */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Study Texts ({studyTexts.length})</h3>
        <Button onClick={addStudyText} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Study Text
        </Button>
      </div>

      {studyTexts.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No study texts yet. Click "Add Study Text" to create reference materials.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* List View */}
          <div className="space-y-2">
            {studyTexts
              .sort((a, b) => a.order - b.order)
              .map((studyText, index) => {
                const sections = parseStudyText(studyText.content);

                return (
                  <Card
                    key={studyText.id}
                    className={`cursor-pointer transition-all ${
                      editingId === studyText.id
                        ? 'ring-2 ring-primary'
                        : 'hover:shadow-md'
                    }`}
                    onClick={() => setEditingId(studyText.id)}
                  >
                    <CardHeader className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <CardTitle className="text-base">{studyText.title}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {sections.length} sections
                            {studyText.learningObjectives && ` • ${studyText.learningObjectives.length} LOs`}
                          </CardDescription>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveStudyText(studyText.id, 'up');
                            }}
                            disabled={index === 0}
                          >
                            <MoveUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveStudyText(studyText.id, 'down');
                            }}
                            disabled={index === studyTexts.length - 1}
                          >
                            <MoveDown className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete "${studyText.title}"?`)) {
                                deleteStudyText(studyText.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
          </div>

          {/* Editor View */}
          {editing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Edit: {editing.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={editing.title}
                    onChange={(e) => updateStudyText(editing.id, { title: e.target.value })}
                  />
                </div>

                <div>
                  <Label>Content (with markers)</Label>
                  <div className="flex gap-2 mb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => insertSectionMarker(editing.id)}
                    >
                      + [SECTION:]
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => insertImageMarker(editing.id)}
                    >
                      + [IMAGE:]
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const toastId = toast.loading('Generating study image…');
                        try {
                          // Build prompt from title, objectives, first section
                          const parsed = parseStudyText(editing.content);
                          const firstContent = parsed[0]?.content?.join(' ') || '';
                          const lo = (editing.learningObjectives || []).slice(0, 5).join(', ');
                          const prompt = [
                            `Educational illustration for study text: ${editing.title}.`,
                            lo ? `Learning objectives: ${lo}` : '',
                            firstContent ? `Context: ${firstContent.slice(0, 300)}` : '',
                            `Style: flat illustration, high contrast, kid-friendly, clear labels, minimal text, no watermarks.`,
                          ].filter(Boolean).join('\n');
                          
                          toast.loading('Calling AI model…', { id: toastId });
                          const res = await (window as any).generateMedia?.({ prompt, kind: 'image', options: { aspectRatio: '16:9', size: '1792x1024', quality: 'standard' } }) || { url: '' };
                          
                          // Insert direct URL marker; preview supports http URLs
                          const updatedContent = editing.content + `\n[IMAGE:${res.url}]\n`;
                          updateStudyText(editing.id, { content: updatedContent });
                          
                          toast.success('AI image inserted! ✅ Check preview below.', { id: toastId });
                        } catch (e:any) {
                          console.error(e);
                          toast.error(e?.message || 'AI image generation failed', { id: toastId });
                        }
                      }}
                      className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1.5 text-purple-600" /> AI Image
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          toast.info('Enriching study text…');
                          const index = Math.max(0, (editing?.order ? editing.order - 1 : studyTexts.findIndex(st => st.id === editing?.id)));
                          const data = await mcp.call('lms.studytextRewrite', { courseId, index }) as { studyText?: unknown; content?: string; title?: string; learningObjectives?: string[] };
                          const enriched = (data?.studyText || data) as { content?: string; title?: string; learningObjectives?: string[] };
                          if (!enriched?.content) throw new Error('No enriched content');
                          updateStudyText(editing.id, { content: enriched.content, title: enriched.title || editing.title, learningObjectives: enriched.learningObjectives || editing.learningObjectives });
                          toast.success('Study text enriched');
                        } catch (e:any) {
                          console.error(e);
                          toast.error(e?.message || 'Enrichment failed');
                        }
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI Enrich
                    </Button>
                  </div>
                  <Textarea
                    value={editing.content}
                    onChange={(e) => updateStudyText(editing.id, { content: e.target.value })}
                    rows={12}
                    className="font-mono text-sm"
                  />
                </div>

                <div>
                  <Label>Learning Objectives (comma-separated)</Label>
                  <Input
                    value={editing.learningObjectives?.join(', ') || ''}
                    onChange={(e) =>
                      updateStudyText(editing.id, {
                        learningObjectives: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="LO-01, LO-02"
                  />
                </div>

                {/* Preview */}
                <Separator />
                <div>
                  <Label>Preview (WYSIWYG)</Label>
                  <div className="mt-2 p-4 border rounded-lg bg-muted/30 prose prose-sm max-w-none">
                    {parseStudyText(editing.content).map((section, i) => (
                      <div key={i} className="mb-4">
                        <h4 className="font-semibold">{section.title}</h4>
                        {section.content.map((p, j) => (
                          <p key={j}>{p}</p>
                        ))}
                        {section.images.map((img, k) => {
                          // Build full public URL for images (IgniteZero compliant)
                          const imageUrl = resolvePublicMediaUrl(img);
                          
                          return (
                            <div key={k} className="my-3">
                              <img 
                                src={imageUrl} 
                                alt={`Study illustration ${k + 1}`}
                                className="rounded-lg border shadow-sm max-w-full h-auto"
                                onError={(e) => {
                                  // Fallback on error
                                  e.currentTarget.style.display = 'none';
                                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                  if (fallback) fallback.style.display = 'block';
                                }}
                              />
                              <div className="text-xs text-muted-foreground italic mt-1" style={{ display: 'none' }}>
                                📷 Image path: {img}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

