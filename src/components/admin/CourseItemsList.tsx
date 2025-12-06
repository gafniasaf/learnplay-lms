import { useState, useMemo } from "react";
import { Search, Image as ImageIcon, Music, Video, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import type { CourseItemV2, CourseGroupV2 } from "@/lib/schemas/courseV2";

interface CourseItemsListProps {
  items: CourseItemV2[];
  groups: CourseGroupV2[];
  onItemClick: (item: CourseItemV2) => void;
}

export const CourseItemsList = ({ items, groups, onItemClick }: CourseItemsListProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const groupMap = useMemo(() => {
    const map = new Map<number, CourseGroupV2>();
    groups.forEach(g => map.set(g.id, g));
    return map;
  }, [groups]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = searchQuery === "" || 
        item.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.explain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id.toString().includes(searchQuery);

      const matchesGroup = selectedGroupId === null || item.groupId === selectedGroupId;

      return matchesSearch && matchesGroup;
    });
  }, [items, searchQuery, selectedGroupId]);

  const getStimulusIcon = (type?: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="h-4 w-4" />;
      case 'audio': return <Music className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items by text, explanation, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            variant={selectedGroupId === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedGroupId(null)}
          >
            All ({items.length})
          </Button>
          {groups.map(group => {
            const count = items.filter(i => i.groupId === group.id).length;
            return (
              <Button
                key={group.id}
                variant={selectedGroupId === group.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedGroupId(group.id)}
              >
                {group.name} ({count})
              </Button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="h-[600px]">
        <div className="space-y-2">
          {filteredItems.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No items found
            </Card>
          ) : (
            filteredItems.map(item => {
              const group = groupMap.get(item.groupId);
              return (
                <Card
                  key={item.id}
                  className="p-4 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => onItemClick(item)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">#{item.id}</Badge>
                        {group && (
                          <Badge style={{ backgroundColor: group.color }} className="text-white">
                            {group.name}
                          </Badge>
                        )}
                        <Badge variant="secondary">{item.mode}</Badge>
                        {item.stimulus && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            {getStimulusIcon(item.stimulus.type)}
                            {item.stimulus.type}
                            {item.stimulus.placement === 'inline' && (
                              <span className="text-xs">(inline)</span>
                            )}
                          </Badge>
                        )}
                        {item.optionMedia?.some(m => m) && (
                          <Badge variant="outline" className="text-xs">
                            {item.optionMedia.filter(m => m).length} opt media
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium line-clamp-2">{item.text}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{item.explain}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.stimulus ? (
                        getStimulusIcon(item.stimulus.type)
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="text-sm text-muted-foreground">
        Showing {filteredItems.length} of {items.length} items
      </div>
    </div>
  );
};
