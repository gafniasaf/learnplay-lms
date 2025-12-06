import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useStudentRange } from './useStudentRange';
import { createElement } from 'react';

describe('useStudentRange', () => {
  it('defaults to week when no query param is present', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => 
      createElement(MemoryRouter, { initialEntries: ['/'] }, children);
    const { result } = renderHook(() => useStudentRange(), { wrapper });
    expect(result.current.range).toBe('week');
  });

  it('reads range from URL query param', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => 
      createElement(MemoryRouter, { initialEntries: ['/?range=day'] }, children);
    const { result } = renderHook(() => useStudentRange(), { wrapper });
    expect(result.current.range).toBe('day');
  });

  it('updates URL when setRange is called', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => 
      createElement(MemoryRouter, { initialEntries: ['/'] }, children);
    const { result } = renderHook(() => useStudentRange(), { wrapper });
    
    act(() => {
      result.current.setRange('month');
    });
    
    expect(result.current.range).toBe('month');
  });

  it('provides date window for each range', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => 
      createElement(MemoryRouter, { initialEntries: ['/'] }, children);
    const { result } = renderHook(() => useStudentRange(), { wrapper });
    
    const { startDate, endDate } = result.current.window;
    expect(startDate).toBeInstanceOf(Date);
    expect(endDate).toBeInstanceOf(Date);
    expect(endDate.getTime()).toBeGreaterThan(startDate.getTime());
  });
});

