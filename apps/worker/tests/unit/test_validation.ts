import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * Unit Tests for Validation Logic - T103
 *
 * Tests all validation functions across the application:
 * - Listing data validation
 * - Telegram auth validation
 * - Content filtering validation
 * - Input sanitization and boundaries
 */

describe('Listing Data Validation', () => {
  // Simulate the validateListingData method from ListingsAPI
  function validateListingData(data: any, isCreate = true): string[] {
    const errors: string[] = [];

    if (isCreate || data.title !== undefined) {
      if (!data.title || !data.title.trim()) {
        errors.push('Title is required');
      } else if (data.title.length > 100) {
        errors.push('Title must be 100 characters or less');
      }
    }

    if (isCreate || data.description !== undefined) {
      if (!data.description || !data.description.trim()) {
        errors.push('Description is required');
      } else if (data.description.length > 2000) {
        errors.push('Description must be 2000 characters or less');
      }
    }

    if (isCreate || data.priceUsd !== undefined) {
      if (typeof data.priceUsd !== 'number' || data.priceUsd < 0) {
        errors.push('Price must be a positive number');
      } else if (data.priceUsd > 1000000) {
        errors.push('Price cannot exceed $1,000,000');
      }
    }

    if (isCreate || data.categoryId !== undefined) {
      if (!Number.isInteger(data.categoryId) || data.categoryId <= 0) {
        errors.push('Valid category is required');
      }
    }

    if (data.images !== undefined) {
      if (!Array.isArray(data.images)) {
        errors.push('Images must be an array');
      } else if (data.images.length > 10) {
        errors.push('Maximum 10 images allowed');
      }
    }

    if (data.tags !== undefined) {
      if (!Array.isArray(data.tags)) {
        errors.push('Tags must be an array');
      } else if (data.tags.length > 20) {
        errors.push('Maximum 20 tags allowed');
      }
    }

    return errors;
  }

  describe('Create Listing Validation', () => {
    it('should pass with valid listing data', () => {
      const validData = {
        title: 'Test Listing',
        description: 'A test listing description',
        priceUsd: 99.99,
        categoryId: 1,
        images: ['image1.jpg', 'image2.jpg'],
        tags: ['electronics', 'gadgets']
      };

      const errors = validateListingData(validData, true);
      expect(errors).toHaveLength(0);
    });

    it('should require title for new listings', () => {
      const data = {
        description: 'A test listing description',
        priceUsd: 99.99,
        categoryId: 1
      };

      const errors = validateListingData(data, true);
      expect(errors).toContain('Title is required');
    });

    it('should require description for new listings', () => {
      const data = {
        title: 'Test Listing',
        priceUsd: 99.99,
        categoryId: 1
      };

      const errors = validateListingData(data, true);
      expect(errors).toContain('Description is required');
    });

    it('should require valid price for new listings', () => {
      const data = {
        title: 'Test Listing',
        description: 'Description',
        categoryId: 1
      };

      const errors = validateListingData(data, true);
      expect(errors).toContain('Price must be a positive number');
    });

    it('should require valid category for new listings', () => {
      const data = {
        title: 'Test Listing',
        description: 'Description',
        priceUsd: 99.99
      };

      const errors = validateListingData(data, true);
      expect(errors).toContain('Valid category is required');
    });
  });

  describe('Title Validation', () => {
    it('should reject empty title', () => {
      const data = { title: '' };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Title is required');
    });

    it('should reject whitespace-only title', () => {
      const data = { title: '   ' };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Title is required');
    });

    it('should reject title longer than 100 characters', () => {
      const data = { title: 'a'.repeat(101) };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Title must be 100 characters or less');
    });

    it('should accept title exactly 100 characters', () => {
      const data = {
        title: 'a'.repeat(100),
        description: 'Description',
        priceUsd: 99.99,
        categoryId: 1
      };
      const errors = validateListingData(data, true);
      expect(errors).not.toContain('Title must be 100 characters or less');
    });

    it('should accept valid title', () => {
      const data = {
        title: 'Valid Title',
        description: 'Description',
        priceUsd: 99.99,
        categoryId: 1
      };
      const errors = validateListingData(data, true);
      expect(errors).not.toContain('Title is required');
    });
  });

  describe('Description Validation', () => {
    it('should reject empty description', () => {
      const data = { description: '' };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Description is required');
    });

    it('should reject whitespace-only description', () => {
      const data = { description: '   ' };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Description is required');
    });

    it('should reject description longer than 2000 characters', () => {
      const data = { description: 'a'.repeat(2001) };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Description must be 2000 characters or less');
    });

    it('should accept description exactly 2000 characters', () => {
      const data = {
        title: 'Title',
        description: 'a'.repeat(2000),
        priceUsd: 99.99,
        categoryId: 1
      };
      const errors = validateListingData(data, true);
      expect(errors).not.toContain('Description must be 2000 characters or less');
    });
  });

  describe('Price Validation', () => {
    it('should reject negative price', () => {
      const data = { priceUsd: -1 };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Price must be a positive number');
    });

    it('should accept zero price', () => {
      const data = {
        title: 'Title',
        description: 'Description',
        priceUsd: 0,
        categoryId: 1
      };
      const errors = validateListingData(data, true);
      expect(errors).not.toContain('Price must be a positive number');
    });

    it('should reject price over 1 million', () => {
      const data = { priceUsd: 1000001 };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Price cannot exceed $1,000,000');
    });

    it('should accept price exactly 1 million', () => {
      const data = {
        title: 'Title',
        description: 'Description',
        priceUsd: 1000000,
        categoryId: 1
      };
      const errors = validateListingData(data, true);
      expect(errors).not.toContain('Price cannot exceed $1,000,000');
    });

    it('should reject non-number price', () => {
      const data = { priceUsd: '99.99' };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Price must be a positive number');
    });

    it('should reject NaN price', () => {
      const data = { priceUsd: NaN };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Price must be a positive number');
    });
  });

  describe('Category Validation', () => {
    it('should reject zero category', () => {
      const data = { categoryId: 0 };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Valid category is required');
    });

    it('should reject negative category', () => {
      const data = { categoryId: -1 };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Valid category is required');
    });

    it('should reject float category', () => {
      const data = { categoryId: 1.5 };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Valid category is required');
    });

    it('should accept positive integer category', () => {
      const data = {
        title: 'Title',
        description: 'Description',
        priceUsd: 99.99,
        categoryId: 1
      };
      const errors = validateListingData(data, true);
      expect(errors).not.toContain('Valid category is required');
    });
  });

  describe('Images Validation', () => {
    it('should reject non-array images', () => {
      const data = { images: 'not-an-array' };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Images must be an array');
    });

    it('should reject more than 10 images', () => {
      const data = { images: Array(11).fill('image.jpg') };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Maximum 10 images allowed');
    });

    it('should accept exactly 10 images', () => {
      const data = {
        title: 'Title',
        description: 'Description',
        priceUsd: 99.99,
        categoryId: 1,
        images: Array(10).fill('image.jpg')
      };
      const errors = validateListingData(data, true);
      expect(errors).not.toContain('Maximum 10 images allowed');
    });

    it('should accept empty array', () => {
      const data = {
        title: 'Title',
        description: 'Description',
        priceUsd: 99.99,
        categoryId: 1,
        images: []
      };
      const errors = validateListingData(data, true);
      expect(errors).not.toContain('Images must be an array');
    });
  });

  describe('Tags Validation', () => {
    it('should reject non-array tags', () => {
      const data = { tags: 'not-an-array' };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Tags must be an array');
    });

    it('should reject more than 20 tags', () => {
      const data = { tags: Array(21).fill('tag') };
      const errors = validateListingData(data, true);
      expect(errors).toContain('Maximum 20 tags allowed');
    });

    it('should accept exactly 20 tags', () => {
      const data = {
        title: 'Title',
        description: 'Description',
        priceUsd: 99.99,
        categoryId: 1,
        tags: Array(20).fill('tag')
      };
      const errors = validateListingData(data, true);
      expect(errors).not.toContain('Maximum 20 tags allowed');
    });
  });

  describe('Update Listing Validation', () => {
    it('should allow partial updates', () => {
      const data = { title: 'Updated Title' };
      const errors = validateListingData(data, false);
      expect(errors).toHaveLength(0);
    });

    it('should still validate provided fields', () => {
      const data = { title: 'a'.repeat(101) };
      const errors = validateListingData(data, false);
      expect(errors).toContain('Title must be 100 characters or less');
    });

    it('should not require missing fields for updates', () => {
      const data = { priceUsd: 150.00 };
      const errors = validateListingData(data, false);
      expect(errors).not.toContain('Title is required');
      expect(errors).not.toContain('Description is required');
    });
  });
});

describe('Telegram Auth Validation', () => {
  const mockBotToken = 'test_bot_token';

  // Simulate the validateTelegramAuth method
  function validateTelegramAuth(authData: any, botToken: string): { valid: boolean; error?: string } {
    try {
      // Extract hash and create data string
      const { hash, ...data } = authData;

      // Create sorted query string
      const dataCheckString = Object.keys(data)
        .sort()
        .map(key => `${key}=${(data as any)[key]}`)
        .join('\n');

      // Create secret key from bot token
      const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();

      // Calculate expected hash
      const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      // Compare hashes
      if (hash !== expectedHash) {
        return { valid: false, error: 'Invalid authentication hash' };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Hash validation failed',
      };
    }
  }

  function createValidAuthData(botToken: string, userData: any = {}) {
    const data = {
      id: 123456789,
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      auth_date: Math.floor(Date.now() / 1000),
      ...userData
    };

    // Create sorted query string
    const dataCheckString = Object.keys(data)
      .sort()
      .map(key => `${key}=${(data as any)[key]}`)
      .join('\n');

    // Create secret key and hash
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return { ...data, hash };
  }

  describe('Valid Auth Data', () => {
    it('should validate correct auth data', () => {
      const authData = createValidAuthData(mockBotToken);
      const result = validateTelegramAuth(authData, mockBotToken);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate with minimal required fields', () => {
      const authData = createValidAuthData(mockBotToken, {
        last_name: undefined,
        username: undefined
      });
      delete authData.last_name;
      delete authData.username;

      const result = validateTelegramAuth(authData, mockBotToken);
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid Auth Data', () => {
    it('should reject tampered hash', () => {
      const authData = createValidAuthData(mockBotToken);
      authData.hash = 'invalid_hash';

      const result = validateTelegramAuth(authData, mockBotToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid authentication hash');
    });

    it('should reject tampered user data', () => {
      const authData = createValidAuthData(mockBotToken);
      authData.id = 999999999; // Change user ID but keep original hash

      const result = validateTelegramAuth(authData, mockBotToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid authentication hash');
    });

    it('should reject auth data with wrong bot token', () => {
      const authData = createValidAuthData('wrong_bot_token');

      const result = validateTelegramAuth(authData, mockBotToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid authentication hash');
    });

    it('should handle missing hash gracefully', () => {
      const authData = createValidAuthData(mockBotToken);
      delete authData.hash;

      const result = validateTelegramAuth(authData, mockBotToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty auth data', () => {
      const result = validateTelegramAuth({}, mockBotToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle null auth data', () => {
      const result = validateTelegramAuth(null, mockBotToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle auth data with special characters', () => {
      const authData = createValidAuthData(mockBotToken, {
        first_name: 'Test & User',
        username: 'test_user@123'
      });

      const result = validateTelegramAuth(authData, mockBotToken);
      expect(result.valid).toBe(true);
    });
  });
});

describe('Content Filter Validation', () => {
  // Simulate content filtering logic
  function validateContent(text: string, options = { strict: true }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!text || typeof text !== 'string') {
      errors.push('Content must be a valid string');
      return { valid: false, errors };
    }

    // Basic profanity check (simplified)
    const profanityWords = ['badword1', 'badword2', 'spam'];
    const lowercaseText = text.toLowerCase();

    profanityWords.forEach(word => {
      if (lowercaseText.includes(word)) {
        errors.push(`Content contains inappropriate language: ${word}`);
      }
    });

    // Spam detection
    if (text.includes('BUY NOW') && text.includes('CLICK HERE')) {
      errors.push('Content appears to be spam');
    }

    // Length validation
    if (options.strict && text.length > 1000) {
      errors.push('Content exceeds maximum length in strict mode');
    }

    return { valid: errors.length === 0, errors };
  }

  describe('Valid Content', () => {
    it('should pass clean content', () => {
      const result = validateContent('This is a perfectly normal listing description.');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass content with normal punctuation', () => {
      const result = validateContent('Great item! Only $50. Contact me at: example@email.com');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Invalid Content', () => {
    it('should reject empty content', () => {
      const result = validateContent('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Content must be a valid string');
    });

    it('should reject null content', () => {
      const result = validateContent(null as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Content must be a valid string');
    });

    it('should reject content with profanity', () => {
      const result = validateContent('This item is badword1 and great!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Content contains inappropriate language: badword1');
    });

    it('should detect spam patterns', () => {
      const result = validateContent('BUY NOW this amazing product! CLICK HERE for discount!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Content appears to be spam');
    });

    it('should enforce length limits in strict mode', () => {
      const result = validateContent('a'.repeat(1001), { strict: true });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Content exceeds maximum length in strict mode');
    });
  });

  describe('Multiple Issues', () => {
    it('should report multiple validation errors', () => {
      const result = validateContent('badword1 BUY NOW CLICK HERE spam');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain('Content contains inappropriate language: badword1');
      expect(result.errors).toContain('Content contains inappropriate language: spam');
      expect(result.errors).toContain('Content appears to be spam');
    });
  });
});

describe('Input Sanitization', () => {
  function sanitizeInput(input: any): { sanitized: string; warnings: string[] } {
    const warnings: string[] = [];

    if (input === null || input === undefined) {
      return { sanitized: '', warnings: ['Input was null or undefined'] };
    }

    let sanitized = String(input);

    // Remove HTML tags
    if (sanitized.includes('<') || sanitized.includes('>')) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
      warnings.push('HTML tags were removed');
    }

    // Remove potentially dangerous characters
    if (sanitized.includes('script:') || sanitized.includes('javascript:')) {
      sanitized = sanitized.replace(/script:|javascript:/gi, '');
      warnings.push('Potentially dangerous content was removed');
    }

    // Trim whitespace
    const originalLength = sanitized.length;
    sanitized = sanitized.trim();
    if (sanitized.length !== originalLength) {
      warnings.push('Leading/trailing whitespace was removed');
    }

    return { sanitized, warnings };
  }

  describe('Clean Input', () => {
    it('should not modify clean text', () => {
      const result = sanitizeInput('Clean text input');
      expect(result.sanitized).toBe('Clean text input');
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle numbers', () => {
      const result = sanitizeInput(123);
      expect(result.sanitized).toBe('123');
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('Dangerous Input', () => {
    it('should remove HTML tags', () => {
      const result = sanitizeInput('<script>alert("hack")</script>Hello');
      expect(result.sanitized).toBe('Hello');
      expect(result.warnings).toContain('HTML tags were removed');
    });

    it('should remove javascript URLs', () => {
      const result = sanitizeInput('javascript:alert("hack")');
      expect(result.sanitized).toBe('alert("hack")');
      expect(result.warnings).toContain('Potentially dangerous content was removed');
    });

    it('should handle null input', () => {
      const result = sanitizeInput(null);
      expect(result.sanitized).toBe('');
      expect(result.warnings).toContain('Input was null or undefined');
    });

    it('should trim whitespace', () => {
      const result = sanitizeInput('  hello world  ');
      expect(result.sanitized).toBe('hello world');
      expect(result.warnings).toContain('Leading/trailing whitespace was removed');
    });
  });
});