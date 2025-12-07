/**
 * Tests for HTML sanitization utility
 * Security-critical: Prevents XSS attacks
 */

import { sanitizeHtml } from '@/lib/utils/sanitizeHtml';

describe('sanitizeHtml', () => {
  it('allows safe HTML tags', () => {
    const safeHtml = '<p>Hello <strong>world</strong></p>';
    const result = sanitizeHtml(safeHtml);
    expect(result).toContain('<p>');
    expect(result).toContain('<strong>');
    expect(result).toContain('Hello');
    expect(result).toContain('world');
  });

  it('removes script tags', () => {
    const maliciousHtml = '<p>Safe</p><script>alert("XSS")</script>';
    const result = sanitizeHtml(maliciousHtml);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
    expect(result).toContain('<p>Safe</p>');
  });

  it('removes inline event handlers', () => {
    const maliciousHtml = '<p onclick="alert(\'XSS\')">Click me</p>';
    const result = sanitizeHtml(maliciousHtml);
    expect(result).not.toContain('onclick');
    expect(result).toContain('<p>');
    expect(result).toContain('Click me');
  });

  it('allows allowed attributes', () => {
    const html = '<a href="https://example.com" title="Link">Link</a>';
    const result = sanitizeHtml(html);
    expect(result).toContain('href');
    expect(result).toContain('title');
    expect(result).toContain('https://example.com');
  });

  it('removes disallowed attributes', () => {
    const html = '<p style="color: red" onclick="alert(1)">Text</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('style');
    expect(result).not.toContain('onclick');
    expect(result).toContain('<p>');
    expect(result).toContain('Text');
  });

  it('handles non-string input', () => {
    expect(sanitizeHtml(null as any)).toBe('');
    expect(sanitizeHtml(undefined as any)).toBe('');
    expect(sanitizeHtml(123 as any)).toBe('123');
    expect(sanitizeHtml({} as any)).toBe('[object Object]');
  });

  it('handles empty strings', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('preserves allowed tags: h1-h6, p, br, strong, em, ul, ol, li, a, img', () => {
    const html = `
      <h1>Heading 1</h1>
      <h2>Heading 2</h2>
      <p>Paragraph with <strong>bold</strong> and <em>italic</em></p>
      <ul><li>Item 1</li><li>Item 2</li></ul>
      <ol><li>Ordered 1</li></ol>
      <a href="/link">Link</a>
      <img src="/image.jpg" alt="Image" />
      <br />
    `;
    const result = sanitizeHtml(html);
    expect(result).toContain('<h1>');
    expect(result).toContain('<h2>');
    expect(result).toContain('<p>');
    expect(result).toContain('<strong>');
    expect(result).toContain('<em>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
    expect(result).toContain('<ol>');
    expect(result).toContain('<a');
    expect(result).toContain('<img');
    expect(result).toContain('<br');
  });

  it('removes dangerous tags like iframe, object, embed', () => {
    const html = '<p>Safe</p><iframe src="evil.com"></iframe><object></object>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<object');
    expect(result).toContain('<p>Safe</p>');
  });

  it('handles nested malicious content', () => {
    const html = '<p>Safe <script>alert(1)</script> content</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('<script>');
    expect(result).toContain('Safe');
    expect(result).toContain('content');
  });

  it('preserves text content even when tags are removed', () => {
    const html = '<script>alert("XSS")</script>Important text';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('<script>');
    expect(result).toContain('Important text');
  });

  it('handles very long strings', () => {
    const longString = '<p>' + 'a'.repeat(10000) + '</p>';
    const result = sanitizeHtml(longString);
    expect(result).toContain('<p>');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles malformed HTML gracefully', () => {
    const malformed = '<p>Unclosed tag<div>Nested</p>';
    const result = sanitizeHtml(malformed);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

