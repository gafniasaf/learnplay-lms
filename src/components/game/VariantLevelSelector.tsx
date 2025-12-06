/**
 * VariantLevelSelector Component
 * 
 * Dropdown to select difficulty variant level (beginner/intermediate/advanced/expert)
 * Only shown if course has variants.exposeToUsers = true
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { VariantLevel } from '@/lib/types/courseVNext';

interface VariantLevelSelectorProps {
  selectedLevel: VariantLevel;
  availableLevels: Array<{
    id: VariantLevel;
    label: string;
    order: number;
  }>;
  onLevelChange: (level: VariantLevel) => void;
  className?: string;
}

export function VariantLevelSelector({
  selectedLevel,
  availableLevels,
  onLevelChange,
  className = '',
}: VariantLevelSelectorProps) {
  const sortedLevels = [...availableLevels].sort((a, b) => a.order - b.order);

  return (
    <Select value={selectedLevel} onValueChange={(value) => onLevelChange(value as VariantLevel)}>
      <SelectTrigger className={`w-[180px] ${className}`} aria-label="Select difficulty level">
        <SelectValue placeholder="Select difficulty" />
      </SelectTrigger>
      <SelectContent>
        {sortedLevels.map((level) => (
          <SelectItem key={level.id} value={level.id}>
            {level.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

