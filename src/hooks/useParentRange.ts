import { useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';

export type ParentRange = 'day' | 'week' | 'month';

export interface ParentRangeWindow {
  startDate: Date;
  endDate: Date;
}

export interface UseParentRangeResult {
  range: ParentRange;
  setRange: (range: ParentRange) => void;
  window: ParentRangeWindow;
}

export function useParentRange(): UseParentRangeResult {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const range: ParentRange = (searchParams.get('range') as ParentRange) || 'week';
  
  const setRange = (newRange: ParentRange) => {
    setSearchParams({ range: newRange });
  };
  
  const window = useMemo((): ParentRangeWindow => {
    const now = new Date();
    const endDate = new Date(now);
    let startDate: Date;
    
    switch (range) {
      case 'day': {
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'month': {
        startDate = new Date(now);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'week':
      default: {
        startDate = new Date(now);
        const dayOfWeek = startDate.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
        startDate.setDate(startDate.getDate() - diff);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
    }
    
    return { startDate, endDate };
  }, [range]);
  
  return { range, setRange, window };
}

