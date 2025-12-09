import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Search, RefreshCw, Download, Filter, Grid3x3, List, Image, Music, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MediaAsset {
  id: string;
  logical_id: string;
  version: number;
  storage_path: string;
  public_url: string;
  media_type: 'image' | 'audio' | 'video';
  mime_type: string;
  file_size_bytes: number;
  provider: string;
  prompt: string;
  cost_usd: number;
  created_at: string;
  status: 'active' | 'archived' | 'quarantined';
  usage_count: number;
}

interface MediaLibraryProps {
  courseId: string;
  onRegenerateAsset?: (assetId: string) => void;
  onSelectAsset?: (asset: MediaAsset) => void;
}

type ViewMode = 'grid' | 'list';
type MediaTypeFilter = 'all' | 'image' | 'audio' | 'video';
type SortBy = 'date' | 'name' | 'size' | 'cost';

export function MediaLibrary({ courseId, onRegenerateAsset, onSelectAsset }: MediaLibraryProps) {
  // Mock data - will be replaced with real Supabase query
  const [assets] = useState<MediaAsset[]>([
    {
      id: '1',
      logical_id: `${courseId}-item-42-stimulus`,
      version: 1,
      storage_path: `${courseId}/assets/images/item-42-1698765432000.png`,
      public_url: '/placeholder.svg',
      media_type: 'image',
      mime_type: 'image/png',
      file_size_bytes: 245000,
      provider: 'openai-dalle3',
      prompt: 'Detailed liver anatomy diagram',
      cost_usd: 0.04,
      created_at: '2025-10-24T10:00:00Z',
      status: 'active',
      usage_count: 3,
    },
  ]);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Filter and sort assets
  const filteredAssets = useMemo(() => {
    let filtered = assets;

    // Filter by media type
    if (mediaTypeFilter !== 'all') {
      filtered = filtered.filter(a => a.media_type === mediaTypeFilter);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.logical_id.toLowerCase().includes(query) ||
        a.prompt.toLowerCase().includes(query) ||
        a.provider.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'name':
          return a.logical_id.localeCompare(b.logical_id);
        case 'size':
          return b.file_size_bytes - a.file_size_bytes;
        case 'cost':
          return b.cost_usd - a.cost_usd;
        default:
          return 0;
      }
    });

    return filtered;
  }, [assets, mediaTypeFilter, searchQuery, sortBy]);

  const toggleAssetSelection = (assetId: string) => {
    const newSelection = new Set(selectedAssets);
    if (newSelection.has(assetId)) {
      newSelection.delete(assetId);
    } else {
      newSelection.add(assetId);
    }
    setSelectedAssets(newSelection);
  };

  const selectAll = () => {
    setSelectedAssets(new Set(filteredAssets.map(a => a.id)));
  };

  const clearSelection = () => {
    setSelectedAssets(new Set());
  };

  const handleBulkRegenerate = () => {
    setShowBulkActions(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatCost = (usd: number) => {
    return `$${usd.toFixed(4)}`;
  };

  const getMediaTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="h-4 w-4" />;
      case 'audio': return <Music className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      default: return null;
    }
  };

  const totalCost = filteredAssets.reduce((sum, a) => sum + a.cost_usd, 0);
  const totalSize = filteredAssets.reduce((sum, a) => sum + a.file_size_bytes, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Media Library</h2>
          <p className="text-sm text-muted-foreground">
            {filteredAssets.length} assets • {formatFileSize(totalSize)} • {formatCost(totalCost)} total
          </p>
        </div>
        
        {selectedAssets.size > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selectedAssets.size} selected</Badge>
            <Button variant="outline" size="sm" onClick={handleBulkRegenerate}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by prompt, ID, or provider..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Media Type Filter */}
            <Select value={mediaTypeFilter} onValueChange={(v) => setMediaTypeFilter(v as MediaTypeFilter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="image">Images</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
                <SelectItem value="video">Video</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date Created</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="size">File Size</SelectItem>
                <SelectItem value="cost">Cost</SelectItem>
              </SelectContent>
            </Select>

            {/* View Mode */}
            <div className="flex gap-1 border rounded-md p-1">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            {selectedAssets.size === 0 && (
              <Button variant="outline" size="sm" onClick={selectAll}>
                Select All
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Asset Grid/List */}
      {filteredAssets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Filter className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No assets found</h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'Try adjusting your search' : 'No media assets in this course yet'}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAssets.map((asset) => (
            <Card
              key={asset.id}
              className={cn(
                'cursor-pointer hover:border-primary transition-colors',
                selectedAssets.has(asset.id) && 'border-primary bg-primary/5'
              )}
              onClick={() => onSelectAsset?.(asset)}
            >
              <CardHeader className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {getMediaTypeIcon(asset.media_type)}
                    <span className="text-sm font-medium truncate">{asset.logical_id}</span>
                  </div>
                  <Checkbox
                    checked={selectedAssets.has(asset.id)}
                    onCheckedChange={() => toggleAssetSelection(asset.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-3">
                {/* Preview */}
                {asset.media_type === 'image' && (
                  <AspectRatio ratio={16 / 9} className="bg-muted rounded overflow-hidden">
                    <img
                      src={asset.public_url}
                      alt={asset.prompt}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </AspectRatio>
                )}

                {/* Metadata */}
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Provider:</span>
                    <Badge variant="outline" className="text-xs">{asset.provider}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Size:</span>
                    <span>{formatFileSize(asset.file_size_bytes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cost:</span>
                    <span>{formatCost(asset.cost_usd)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Used:</span>
                    <span>{asset.usage_count}×</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRegenerateAsset?.(asset.id);
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Regenerate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(asset.public_url, '_blank');
                    }}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  className={cn(
                    'flex items-center gap-4 p-4 hover:bg-muted/50 cursor-pointer',
                    selectedAssets.has(asset.id) && 'bg-primary/5'
                  )}
                  onClick={() => onSelectAsset?.(asset)}
                >
                  <Checkbox
                    checked={selectedAssets.has(asset.id)}
                    onCheckedChange={() => toggleAssetSelection(asset.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  
                  {getMediaTypeIcon(asset.media_type)}
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{asset.logical_id}</div>
                    <div className="text-sm text-muted-foreground truncate">{asset.prompt}</div>
                  </div>
                  
                  <Badge variant="outline">{asset.provider}</Badge>
                  <div className="text-sm text-muted-foreground">{formatFileSize(asset.file_size_bytes)}</div>
                  <div className="text-sm text-muted-foreground">{formatCost(asset.cost_usd)}</div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRegenerateAsset?.(asset.id);
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Actions Dialog */}
      <Dialog open={showBulkActions} onOpenChange={setShowBulkActions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Regenerate</DialogTitle>
            <DialogDescription>
              Regenerate {selectedAssets.size} selected assets
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Provider</label>
              <Select defaultValue="openai-dalle3">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai-dalle3">DALL-E 3 ($0.04 each)</SelectItem>
                  <SelectItem value="replicate-sdxl">Stable Diffusion ($0.01 each)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>Selected Assets:</span>
                <span className="font-medium">{selectedAssets.size}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Est. Cost:</span>
                <span className="font-medium">${(selectedAssets.size * 0.04).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Est. Time:</span>
                <span className="font-medium">~{Math.ceil(selectedAssets.size * 45 / 60)} minutes</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkActions(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              // Handle bulk regeneration
              setShowBulkActions(false);
              clearSelection();
            }}>
              Regenerate All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

