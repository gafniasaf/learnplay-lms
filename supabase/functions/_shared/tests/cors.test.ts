import { stdHeaders, withCors } from '../../_shared/cors.ts';

const OriginalRequest = globalThis.Request;
const OriginalResponse = globalThis.Response;
const OriginalHeaders = globalThis.Headers;

class MockHeaders {
  private map = new Map<string, string>();

  constructor(init?: Record<string, string>) {
    if (init) {
      Object.entries(init).forEach(([key, value]) => {
        this.set(key, value);
      });
    }
  }

  set(key: string, value: string) {
    this.map.set(key.toLowerCase(), value);
  }

  get(key: string) {
    return this.map.get(key.toLowerCase()) ?? null;
  }

  forEach(callback: (value: string, key: string) => void) {
    this.map.forEach((value, key) => callback(value, key));
  }

  toObject(): Record<string, string> {
    const result: Record<string, string> = {};
    this.map.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}

class MockResponse {
  public status: number;
  public statusText: string;
  public headers: MockHeaders;
  private bodyText: string;

  constructor(body?: any, init: { status?: number; statusText?: string; headers?: Record<string, string> } = {}) {
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? '';
    this.headers = new MockHeaders(init.headers);
    this.bodyText = typeof body === 'string' ? body : body ? JSON.stringify(body) : '';
  }

  clone() {
    return new MockResponse(this.bodyText, {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers.toObject(),
    });
  }

  get body() {
    return this.bodyText;
  }
}

class MockRequest {
  public headers: MockHeaders;
  public method: string;
  public url: string;

  constructor(url: string, init: { method?: string; headers?: Record<string, string> } = {}) {
    this.url = url;
    this.method = init.method ?? 'GET';
    this.headers = new MockHeaders(init.headers);
  }
}

beforeAll(() => {
  (globalThis as any).Headers = MockHeaders;
  (globalThis as any).Response = MockResponse;
  (globalThis as any).Request = MockRequest;
});

afterAll(() => {
  (globalThis as any).Headers = OriginalHeaders;
  (globalThis as any).Response = OriginalResponse;
  (globalThis as any).Request = OriginalRequest;
});

describe('CORS header utilities', () => {
  test('stdHeaders returns exactly one Access-Control-Allow-Origin entry', () => {
    const req = new Request('https://api.example.com/list', {
      headers: { origin: 'https://teacher.example.com' },
    });

    const headers = stdHeaders(req);
    const allowOriginEntries = Object.entries(headers).filter(([key]) => key.toLowerCase() === 'access-control-allow-origin');

    expect(allowOriginEntries).toHaveLength(1);
    expect(allowOriginEntries[0]?.[1]).toBe('https://teacher.example.com');
  });

  test('withCors strips duplicate Access-Control-Allow-Origin headers from handler responses', async () => {
    const handler = withCors(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': 'https://duplicate-one.example',
          'access-control-allow-origin': 'https://duplicate-two.example',
          'Content-Type': 'application/json',
        },
      });
    });

    const req = new Request('https://api.example.com/list', {
      headers: { origin: 'https://teacher.example.com' },
    });

    const response = await handler(req);
    const capturedValues: string[] = [];
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'access-control-allow-origin') {
        capturedValues.push(value);
      }
    });

    expect(capturedValues).toHaveLength(1);
    expect(capturedValues[0]).toBe('https://teacher.example.com');
  });
});


