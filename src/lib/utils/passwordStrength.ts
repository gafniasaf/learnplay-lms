/**
 * Password Strength Utility
 * Evaluates password strength without external dependencies
 */

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number; // 0-100
  feedback: string[];
}

/**
 * Calculate password strength
 * Based on length, character variety, common patterns
 */
export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return { strength: 'weak', score: 0, feedback: ['Password is required'] };
  }

  let score = 0;
  const feedback: string[] = [];

  // Length scoring (0-40 points)
  const length = password.length;
  if (length < 6) {
    score += 0;
    feedback.push('Password too short (minimum 6 characters)');
  } else if (length < 8) {
    score += 10;
    feedback.push('Use at least 8 characters for better security');
  } else if (length < 12) {
    score += 25;
  } else if (length < 16) {
    score += 35;
  } else {
    score += 40;
  }

  // Character variety (0-40 points)
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[^a-zA-Z0-9]/.test(password);

  const varietyCount = [hasLowercase, hasUppercase, hasNumbers, hasSpecialChars].filter(Boolean).length;
  
  if (varietyCount === 1) {
    score += 5;
    feedback.push('Add uppercase, numbers, and symbols');
  } else if (varietyCount === 2) {
    score += 15;
    feedback.push('Add numbers and symbols for stronger password');
  } else if (varietyCount === 3) {
    score += 30;
    feedback.push('Add symbols for even stronger password');
  } else if (varietyCount === 4) {
    score += 40;
  }

  // Pattern penalties (0-20 points bonus/penalty)
  const hasCommonPatterns = /(.)\1{2,}/.test(password); // Repeated characters (aaa, 111)
  const hasSequential = /(abc|bcd|cde|def|123|234|345|456|567|678|789)/.test(password.toLowerCase());
  const hasKeyboardPatterns = /(qwerty|asdfgh|zxcvbn)/.test(password.toLowerCase());

  if (hasCommonPatterns) {
    score -= 10;
    feedback.push('Avoid repeated characters');
  }
  
  if (hasSequential) {
    score -= 10;
    feedback.push('Avoid sequential characters');
  }

  if (hasKeyboardPatterns) {
    score -= 10;
    feedback.push('Avoid keyboard patterns');
  }

  // Common words penalty
  const commonWords = ['password', 'admin', 'user', 'login', '12345', 'qwerty'];
  const lowerPassword = password.toLowerCase();
  const hasCommonWord = commonWords.some(word => lowerPassword.includes(word));
  
  if (hasCommonWord) {
    score -= 20;
    feedback.push('Avoid common words and patterns');
  }

  // No penalties - add bonus for good password
  if (feedback.length === 0 && score >= 60) {
    feedback.push('Strong password!');
  }

  // Cap score at 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine strength category
  let strength: PasswordStrength;
  if (score < 30) {
    strength = 'weak';
  } else if (score < 60) {
    strength = 'fair';
  } else if (score < 80) {
    strength = 'good';
  } else {
    strength = 'strong';
  }

  return { strength, score, feedback };
}

/**
 * Get color for password strength (for UI)
 */
export function getPasswordStrengthColor(strength: PasswordStrength): string {
  switch (strength) {
    case 'weak':
      return 'destructive';
    case 'fair':
      return 'warning';
    case 'good':
      return 'primary';
    case 'strong':
      return 'success';
  }
}

/**
 * Get label for password strength
 */
export function getPasswordStrengthLabel(strength: PasswordStrength): string {
  switch (strength) {
    case 'weak':
      return 'Weak';
    case 'fair':
      return 'Fair';
    case 'good':
      return 'Good';
    case 'strong':
      return 'Strong';
  }
}

