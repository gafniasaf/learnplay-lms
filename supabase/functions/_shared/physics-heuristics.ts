interface CourseItem {
  text?: string;
  options?: Array<string | number>;
  correctIndex?: number;
}

interface CoursePayload {
  items?: CourseItem[];
}

const SPEED_OF_LIGHT_FALLBACK = 3e8;

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[^\d.\-]/g, '');
  if (cleaned.trim() === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDistance(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kilo)?meters?/i);
  if (!match) return null;
  const value = Number(match[1]);
  return match[2] ? value * 1_000 : value;
}

function parseTime(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(nano|micro|milli)?seconds?/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  switch (unit) {
    case 'nano':
      return value * 1e-9;
    case 'micro':
      return value * 1e-6;
    case 'milli':
      return value * 1e-3;
    default:
      return value;
  }
}

function parseSpeedOfLight(text: string): number {
  const match = text.match(/Speed of light\s*=\s*(\d+(?:\.\d+)?)(?:\s*×\s*10\^(\d+))?/i);
  if (!match) return SPEED_OF_LIGHT_FALLBACK;

  const base = Number(match[1]);
  const exponent = match[2] ? Number(match[2]) : 0;
  return base * Math.pow(10, exponent);
}

function computeExpectedRatio(distance: number, time: number, speed: number): number {
  if (time === 0 || speed === 0) {
    throw new PhysicsValidationError('Invalid physics parameters: divide by zero');
  }
  const ratio = (distance / time) / speed;
  return Math.round(ratio);
}

export class PhysicsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhysicsValidationError';
  }
}

export function validatePhysicsConsistency(course: CoursePayload): void {
  if (!course.items || !Array.isArray(course.items)) return;

  course.items.forEach((item, index) => {
    if (!item.text || typeof item.text !== 'string') return;

    const text = item.text.toLowerCase();
    if (!text.includes('faster than light')) return;

    const distance = parseDistance(item.text);
    const time = parseTime(item.text);
    const speedOfLight = parseSpeedOfLight(item.text);

    if (distance === null || time === null || !item.options || item.correctIndex === undefined) {
      return;
    }

    const expected = computeExpectedRatio(distance, time, speedOfLight);
    const optionNumbers = item.options.map(opt => (typeof opt === 'number' ? opt : parseNumber(opt ?? '')));

    const expectedIndex = optionNumbers.findIndex(opt => opt !== null && Math.round(opt) === expected);

    if (expectedIndex === -1) {
      throw new PhysicsValidationError(
        `Physics validation failed for item ${index}: expected answer ${expected} not present in options`
      );
    }

    if (expectedIndex !== item.correctIndex) {
      const actualValue = optionNumbers[item.correctIndex];
      throw new PhysicsValidationError(
        `Physics validation failed for item ${index}: expected answer ${expected} but found ${actualValue ?? 'unknown'}`
      );
    }
  });
}

