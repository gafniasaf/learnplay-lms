import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Clock, ChevronRight } from "lucide-react";
import { StudyText, parseStudyText, estimateReadingTime } from "@/lib/types/studyText";
import { AspectRatio } from "@/components/ui/aspect-ratio";

interface StudyTextsDrawerProps {
  courseTitle: string;
  studyTexts: StudyText[];
  currentItemRelatedIds?: string[];  // Highlight these as relevant to current question
}

export const StudyTextsDrawer = ({ courseTitle, studyTexts, currentItemRelatedIds = [] }: StudyTextsDrawerProps) => {
  const [selectedStudyTextId, setSelectedStudyTextId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (!studyTexts || studyTexts.length === 0) {
    return null;  // No study texts available
  }

  const selectedStudyText = studyTexts.find(st => st.id === selectedStudyTextId);
  const parsedSections = selectedStudyText ? parseStudyText(selectedStudyText.content) : [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <BookOpen className="h-4 w-4" />
          Study Materials
          {currentItemRelatedIds.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {currentItemRelatedIds.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0">
        <div className="h-full flex flex-col">
          <SheetHeader className="p-6 pb-4">
            <SheetTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Study Materials
            </SheetTitle>
            <SheetDescription>
              Reference texts for {courseTitle}
            </SheetDescription>
          </SheetHeader>

          <Separator />

          {!selectedStudyText ? (
            /* Study Text List */
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-3">
                {studyTexts
                  .sort((a, b) => a.order - b.order)
                  .map((studyText) => {
                    const isRelated = currentItemRelatedIds.includes(studyText.id);
                    const readingTime = estimateReadingTime(studyText.content);

                    return (
                      <button
                        key={studyText.id}
                        onClick={() => setSelectedStudyTextId(studyText.id)}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                          isRelated
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-base">{studyText.title}</h3>
                              {isRelated && (
                                <Badge variant="default" className="text-xs">
                                  Relevant
                                </Badge>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {readingTime} min read
                              </span>
                              {studyText.metadata?.difficulty && (
                                <Badge variant="outline" className="text-xs">
                                  {studyText.metadata.difficulty}
                                </Badge>
                              )}
                            </div>

                            {studyText.learningObjectives && studyText.learningObjectives.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {studyText.learningObjectives.slice(0, 2).map((lo) => (
                                  <Badge key={lo} variant="secondary" className="text-xs">
                                    {lo}
                                  </Badge>
                                ))}
                                {studyText.learningObjectives.length > 2 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{studyText.learningObjectives.length - 2}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>

                          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        </div>
                      </button>
                    );
                  })}
              </div>
            </ScrollArea>
          ) : (
            /* Study Text Content View */
            <>
              <div className="p-6 pb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStudyTextId(null)}
                  className="mb-2"
                >
                  ← Back to list
                </Button>
                <h2 className="text-2xl font-bold">{selectedStudyText.title}</h2>
                {selectedStudyText.metadata?.estimatedReadingTime && (
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {selectedStudyText.metadata.estimatedReadingTime} min read
                  </p>
                )}
              </div>

              <Separator />

              <ScrollArea className="flex-1 p-6">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {parsedSections.map((section, sectionIdx) => (
                    <div key={sectionIdx} className="mb-8">
                      <h3 className="text-lg font-semibold mb-3">{section.title}</h3>
                      
                      {section.content.map((paragraph, pIdx) => (
                        <p key={pIdx} className="mb-3 leading-relaxed">
                          {paragraph}
                        </p>
                      ))}

                      {section.images.map((imagePath, imgIdx) => {
                        // Construct full URL from path
                        const imageUrl = imagePath.startsWith('http')
                          ? imagePath
                          : `${(typeof process !== 'undefined' ? (process as any).env?.VITE_SUPABASE_URL : '')}/storage/v1/object/public/courses/${imagePath}`;

                        return (
                          <div key={imgIdx} className="my-4">
                            <AspectRatio ratio={16 / 9} className="bg-muted rounded-lg overflow-hidden">
                              <img
                                src={imageUrl}
                                alt={`${section.title} illustration ${imgIdx + 1}`}
                                className="w-full h-full object-contain"
                                loading="lazy"
                              />
                            </AspectRatio>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

