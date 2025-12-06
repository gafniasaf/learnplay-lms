/**
 * Telemetry and Event Tracking
 * 
 * Centralized event tracking for analytics and monitoring
 */

import * as Sentry from '@sentry/react';

export type TelemetryEvent =
  | 'tag.created'
  | 'tag.updated'
  | 'tag.deleted'
  | 'tag.approved'
  | 'tag.rejected'
  | 'course.published'
  | 'course.restored'
  | 'variant.switched'
  | 'search.media'
  | 'search.content'
  | 'filter.applied'
  | 'course.loaded'
  | 'editor.opened';

interface TelemetryData {
  [key: string]: any;
}

/**
 * Track an event with Sentry breadcrumb
 */
export function trackEvent(event: TelemetryEvent, data?: TelemetryData) {
  // Add breadcrumb to Sentry
  Sentry.addBreadcrumb({
    category: event.split('.')[0],
    message: event,
    level: 'info',
    data,
  });

  // Log to console in development
  if (import.meta.env.DEV) {
    console.log(`[Telemetry] ${event}`, data);
  }

  // TODO: Send to analytics platform (Google Analytics, Mixpanel, etc.)
  // Example:
  /*
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', event, data);
  }
  */
}

/**
 * Track tag operations
 */
export const tagTelemetry = {
  created: (tagType: string, tagValue: string) =>
    trackEvent('tag.created', { tagType, tagValue }),

  updated: (tagId: string, updates: any) =>
    trackEvent('tag.updated', { tagId, updates }),

  deleted: (tagId: string) =>
    trackEvent('tag.deleted', { tagId }),

  approved: (courseId: string, tagCount: number) =>
    trackEvent('tag.approved', { courseId, tagCount }),

  rejected: (courseId: string) =>
    trackEvent('tag.rejected', { courseId }),
};

/**
 * Track course operations
 */
export const courseTelemetry = {
  published: (courseId: string, version: number, changelog?: string) =>
    trackEvent('course.published', { courseId, version, changelog }),

  restored: (courseId: string, fromVersion: number, toVersion: number) =>
    trackEvent('course.restored', { courseId, fromVersion, toVersion }),

  loaded: (courseId: string, loadTime: number) =>
    trackEvent('course.loaded', { courseId, loadTime }),
};

/**
 * Track variant operations
 */
export const variantTelemetry = {
  switched: (courseId: string, fromLevel: string, toLevel: string) =>
    trackEvent('variant.switched', { courseId, fromLevel, toLevel }),
};

/**
 * Track search operations
 */
export const searchTelemetry = {
  media: (query: string, resultsCount: number, duration: number) =>
    trackEvent('search.media', { query, resultsCount, duration }),

  content: (query: string, resultsCount: number, duration: number) =>
    trackEvent('search.content', { query, resultsCount, duration }),
};

/**
 * Track filter operations
 */
export const filterTelemetry = {
  applied: (filterType: string, filterValue: any, resultsCount: number) =>
    trackEvent('filter.applied', { filterType, filterValue, resultsCount }),
};

/**
 * Track editor operations
 */
export const editorTelemetry = {
  opened: (courseId: string) =>
    trackEvent('editor.opened', { courseId }),
};

/**
 * Track performance metrics
 */
export function trackPerformance(metric: string, value: number, unit: string = 'ms') {
  // Send to Sentry as a tag (metrics.set not available in current version)
  Sentry.setTag(metric, value);

  if (import.meta.env.DEV) {
    console.log(`[Performance] ${metric}: ${value}${unit}`);
  }
}

