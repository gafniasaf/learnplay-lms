/**
 * Structured logging utility with environment-aware verbosity
 * Replaces ad-hoc console.log statements with consistent, filterable logging
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  component?: string;
  action?: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

class Logger {
  private isDevelopment: boolean;
  private minLevel: LogLevel;

  constructor() {
    this.isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
    this.minLevel = this.isDevelopment ? 'debug' : 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const component = context?.component ? `[${context.component}]` : '';
    const action = context?.action ? `[${context.action}]` : '';
    return `${timestamp} ${level.toUpperCase()} ${component}${action} ${message}`;
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, context);
    const contextData = context ? { ...context } : undefined;

    switch (level) {
      case 'debug':
        console.debug(formattedMessage, contextData);
        break;
      case 'info':
        console.info(formattedMessage, contextData);
        break;
      case 'warn':
        console.warn(formattedMessage, contextData);
        break;
      case 'error':
        console.error(formattedMessage, contextData, error);
        // Optionally send to Sentry (async, don't await)
        if (typeof window !== 'undefined' && (window as WindowWithOptionalSentry).Sentry && error) {
          import('./sentry')
            .then(({ captureError }) => {
              captureError(error, context);
            })
            .catch(() => {
              // Silently fail if Sentry import fails
            });
        }
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log('error', message, context, error);
  }

  /**
   * Create a child logger with default context
   */
  child(defaultContext: LogContext): Logger {
    const childLogger = new Logger();
    const originalLog = childLogger.log.bind(childLogger);
    
    childLogger.log = (level: LogLevel, message: string, context?: LogContext, error?: Error) => {
      const mergedContext = { ...defaultContext, ...context };
      originalLog(level, message, mergedContext, error);
    };
    
    return childLogger;
  }
}

interface WindowWithOptionalSentry extends Window {
  Sentry?: unknown;
}

// Export singleton instance
export const logger = new Logger();

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string): Logger {
  return logger.child({ component });
}

