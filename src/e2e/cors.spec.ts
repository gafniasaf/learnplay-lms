import { test, expect } from '@playwright/test';
import { withCors } from '../../supabase/functions/_shared/cors';

test.describe('CORS regression', () => {
  test('list-org-students returns a single Access-Control-Allow-Origin header', async () => {
    const handler = withCors(async () => {
      return new Response(JSON.stringify({ students: [] }), {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': 'https://duplicate-one.example',
          'access-control-allow-origin': 'https://duplicate-two.example',
          'Content-Type': 'application/json',
        },
      });
    });

    const request = new Request('https://api.example.com/functions/v1/list-org-students', {
      headers: {
        Origin: 'https://teacher.example.com',
        Authorization: 'Bearer test-token',
      },
    });

    const response = await handler(request);
    const allowOriginValues: string[] = [];
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'access-control-allow-origin') {
        allowOriginValues.push(value);
      }
    });

    expect(response.status).toBe(200);
    expect(allowOriginValues).toHaveLength(1);
    expect(allowOriginValues[0]).toBe('https://teacher.example.com');
  });
});


