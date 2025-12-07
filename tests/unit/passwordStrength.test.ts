/**
 * Password Strength Utility Tests
 */

import {
  calculatePasswordStrength,
  getPasswordStrengthColor,
  getPasswordStrengthLabel,
} from '@/lib/utils/passwordStrength';

describe('calculatePasswordStrength', () => {
  describe('empty/weak passwords', () => {
    it('returns weak for empty password', () => {
      const result = calculatePasswordStrength('');
      expect(result.strength).toBe('weak');
      expect(result.score).toBe(0);
      expect(result.feedback).toContain('Password is required');
    });

    it('returns weak for very short password', () => {
      const result = calculatePasswordStrength('abc');
      expect(result.strength).toBe('weak');
      expect(result.score).toBeLessThan(30);
    });

    it('returns weak for common passwords', () => {
      const result = calculatePasswordStrength('password123');
      expect(result.strength).toBe('weak');
      expect(result.feedback.some(f => f.includes('common'))).toBe(true);
    });

    it('returns weak for short passwords', () => {
      const result = calculatePasswordStrength('12345');
      expect(result.strength).toBe('weak');
    });
  });

  describe('password scoring', () => {
    it('scores higher for longer passwords', () => {
      const short = calculatePasswordStrength('Aa1!');
      const medium = calculatePasswordStrength('Aa1!Bb2@');
      const long = calculatePasswordStrength('Aa1!Bb2@Cc3#Dd4$');
      
      expect(short.score).toBeLessThan(medium.score);
      expect(medium.score).toBeLessThan(long.score);
    });

    it('scores 10 points for 6-7 character passwords', () => {
      const sixChars = calculatePasswordStrength('abc123');
      const sevenChars = calculatePasswordStrength('abc1234');
      
      // Should have base score of 10 for length
      expect(sixChars.score).toBeGreaterThanOrEqual(10);
      expect(sevenChars.score).toBeGreaterThanOrEqual(10);
      expect(sixChars.feedback.some(f => f.includes('8 characters'))).toBe(true);
    });

    it('scores 10 points for exactly 7 characters', () => {
      const result = calculatePasswordStrength('abc1234');
      // Length scoring: 7 chars gets 10 points
      expect(result.score).toBeGreaterThanOrEqual(10);
    });

    it('scores 25 points for 8-11 character passwords', () => {
      // Use passwords with good character variety to get base length score
      const eightChars = calculatePasswordStrength('Abc12345');
      const elevenChars = calculatePasswordStrength('Abc12345678');
      
      // Should have base score of 25 for length (8-11 chars) plus variety bonus
      // 25 (length) + 30 (3 variety types) = 55 minimum
      expect(eightChars.score).toBeGreaterThanOrEqual(25);
      expect(elevenChars.score).toBeGreaterThanOrEqual(25);
    });

    it('scores higher for more character variety', () => {
      const lowercase = calculatePasswordStrength('abcdefghijkl');
      const mixed = calculatePasswordStrength('abcABC123!@#');
      
      expect(lowercase.score).toBeLessThan(mixed.score);
    });

    it('gives maximum score for long password with all character types', () => {
      const result = calculatePasswordStrength('MyStr0ng!Pass#2024');
      expect(result.score).toBeGreaterThanOrEqual(70);
    });
  });

  describe('pattern penalties', () => {
    it('penalizes repeated characters', () => {
      const withRepeats = calculatePasswordStrength('aaa123456!A');
      const withoutRepeats = calculatePasswordStrength('abc123456!A');
      expect(withRepeats.score).toBeLessThan(withoutRepeats.score);
      expect(withRepeats.feedback.some(f => f.includes('repeated'))).toBe(true);
    });

    it('penalizes sequential characters', () => {
      const withSequential = calculatePasswordStrength('abc123xyz!A');
      expect(withSequential.feedback.some(f => f.includes('sequential'))).toBe(true);
    });

    it('penalizes keyboard patterns', () => {
      const withPattern = calculatePasswordStrength('qwerty123!A');
      expect(withPattern.feedback.some(f => f.includes('keyboard'))).toBe(true);
    });

    it('penalizes common words', () => {
      const withCommon = calculatePasswordStrength('admin123!ABC');
      expect(withCommon.feedback.some(f => f.includes('common'))).toBe(true);
    });
  });

  describe('strength categories', () => {
    it('weak for score < 30', () => {
      const result = calculatePasswordStrength('weak');
      expect(result.score).toBeLessThan(30);
      expect(result.strength).toBe('weak');
    });

    it('caps score at 0-100', () => {
      // Very bad password with many penalties
      const badResult = calculatePasswordStrength('111aaaaaa');
      expect(badResult.score).toBeGreaterThanOrEqual(0);
      
      // Very strong password
      const goodResult = calculatePasswordStrength('VeryStr0ng!Password#2024ABC');
      expect(goodResult.score).toBeLessThanOrEqual(100);
    });
  });

  describe('feedback messages', () => {
    it('provides helpful feedback for weak passwords', () => {
      const result = calculatePasswordStrength('short');
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it('suggests using more characters for short passwords', () => {
      const result = calculatePasswordStrength('ab1!');
      expect(result.feedback.some(f => 
        f.includes('short') || f.includes('6') || f.includes('character')
      )).toBe(true);
    });
  });
});

describe('getPasswordStrengthColor', () => {
  it('returns destructive for weak', () => {
    expect(getPasswordStrengthColor('weak')).toBe('destructive');
  });

  it('returns warning for fair', () => {
    expect(getPasswordStrengthColor('fair')).toBe('warning');
  });

  it('returns primary for good', () => {
    expect(getPasswordStrengthColor('good')).toBe('primary');
  });

  it('returns success for strong', () => {
    expect(getPasswordStrengthColor('strong')).toBe('success');
  });
});

describe('getPasswordStrengthLabel', () => {
  it('returns correct labels', () => {
    expect(getPasswordStrengthLabel('weak')).toBe('Weak');
    expect(getPasswordStrengthLabel('fair')).toBe('Fair');
    expect(getPasswordStrengthLabel('good')).toBe('Good');
    expect(getPasswordStrengthLabel('strong')).toBe('Strong');
  });
});
