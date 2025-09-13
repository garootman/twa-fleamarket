export interface ValidationResult {
  valid: boolean;
  error?: string | undefined;
  warnings?: string[] | undefined;
}

export interface UsernameValidationResult extends ValidationResult {
  username?: string;
  accessible?: boolean;
  lastChecked?: string;
}

export interface ListingValidationResult extends ValidationResult {
  issues: Array<{
    field: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
  estimatedReach?: number | undefined;
}

export class ValidationService {
  /**
   * Validate Telegram username accessibility
   */
  async validateUsername(username: string): Promise<UsernameValidationResult> {
    try {
      // Remove @ symbol if present
      const cleanUsername = username.replace(/^@/, '');

      // Basic format validation
      if (!cleanUsername.match(/^[a-zA-Z0-9_]{5,32}$/)) {
        return {
          valid: false,
          error:
            'Username must be 5-32 characters, containing only letters, numbers, and underscores',
        };
      }

      // In a real implementation, this would check with Telegram API
      // For now, we'll simulate the check
      const isAccessible = await this.checkTelegramUsernameAccessibility(cleanUsername);

      return {
        valid: isAccessible,
        username: cleanUsername,
        accessible: isAccessible,
        lastChecked: new Date().toISOString(),
        error: !isAccessible ? 'Username is not accessible or does not exist' : undefined,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Username validation failed',
      };
    }
  }

  /**
   * Check if Telegram username is accessible for messaging
   */
  private async checkTelegramUsernameAccessibility(username: string): Promise<boolean> {
    // In a real implementation, this would use Telegram Bot API to check if the username exists
    // and is accessible for messaging. For now, we'll return a placeholder result.

    // Basic heuristics (placeholder logic):
    // - Very short usernames are often taken
    // - Very long usernames are less common
    // - Common patterns are likely taken

    const commonPatterns = ['admin', 'bot', 'test', 'user', 'official'];
    const hasCommonPattern = commonPatterns.some(pattern =>
      username.toLowerCase().includes(pattern)
    );

    // Simulate varying accessibility based on patterns
    if (hasCommonPattern && username.length < 10) {
      return Math.random() > 0.7; // 30% chance for common short usernames
    } else if (username.length < 6) {
      return Math.random() > 0.8; // 20% chance for very short usernames
    } else {
      return Math.random() > 0.2; // 80% chance for normal usernames
    }
  }

  /**
   * Validate listing data before publishing
   */
  async validateListing(listingData: {
    title: string;
    description: string;
    price: number;
    categoryId: number;
    images: string[];
    contactUsername?: string;
  }): Promise<ListingValidationResult> {
    const issues: Array<{
      field: string;
      message: string;
      severity: 'error' | 'warning';
    }> = [];

    // Title validation
    if (!listingData.title || listingData.title.trim().length === 0) {
      issues.push({
        field: 'title',
        message: 'Title is required',
        severity: 'error',
      });
    } else if (listingData.title.length > 100) {
      issues.push({
        field: 'title',
        message: 'Title exceeds maximum length of 100 characters',
        severity: 'error',
      });
    } else if (listingData.title.length < 10) {
      issues.push({
        field: 'title',
        message: 'Title is very short, consider adding more details',
        severity: 'warning',
      });
    }

    // Description validation
    if (!listingData.description || listingData.description.trim().length === 0) {
      issues.push({
        field: 'description',
        message: 'Description is required',
        severity: 'error',
      });
    } else if (listingData.description.length > 1000) {
      issues.push({
        field: 'description',
        message: 'Description exceeds maximum length of 1000 characters',
        severity: 'error',
      });
    } else if (listingData.description.length < 20) {
      issues.push({
        field: 'description',
        message: 'Description is very short, buyers appreciate detailed descriptions',
        severity: 'warning',
      });
    }

    // Price validation
    if (!listingData.price || listingData.price <= 0) {
      issues.push({
        field: 'price',
        message: 'Price must be greater than 0',
        severity: 'error',
      });
    } else if (listingData.price < 0.01) {
      issues.push({
        field: 'price',
        message: 'Minimum price is $0.01',
        severity: 'error',
      });
    } else if (listingData.price > 99999.99) {
      issues.push({
        field: 'price',
        message: 'Price seems unusually high',
        severity: 'warning',
      });
    }

    // Category validation
    if (!listingData.categoryId) {
      issues.push({
        field: 'categoryId',
        message: 'Category is required',
        severity: 'error',
      });
    }

    // Images validation
    if (!listingData.images || listingData.images.length === 0) {
      issues.push({
        field: 'images',
        message: 'At least one image is required',
        severity: 'error',
      });
    } else if (listingData.images.length > 9) {
      issues.push({
        field: 'images',
        message: 'Maximum 9 images allowed',
        severity: 'error',
      });
    } else if (listingData.images.length === 1) {
      issues.push({
        field: 'images',
        message: 'Consider adding more images to showcase your item better',
        severity: 'warning',
      });
    }

    // Contact username validation
    if (listingData.contactUsername) {
      const usernameResult = await this.validateUsername(listingData.contactUsername);
      if (!usernameResult.valid) {
        issues.push({
          field: 'contactUsername',
          message: usernameResult.error || 'Invalid contact username',
          severity: 'error',
        });
      } else if (!usernameResult.accessible) {
        issues.push({
          field: 'contactUsername',
          message: 'Contact username may not be accessible for messaging',
          severity: 'warning',
        });
      }
    }

    // Content quality checks
    this.checkContentQuality(listingData.title, 'title', issues);
    this.checkContentQuality(listingData.description, 'description', issues);

    // Estimate listing reach based on quality
    const estimatedReach = this.estimateListingReach(listingData, issues);

    const hasErrors = issues.some(issue => issue.severity === 'error');

    return {
      valid: !hasErrors,
      issues,
      estimatedReach,
    };
  }

  /**
   * Check content quality for common issues
   */
  private checkContentQuality(
    text: string,
    field: string,
    issues: Array<{ field: string; message: string; severity: 'error' | 'warning' }>
  ): void {
    // Check for excessive uppercase
    const uppercaseRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (uppercaseRatio > 0.5 && text.length > 10) {
      issues.push({
        field,
        message: 'Excessive use of CAPITAL LETTERS may reduce listing visibility',
        severity: 'warning',
      });
    }

    // Check for excessive punctuation
    const punctuationRatio = (text.match(/[!?]{2,}/g) || []).length;
    if (punctuationRatio > 0) {
      issues.push({
        field,
        message: 'Excessive punctuation (!!! or ???) may look unprofessional',
        severity: 'warning',
      });
    }

    // Check for spam-like patterns
    const repeatedWords = this.findRepeatedWords(text);
    if (repeatedWords.length > 0) {
      issues.push({
        field,
        message: `Repeated words detected: ${repeatedWords.join(', ')}`,
        severity: 'warning',
      });
    }

    // Check for missing details (common keywords)
    if (field === 'description') {
      const detailKeywords = ['condition', 'size', 'color', 'brand', 'year', 'model'];
      const mentionedKeywords = detailKeywords.filter(keyword =>
        text.toLowerCase().includes(keyword)
      );

      if (mentionedKeywords.length === 0) {
        issues.push({
          field,
          message: 'Consider adding more details like condition, size, brand, etc.',
          severity: 'warning',
        });
      }
    }
  }

  /**
   * Find repeated words in text
   */
  private findRepeatedWords(text: string): string[] {
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const wordCounts: Record<string, number> = {};

    words.forEach(word => {
      if (word.length > 3) {
        // Only check words longer than 3 characters
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    });

    return Object.keys(wordCounts).filter(word => wordCounts[word] > 2);
  }

  /**
   * Estimate listing reach based on quality factors
   */
  private estimateListingReach(
    listingData: {
      title: string;
      description: string;
      price: number;
      images: string[];
    },
    issues: Array<{ field: string; message: string; severity: 'error' | 'warning' }>
  ): number {
    let baseReach = 100; // Base reach percentage

    // Quality factors that increase reach
    if (listingData.title.length >= 20 && listingData.title.length <= 60) {
      baseReach += 10; // Good title length
    }

    if (listingData.description.length >= 100) {
      baseReach += 15; // Detailed description
    }

    if (listingData.images.length >= 3) {
      baseReach += 10; // Multiple images
    }

    // Price competitiveness (placeholder logic)
    if (listingData.price >= 10 && listingData.price <= 1000) {
      baseReach += 5; // Reasonable price range
    }

    // Reduce reach for quality issues
    const warningCount = issues.filter(issue => issue.severity === 'warning').length;
    const errorCount = issues.filter(issue => issue.severity === 'error').length;

    baseReach -= warningCount * 5;
    baseReach -= errorCount * 15;

    // Cap between 0 and 200
    return Math.max(0, Math.min(200, baseReach));
  }

  /**
   * Validate image URLs
   */
  async validateImageUrls(imageUrls: string[]): Promise<ValidationResult> {
    const invalidUrls: string[] = [];

    for (const url of imageUrls) {
      if (!this.isValidImageUrl(url)) {
        invalidUrls.push(url);
      }
    }

    if (invalidUrls.length > 0) {
      return {
        valid: false,
        error: `Invalid image URLs: ${invalidUrls.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Check if URL is a valid image URL
   */
  private isValidImageUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);

      // Check if it's HTTPS
      if (urlObj.protocol !== 'https:') {
        return false;
      }

      // Check file extension
      const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
      const hasValidExtension = validExtensions.some(ext =>
        urlObj.pathname.toLowerCase().endsWith(ext)
      );

      return hasValidExtension;
    } catch {
      return false;
    }
  }

  /**
   * Validate price format and reasonableness
   */
  validatePrice(price: number, category?: string): ValidationResult {
    if (typeof price !== 'number' || isNaN(price)) {
      return {
        valid: false,
        error: 'Price must be a valid number',
      };
    }

    if (price <= 0) {
      return {
        valid: false,
        error: 'Price must be greater than 0',
      };
    }

    if (price < 0.01) {
      return {
        valid: false,
        error: 'Minimum price is $0.01',
      };
    }

    if (price > 999999.99) {
      return {
        valid: false,
        error: 'Maximum price is $999,999.99',
      };
    }

    // Check decimal places
    const decimalPlaces = (price.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      return {
        valid: false,
        error: 'Price can have at most 2 decimal places',
      };
    }

    const warnings: string[] = [];

    // Category-specific price warnings
    if (category) {
      if (category.toLowerCase().includes('electronics') && price > 10000) {
        warnings.push('Price seems high for electronics - consider if this is correct');
      } else if (category.toLowerCase().includes('clothing') && price > 1000) {
        warnings.push('Price seems high for clothing item');
      }
    }

    // General price warnings
    if (price > 5000) {
      warnings.push('High-value items may require additional verification');
    }

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Batch validate multiple usernames
   */
  async validateUsernames(usernames: string[]): Promise<Record<string, UsernameValidationResult>> {
    const results: Record<string, UsernameValidationResult> = {};

    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < usernames.length; i += batchSize) {
      const batch = usernames.slice(i, i + batchSize);
      const batchPromises = batch.map(async username => {
        const result = await this.validateUsername(username);
        return { username, result };
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ username, result }) => {
        results[username] = result;
      });

      // Small delay between batches
      if (i + batchSize < usernames.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }
}
