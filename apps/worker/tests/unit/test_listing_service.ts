import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListingService } from '../../src/services/listing-service';
import type { ListingCreateData, ListingSearchFilters, UpdateListing } from '../../src/db/models/listing';

/**
 * Unit Tests for ListingService - T105
 *
 * Tests listing service business logic:
 * - Listing creation and validation
 * - Search and filtering functionality
 * - Listing updates and management
 * - Content validation and moderation
 * - Caching and performance optimizations
 * - Analytics and recommendations
 */

// Mock dependencies
const mockDB = {
  prepare: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
  get: vi.fn(),
} as any;

const mockListingModel = {
  create: vi.fn(),
  search: vi.fn(),
  findById: vi.fn(),
  findByUser: vi.fn(),
  update: vi.fn(),
  markSold: vi.fn(),
  archive: vi.fn(),
  delete: vi.fn(),
  bump: vi.fn(),
  flag: vi.fn(),
  getFeatured: vi.fn(),
  getTrending: vi.fn(),
  incrementViews: vi.fn(),
  getStats: vi.fn(),
};

const mockCategoryModel = {
  findById: vi.fn(),
  findAll: vi.fn(),
  exists: vi.fn(),
};

const mockUserModel = {
  findByTelegramId: vi.fn(),
  exists: vi.fn(),
};

const mockBlockedWordModel = {
  checkContent: vi.fn(),
  findAll: vi.fn(),
};

const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  invalidate: vi.fn(),
  invalidatePattern: vi.fn(),
};

// Mock the models
vi.mock('../../src/db/models/listing', () => ({
  ListingModel: vi.fn().mockImplementation(() => mockListingModel),
}));

vi.mock('../../src/db/models/category', () => ({
  CategoryModel: vi.fn().mockImplementation(() => mockCategoryModel),
}));

vi.mock('../../src/db/models/user', () => ({
  UserModel: vi.fn().mockImplementation(() => mockUserModel),
}));

vi.mock('../../src/db/models/blocked-word', () => ({
  BlockedWordModel: vi.fn().mockImplementation(() => mockBlockedWordModel),
}));

describe('ListingService', () => {
  let listingService: ListingService;
  const mockUserId = 123456789;
  const mockListingId = 'listing_123';

  const mockListing = {
    id: mockListingId,
    title: 'Test Listing',
    description: 'A test listing description',
    priceUsd: 99.99,
    categoryId: 1,
    images: ['image1.jpg'],
    tags: ['electronics'],
    userId: mockUserId,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCategory = {
    id: 1,
    name: 'Electronics',
    parentId: null,
    isActive: true,
  };

  const mockUser = {
    telegramId: mockUserId,
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    isBanned: false,
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create listing service
    listingService = new ListingService(mockDB, mockCache);
  });

  describe('Constructor', () => {
    it('should initialize with database and cache service', () => {
      const service = new ListingService(mockDB, mockCache);
      expect(service).toBeDefined();
    });
  });

  describe('Create Listing', () => {
    const validListingData: ListingCreateData = {
      title: 'Test Listing',
      description: 'A test listing description',
      priceUsd: 99.99,
      categoryId: 1,
      images: ['image1.jpg'],
      tags: ['electronics'],
      isDraft: false,
    };

    describe('Valid Listing Creation', () => {
      beforeEach(() => {
        mockCategoryModel.exists.mockResolvedValue(true);
        mockUserModel.findByTelegramId.mockResolvedValue(mockUser);
        mockBlockedWordModel.checkContent.mockResolvedValue({
          hasBlockedWords: false,
          flaggedTerms: [],
          severity: 'none',
        });
        mockListingModel.create.mockResolvedValue(mockListing);
      });

      it('should create listing successfully with valid data', async () => {
        const result = await listingService.createListing(validListingData, mockUserId);

        expect(result.success).toBe(true);
        expect(result.listing).toEqual(mockListing);
        expect(result.error).toBeUndefined();
        expect(mockListingModel.create).toHaveBeenCalledWith(
          expect.objectContaining({
            title: validListingData.title,
            description: validListingData.description,
            priceUsd: validListingData.priceUsd,
            categoryId: validListingData.categoryId,
            userId: mockUserId,
          })
        );
      });

      it('should create draft listing when isDraft is true', async () => {
        const draftData = { ...validListingData, isDraft: true };

        const result = await listingService.createListing(draftData, mockUserId);

        expect(result.success).toBe(true);
        expect(result.isDraft).toBe(true);
        expect(mockListingModel.create).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'draft',
          })
        );
      });

      it('should invalidate caches after creation', async () => {
        await listingService.createListing(validListingData, mockUserId);

        expect(mockCache.invalidatePattern).toHaveBeenCalledWith('search:*');
        expect(mockCache.invalidatePattern).toHaveBeenCalledWith('featured:*');
      });
    });

    describe('Invalid Listing Creation', () => {
      it('should reject listing with invalid title', async () => {
        const invalidData = { ...validListingData, title: '' };

        const result = await listingService.createListing(invalidData, mockUserId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Validation failed');
        expect(mockListingModel.create).not.toHaveBeenCalled();
      });

      it('should reject listing with invalid price', async () => {
        const invalidData = { ...validListingData, priceUsd: -10 };

        const result = await listingService.createListing(invalidData, mockUserId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Validation failed');
      });

      it('should reject listing with non-existent category', async () => {
        mockCategoryModel.exists.mockResolvedValue(false);

        const result = await listingService.createListing(validListingData, mockUserId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Validation failed');
      });

      it('should handle blocked content appropriately', async () => {
        mockCategoryModel.exists.mockResolvedValue(true);
        mockUserModel.findByTelegramId.mockResolvedValue(mockUser);
        mockBlockedWordModel.checkContent.mockResolvedValue({
          hasBlockedWords: true,
          flaggedTerms: ['inappropriate'],
          severity: 'block',
        });

        const result = await listingService.createListing(validListingData, mockUserId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('blocked content');
      });

      it('should handle database errors gracefully', async () => {
        mockCategoryModel.exists.mockResolvedValue(true);
        mockUserModel.findByTelegramId.mockResolvedValue(mockUser);
        mockBlockedWordModel.checkContent.mockResolvedValue({
          hasBlockedWords: false,
          flaggedTerms: [],
          severity: 'none',
        });
        mockListingModel.create.mockRejectedValue(new Error('Database error'));

        const result = await listingService.createListing(validListingData, mockUserId);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Database error');
      });
    });
  });

  describe('Search Listings', () => {
    const mockSearchResults = {
      listings: [mockListing],
      totalCount: 1,
      searchTime: 50,
    };

    describe('Basic Search', () => {
      it('should search listings with query', async () => {
        mockListingModel.search.mockResolvedValue(mockSearchResults);
        mockCache.get.mockResolvedValue(null); // No cached results

        const result = await listingService.searchListings('electronics');

        expect(result.listings).toEqual([mockListing]);
        expect(result.totalCount).toBe(1);
        expect(result.searchTime).toBe(50);
        expect(mockListingModel.search).toHaveBeenCalledWith(
          'electronics',
          expect.any(Object),
          1,
          20
        );
      });

      it('should use cached results when available', async () => {
        const cachedResults = {
          listings: [mockListing],
          totalCount: 1,
          hasMore: false,
          searchTime: 5,
          filters: {},
          suggestions: [],
          facets: { categories: [], priceRanges: [], locations: [] },
        };
        mockCache.get.mockResolvedValue(cachedResults);

        const result = await listingService.searchListings('electronics');

        expect(result).toEqual(cachedResults);
        expect(mockListingModel.search).not.toHaveBeenCalled();
      });

      it('should apply search filters', async () => {
        const filters: ListingSearchFilters = {
          categoryId: 1,
          minPrice: 50,
          maxPrice: 200,
          location: 'New York',
        };
        mockListingModel.search.mockResolvedValue(mockSearchResults);
        mockCache.get.mockResolvedValue(null);

        await listingService.searchListings('electronics', filters);

        expect(mockListingModel.search).toHaveBeenCalledWith(
          'electronics',
          expect.objectContaining(filters),
          1,
          20
        );
      });

      it('should handle pagination correctly', async () => {
        mockListingModel.search.mockResolvedValue(mockSearchResults);
        mockCache.get.mockResolvedValue(null);

        await listingService.searchListings('electronics', {}, 2, 10);

        expect(mockListingModel.search).toHaveBeenCalledWith(
          'electronics',
          expect.any(Object),
          2,
          10
        );
      });
    });

    describe('Search Features', () => {
      it('should generate search suggestions', async () => {
        const mockSuggestions = ['electronics', 'gadgets', 'smartphones'];
        mockListingModel.search.mockResolvedValue(mockSearchResults);
        mockCache.get.mockResolvedValue(null);

        // Mock the private method behavior
        const result = await listingService.searchListings('elect');

        expect(result.suggestions).toBeDefined();
        expect(Array.isArray(result.suggestions)).toBe(true);
      });

      it('should generate search facets', async () => {
        mockListingModel.search.mockResolvedValue(mockSearchResults);
        mockCache.get.mockResolvedValue(null);

        const result = await listingService.searchListings('electronics');

        expect(result.facets).toBeDefined();
        expect(result.facets.categories).toBeDefined();
        expect(result.facets.priceRanges).toBeDefined();
        expect(result.facets.locations).toBeDefined();
      });

      it('should cache search results', async () => {
        mockListingModel.search.mockResolvedValue(mockSearchResults);
        mockCache.get.mockResolvedValue(null);

        await listingService.searchListings('electronics');

        expect(mockCache.set).toHaveBeenCalledWith(
          expect.stringContaining('search:'),
          expect.any(Object),
          300 // 5 minutes TTL
        );
      });
    });
  });

  describe('Get Listing Details', () => {
    describe('Valid Listing Retrieval', () => {
      it('should get listing details successfully', async () => {
        mockListingModel.findById.mockResolvedValue(mockListing);
        mockListingModel.incrementViews.mockResolvedValue(true);

        const result = await listingService.getListingDetails(mockListingId);

        expect(result.listing).toEqual(mockListing);
        expect(mockListingModel.findById).toHaveBeenCalledWith(mockListingId);
        expect(mockListingModel.incrementViews).toHaveBeenCalledWith(mockListingId);
      });

      it('should track viewer for analytics', async () => {
        const viewerId = 987654321;
        mockListingModel.findById.mockResolvedValue(mockListing);
        mockListingModel.incrementViews.mockResolvedValue(true);

        await listingService.getListingDetails(mockListingId, viewerId);

        expect(mockListingModel.incrementViews).toHaveBeenCalledWith(mockListingId, viewerId);
      });

      it('should return analytics data', async () => {
        mockListingModel.findById.mockResolvedValue(mockListing);
        mockListingModel.incrementViews.mockResolvedValue(true);

        const result = await listingService.getListingDetails(mockListingId);

        expect(result.analytics).toBeDefined();
        expect(typeof result.analytics?.totalViews).toBe('number');
        expect(typeof result.analytics?.viewsToday).toBe('number');
      });
    });

    describe('Invalid Listing Retrieval', () => {
      it('should handle non-existent listing', async () => {
        mockListingModel.findById.mockResolvedValue(null);

        const result = await listingService.getListingDetails('nonexistent');

        expect(result.listing).toBeNull();
        expect(result.analytics).toBeNull();
        expect(mockListingModel.incrementViews).not.toHaveBeenCalled();
      });

      it('should handle database errors gracefully', async () => {
        mockListingModel.findById.mockRejectedValue(new Error('Database error'));

        const result = await listingService.getListingDetails(mockListingId);

        expect(result.listing).toBeNull();
        expect(result.analytics).toBeNull();
      });
    });
  });

  describe('Update Listing', () => {
    const updateData: UpdateListing = {
      title: 'Updated Title',
      description: 'Updated description',
      priceUsd: 149.99,
    };

    describe('Valid Updates', () => {
      beforeEach(() => {
        mockListingModel.findById.mockResolvedValue(mockListing);
        mockListingModel.update.mockResolvedValue({ ...mockListing, ...updateData });
        mockBlockedWordModel.checkContent.mockResolvedValue({
          hasBlockedWords: false,
          flaggedTerms: [],
          severity: 'none',
        });
      });

      it('should update listing successfully', async () => {
        const result = await listingService.updateListing(mockListingId, updateData, mockUserId);

        expect(result.success).toBe(true);
        expect(result.listing).toEqual(expect.objectContaining(updateData));
        expect(mockListingModel.update).toHaveBeenCalledWith(
          mockListingId,
          expect.objectContaining(updateData),
          mockUserId
        );
      });

      it('should validate ownership before update', async () => {
        const unauthorizedUserId = 987654321;

        const result = await listingService.updateListing(mockListingId, updateData, unauthorizedUserId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('not authorized');
      });

      it('should validate updated data', async () => {
        const invalidUpdate = { ...updateData, title: '' };

        const result = await listingService.updateListing(mockListingId, invalidUpdate, mockUserId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Validation failed');
      });

      it('should invalidate caches after update', async () => {
        await listingService.updateListing(mockListingId, updateData, mockUserId);

        expect(mockCache.invalidatePattern).toHaveBeenCalledWith('search:*');
        expect(mockCache.invalidate).toHaveBeenCalledWith(`listing:${mockListingId}`);
      });
    });

    describe('Invalid Updates', () => {
      it('should reject update for non-existent listing', async () => {
        mockListingModel.findById.mockResolvedValue(null);

        const result = await listingService.updateListing('nonexistent', updateData, mockUserId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });

      it('should reject updates with blocked content', async () => {
        mockListingModel.findById.mockResolvedValue(mockListing);
        mockBlockedWordModel.checkContent.mockResolvedValue({
          hasBlockedWords: true,
          flaggedTerms: ['inappropriate'],
          severity: 'block',
        });

        const result = await listingService.updateListing(mockListingId, updateData, mockUserId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('blocked content');
      });
    });
  });

  describe('Listing Management', () => {
    describe('Mark as Sold', () => {
      it('should mark listing as sold successfully', async () => {
        const soldListing = { ...mockListing, status: 'sold' };
        mockListingModel.markSold.mockResolvedValue(soldListing);

        const result = await listingService.markAsSold(mockListingId, mockUserId);

        expect(result.success).toBe(true);
        expect(result.listing?.status).toBe('sold');
        expect(mockListingModel.markSold).toHaveBeenCalledWith(mockListingId, mockUserId);
      });

      it('should handle unauthorized mark as sold', async () => {
        mockListingModel.markSold.mockResolvedValue(null);

        const result = await listingService.markAsSold(mockListingId, 999999999);

        expect(result.success).toBe(false);
        expect(result.error).toContain('not authorized');
      });
    });

    describe('Archive Listing', () => {
      it('should archive listing successfully', async () => {
        const archivedListing = { ...mockListing, status: 'archived' };
        mockListingModel.archive.mockResolvedValue(archivedListing);

        const result = await listingService.archiveListing(mockListingId, mockUserId);

        expect(result.success).toBe(true);
        expect(result.listing?.status).toBe('archived');
        expect(mockListingModel.archive).toHaveBeenCalledWith(mockListingId, mockUserId);
      });
    });

    describe('Delete Listing', () => {
      it('should delete listing successfully', async () => {
        mockListingModel.delete.mockResolvedValue(true);

        const result = await listingService.deleteListing(mockListingId, mockUserId);

        expect(result.success).toBe(true);
        expect(mockListingModel.delete).toHaveBeenCalledWith(mockListingId, mockUserId);
      });

      it('should handle unauthorized deletion', async () => {
        mockListingModel.delete.mockResolvedValue(false);

        const result = await listingService.deleteListing(mockListingId, 999999999);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to delete');
      });
    });

    describe('Bump Listing', () => {
      it('should bump listing successfully', async () => {
        const bumpResult = {
          success: true,
          listing: { ...mockListing, bumpedAt: new Date() },
          nextBumpAvailable: new Date(Date.now() + 24 * 60 * 60 * 1000),
        };
        mockListingModel.bump.mockResolvedValue(bumpResult);

        const result = await listingService.bumpListing(mockListingId, mockUserId);

        expect(result.success).toBe(true);
        expect(result.listing?.bumpedAt).toBeDefined();
        expect(mockCache.invalidatePattern).toHaveBeenCalledWith('search:*');
      });

      it('should handle bump cooldown', async () => {
        const bumpResult = {
          success: false,
          error: 'Bump cooldown active',
          nextBumpAvailable: new Date(Date.now() + 12 * 60 * 60 * 1000),
        };
        mockListingModel.bump.mockResolvedValue(bumpResult);

        const result = await listingService.bumpListing(mockListingId, mockUserId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('cooldown');
      });
    });
  });

  describe('User Listings', () => {
    it('should get user listings with filters', async () => {
      const userListings = [mockListing];
      mockListingModel.findByUser.mockResolvedValue({
        listings: userListings,
        totalCount: 1,
        stats: { active: 1, sold: 0, draft: 0, archived: 0 },
      });

      const result = await listingService.getUserListings(mockUserId);

      expect(result.listings).toEqual(userListings);
      expect(result.totalCount).toBe(1);
      expect(result.stats).toBeDefined();
    });

    it('should apply status filter for user listings', async () => {
      await listingService.getUserListings(mockUserId, 'active');

      expect(mockListingModel.findByUser).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({ status: 'active' }),
        1,
        20
      );
    });
  });

  describe('Featured and Trending', () => {
    describe('Featured Listings', () => {
      it('should get featured listings', async () => {
        const featuredListings = [mockListing];
        mockListingModel.getFeatured.mockResolvedValue(featuredListings);

        const result = await listingService.getFeaturedListings(5);

        expect(result).toEqual(featuredListings);
        expect(mockListingModel.getFeatured).toHaveBeenCalledWith(5);
      });

      it('should use default limit for featured listings', async () => {
        mockListingModel.getFeatured.mockResolvedValue([]);

        await listingService.getFeaturedListings();

        expect(mockListingModel.getFeatured).toHaveBeenCalledWith(10);
      });
    });

    describe('Trending Listings', () => {
      it('should get trending listings', async () => {
        const trendingListings = [mockListing];
        mockListingModel.getTrending.mockResolvedValue(trendingListings);

        const result = await listingService.getTrendingListings(5);

        expect(result).toEqual(trendingListings);
        expect(mockListingModel.getTrending).toHaveBeenCalledWith(5);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      const timeoutError = new Error('Network timeout');
      timeoutError.name = 'TimeoutError';
      mockListingModel.search.mockRejectedValue(timeoutError);

      const result = await listingService.searchListings('electronics');

      expect(result.listings).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should handle unexpected errors gracefully', async () => {
      const unexpectedError = new Error('Unexpected error');
      mockListingModel.findById.mockRejectedValue(unexpectedError);

      const result = await listingService.getListingDetails(mockListingId);

      expect(result.listing).toBeNull();
      expect(result.analytics).toBeNull();
    });

    it('should handle cache failures gracefully', async () => {
      mockCache.get.mockRejectedValue(new Error('Cache unavailable'));
      mockListingModel.search.mockResolvedValue({
        listings: [mockListing],
        totalCount: 1,
        searchTime: 50,
      });

      const result = await listingService.searchListings('electronics');

      expect(result.listings).toEqual([mockListing]);
      expect(mockListingModel.search).toHaveBeenCalled();
    });
  });
});