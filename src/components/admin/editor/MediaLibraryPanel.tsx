import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { searchMedia, type MediaAsset } from '@/lib/api/searchMedia';
import { Loader2, Search } from 'lucide-react';

interface MediaLibraryPanelProps {
  onSelect: (assets: MediaAsset[]) => void;
}

type FilterType = 'all' | 'images' | 'audio' | 'video';
type Mode = 'search' | 'generated';

export const MediaLibraryPanel = ({ onSelect }: MediaLibraryPanelProps) => {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [results, setResults] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('search');

  const handleSearch = async () => {
    if (!query.trim()) return;

    try {
      setLoading(true);
      
      const mimeTypeFilter = activeFilter === 'images' ? 'image/%'
                           : activeFilter === 'audio' ? 'audio/%'
                           : activeFilter === 'video' ? 'video/%'
                           : undefined;

      const response = await searchMedia({
        query,
        filters: mimeTypeFilter ? { mimeType: mimeTypeFilter } : undefined,
        limit: 20,
      });

      setResults(response.results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAssetSelection = (assetId: string) => {
    const newSelected = new Set(selectedAssets);
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId);
    } else {
      newSelected.add(assetId);
    }
    setSelectedAssets(newSelected);
  };

  const handleInsertSelected = () => {
    const assetsToInsert = results.filter(asset => selectedAssets.has(asset.id));
    onSelect(assetsToInsert);
    setSelectedAssets(new Set());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const loadGenerated = async () => {
    try {
      setLoading(true);
      setSelectedAssets(new Set());
      const url = `/functions/v1/list-jobs?jobType=image&status=done&limit=20`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to list media jobs');
      }
      const rows = Array.isArray(json?.jobs) ? json.jobs : (Array.isArray(json?.data) ? json.data : []);
      const assets: MediaAsset[] = [];
      for (const row of rows) {
        const attachments = row?.result?.attachments || row?.payload?.attachments || [];
        for (let i = 0; i < attachments.length; i++) {
          const a = attachments[i];
          const imageUrl = a?.imageUrl || a?.url;
          if (!imageUrl) continue;
          assets.push({
            id: `${row.id}-${i}`,
            url: imageUrl,
            mimeType: 'image/*',
            alt: a?.alt || 'Generated image',
            tags: [],
            similarity: 1,
          });
        }
      }
      setResults(assets);
    } catch (error) {
      console.error('Load generated failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'generated') {
      loadGenerated();
    }
     
  }, [mode]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
              Media Library
            </h3>
            <div className="flex gap-1">
              <button
                className={`px-2 py-0.5 rounded text-xs border ${mode === 'search' ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground border-gray-200'}`}
                onClick={() => setMode('search')}
              >
                Search
              </button>
              <button
                className={`px-2 py-0.5 rounded text-xs border ${mode === 'generated' ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground border-gray-200'}`}
                onClick={() => setMode('generated')}
              >
                Generated
              </button>
            </div>
          </div>
          {mode === 'search' ? (
            <span className="px-2 py-0.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded text-xs font-semibold">
              Semantic
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={loadGenerated} disabled={loading}>
              Refresh
            </Button>
          )}
        </div>

        {mode === 'search' && (
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Search media by keywords… (semantic)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>
        )}

        {mode === 'search' && (
          <div className="flex gap-2 flex-wrap">
            {(['all', 'images', 'audio', 'video'] as FilterType[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`
                  px-2 py-1 rounded-full text-Solution border transition-colors
                  ${activeFilter === filter
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }
                `}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {!loading && results.length === 0 && query && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No results found
            </div>
          )}

          {!loading && results.length === 0 && !query && mode === 'search' && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Enter a search query to find media
            </div>
          )}

          {!loading && results.length === 0 && mode === 'generated' && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No generated media yet
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {results.map((asset) => {
                const isSelected = selectedAssets.has(asset.id);
                
                return (
                  <div
                    key={asset.id}
                    onClick={() => toggleAssetSelection(asset.id)}
                    className={`
                      border rounded-lg p-2 cursor-pointer transition-all
                      ${isSelected 
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                        : 'border-gray-200 hover:border-primary hover:bg-primary/5'
                      }
                    `}
                  >
                    {asset.mimeType.startsWith('image/') && (
                      <div className="aspect-video bg-gray-100 rounded mb-2 overflow-hidden">
                        <img
                          src={asset.url}
                          alt={asset.alt || 'Media asset'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    {asset.mimeType.startsWith('audio/') && (
                      <div className="aspect-video bg-gray-100 rounded mb-2 flex items-center justify-center">
                        <span className="text-3xl">🔊</span>
                      </div>
                    )}
                    {asset.mimeType.startsWith('video/') && (
                      <div className="aspect-video bg-gray-100 rounded mb-2 flex items-center justify-center">
                        <span className="text-3xl">🎥</span>
                      </div>
                    )}
                    <div className="text-xs text-center text-muted-foreground truncate">
                      {asset.alt || 'Media'}
                    </div>
                    <div className="text-Solution text-center text-gray-400 mt-1">
                      {Math.round(asset.similarity * 100)}% match
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {selectedAssets.size > 0 && (
        <div className="p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleInsertSelected}>
              Insert Selected ({selectedAssets.size})
            </Button>
            <Button variant="outline" onClick={() => setSelectedAssets(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

