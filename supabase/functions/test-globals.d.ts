// Type definitions for Jest test globals
declare namespace jest {
  interface Mock<T = any, Y extends any[] = any> extends Function {
    (...args: Y): T;
    mockReturnValue(value: T): this;
    mockResolvedValue(value: T): this;
    mockRejectedValue(value: any): this;
    mockReturnValueOnce(value: T): this;
    mockResolvedValueOnce(value: T): this;
    mockRejectedValueOnce(value: any): this;
    mockImplementation(fn: (...args: Y) => T): this;
    mockClear(): this;
    mockReset(): this;
  }

  function fn<T = any, Y extends any[] = any>(implementation?: (...args: Y) => T): Mock<T, Y>;
  function clearAllMocks(): void;
  function mock(moduleName: string, factory?: () => any): void;
}

declare function describe(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void | Promise<void>): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare namespace it {
  function skip(name: string, fn: () => void | Promise<void>): void;
}
declare function beforeEach(fn: () => void | Promise<void>): void;
declare function afterEach(fn: () => void | Promise<void>): void;
declare function beforeAll(fn: () => void | Promise<void>): void;
declare function afterAll(fn: () => void | Promise<void>): void;

declare namespace expect {
  interface Matchers<R> {
    toBe(expected: any): R;
    toEqual(expected: any): R;
    toBeDefined(): R;
    toBeUndefined(): R;
    toBeNull(): R;
    toBeTruthy(): R;
    toBeFalsy(): R;
    toContain(expected: any): R;
    toHaveLength(expected: number): R;
    toHaveBeenCalled(): R;
    toHaveBeenCalledWith(...args: any[]): R;
    toThrow(error?: string | RegExp): R;
    toMatchObject(expected: any): R;
    toBeGreaterThan(expected: number): R;
    toBeGreaterThanOrEqual(expected: number): R;
    toBeLessThan(expected: number): R;
    toBeLessThanOrEqual(expected: number): R;
    toMatch(pattern: string | RegExp): R;
    toBeCloseTo(expected: number, precision?: number): R;
    not: Matchers<R>;
  }

  interface Expect {
    <T = any>(actual: T): Matchers<T>;
    stringContaining(expected: string): any;
    objectContaining(expected: any): any;
    arrayContaining(expected: any[]): any;
    any(constructor: any): any;
    anything(): any;
  }
}

declare const expect: expect.Expect;
