type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function isDebugEnabled(): boolean {
  try {
    return String(import.meta.env?.VITE_DEBUG_UI) === 'true';
  } catch {
    return false;
  }
}

function log(level: LogLevel, ...args: unknown[]) {
  if (level === 'debug' && !isDebugEnabled()) return;
   
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](...args as []);
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
};
