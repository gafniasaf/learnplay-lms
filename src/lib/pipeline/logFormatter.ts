// Log Formatter
// Formats job_events for display in live logs and activity feed

export interface LogEntry {
  timestamp: string;
  message: string;
  icon: string;
  color: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'ai' | 'repair';
}

export function formatLogEntry(event: {
  created_at: string;
  status?: string;
  step?: string;
  message?: string;
  progress?: number;
}): LogEntry {
  const timestamp = new Date(event.created_at).toTimeString().slice(0, 8);
  const type = getLogType(event.status || 'info');
  const icon = getLogIcon(type);
  const color = getLogColor(type);
  
  let message = event.message || '';
  if (!message) {
    message = `${event.step}: ${event.status}`;
  }
  
  return {
    timestamp,
    message,
    icon,
    color,
    type
  };
}

export function getLogType(status: string): LogEntry['type'] {
  const statusLower = status.toLowerCase();
  
  if (statusLower.includes('error') || statusLower === 'failed') return 'error';
  if (statusLower.includes('warn')) return 'warning';
  if (statusLower.includes('repair')) return 'repair';
  if (statusLower.includes('ai') || statusLower.includes('generat')) return 'ai';
  if (statusLower === 'done' || statusLower === 'complete') return 'success';
  
  return 'info';
}

export function getLogIcon(type: LogEntry['type']): string {
  switch (type) {
    case 'success': return '✅';
    case 'error': return '🔴';
    case 'warning': return '⚠️';
    case 'ai': return '🤖';
    case 'repair': return '🔧';
    case 'info': default: return '📊';
  }
}

export function getLogColor(type: LogEntry['type']): string {
  switch (type) {
    case 'success': return 'text-green-400';
    case 'error': return 'text-red-400';
    case 'warning': return 'text-yellow-400';
    case 'ai': return 'text-blue-400';
    case 'repair': return 'text-orange-400';
    case 'info': default: return 'text-gray-400';
  }
}
