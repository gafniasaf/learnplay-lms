import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface JobFiltersProps {
  onStatusChange?: (status: string | null) => void;
  onSearchChange?: (query: string) => void;
  onClearFilters?: () => void;
  selectedStatus?: string | null;
  searchQuery?: string;
}

export function JobFilters({
  onStatusChange,
  onSearchChange,
  onClearFilters,
  selectedStatus,
  searchQuery = '',
}: JobFiltersProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const handleSearch = (value: string) => {
    setLocalSearch(value);
    onSearchChange?.(value);
  };

  const hasActiveFilters = selectedStatus || localSearch;

  return (
    <div className="flex items-center gap-3 p-4 bg-background border-b">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search jobs by ID, subject, or course..."
          value={localSearch}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Status Filter */}
      <Select value={selectedStatus || 'all'} onValueChange={(value) => {
        onStatusChange?.(value === 'all' ? null : value);
      }}>
        <SelectTrigger className="w-[140px]">
          <Filter className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="pending">Queued</SelectItem>
          <SelectItem value="processing">Running</SelectItem>
          <SelectItem value="done">Completed</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setLocalSearch('');
            onClearFilters?.();
          }}
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}

      {/* Active Filter Badges */}
      {selectedStatus && (
        <Badge variant="secondary" className="gap-1">
          Status: {selectedStatus}
          <button
            onClick={() => onStatusChange?.(null)}
            className="ml-1 hover:bg-muted rounded-full p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
    </div>
  );
}

