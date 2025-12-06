import { useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';

export type StudentRange = 'day' | 'week' | 'month';

export interface StudentRangeWindow {
  startDate: Date;
  endDate: Date;
}

export interface UseStudentRangeResult {
  range: StudentRange;
  setRange: (range: StudentRange) => void;
  window: StudentRangeWindow;
}

export function useStudentRange(): UseStudentRangeResult {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const range: StudentRange = (searchParams.get('range') as StudentRange) || 'week';
  
  const setRange = (newRange: StudentRange) => {
    setSearchParams({ range: newRange });
  };
  
  const window = useMemo((): StudentRangeWindow => {
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
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate.setDate(startDate.getDate() - diff);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
    }
    
    return { startDate, endDate };
  }, [range]);
  
  return { range, setRange, window };
}

