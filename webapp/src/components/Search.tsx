import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Text } from './ui';
import { Listing, Category } from './ListingBrowse';

export interface SearchProps {
  token: string;
  onListingClick?: (listing: Listing) => void;
  onClose?: () => void;
  initialQuery?: string;
}

interface SearchFilters {
  category_id?: number;
  min_price?: number;
  max_price?: number;
  sort_by: 'created_at' | 'price_asc' | 'price_desc' | 'views' | 'expiring_soon';
  status: 'active' | 'all';
}

// Mock API functions - these should be replaced with actual API calls
const searchListings = async (
  query: string,
  filters: SearchFilters,
  token: string
): Promise<Listing[]> => {
  // TODO: Replace with actual API call to /api/listings with search params
  await new Promise(resolve => setTimeout(resolve, 500));

  const mockListings: Listing[] = [
    {
      id: '1',
      user_id: 123456789,
      category_id: 2,
      title: 'iPhone 15 Pro Max 256GB Natural Titanium',
      description: 'Excellent condition iPhone 15 Pro Max. Includes all original accessories.',
      price_usd: 899.99,
      images: ['https://via.placeholder.com/300x200?text=iPhone+15'],
      created_at: '2024-01-15T10:00:00Z',
      expires_at: '2024-01-22T10:00:00Z',
      status: 'active',
      is_sticky: false,
      is_highlighted: true,
      view_count: 67,
      contact_username: 'seller123',
      published_at: '2024-01-15T10:00:00Z',
      time_left: '2 days left',
      can_bump: true,
      user: {
        telegram_id: 123456789,
        username: 'seller123',
        first_name: 'John',
        last_name: 'Doe',
        is_admin: false,
      },
      category: { id: 2, name: 'Phones', parent_id: 1, is_active: true },
    },
    {
      id: '2',
      user_id: 987654321,
      category_id: 3,
      title: 'MacBook Pro M3 16" 512GB',
      description: 'Perfect for work and creative projects. Includes charger and original box.',
      price_usd: 1599.0,
      images: ['https://via.placeholder.com/300x200?text=MacBook'],
      created_at: '2024-01-14T15:30:00Z',
      expires_at: '2024-01-21T15:30:00Z',
      status: 'active',
      is_sticky: true,
      is_highlighted: false,
      view_count: 128,
      contact_username: 'techseller',
      published_at: '2024-01-14T15:30:00Z',
      time_left: '1 day left',
      can_bump: false,
      user: {
        telegram_id: 987654321,
        username: 'techseller',
        first_name: 'Sarah',
        last_name: 'Tech',
        is_admin: false,
      },
      category: { id: 3, name: 'Laptops', parent_id: 1, is_active: true },
    },
    {
      id: '3',
      user_id: 456789123,
      category_id: 5,
      title: 'JavaScript: The Complete Guide 2024',
      description: 'Comprehensive guide to modern JavaScript. Like new condition.',
      price_usd: 39.99,
      images: ['https://via.placeholder.com/300x200?text=JS+Book'],
      created_at: '2024-01-13T09:15:00Z',
      expires_at: '2024-01-20T09:15:00Z',
      status: 'active',
      is_sticky: false,
      is_highlighted: false,
      view_count: 23,
      contact_username: 'bookworm',
      published_at: '2024-01-13T09:15:00Z',
      time_left: '3 days left',
      can_bump: true,
      user: {
        telegram_id: 456789123,
        username: 'bookworm',
        first_name: 'Alice',
        last_name: 'Reader',
        is_admin: false,
      },
      category: { id: 5, name: 'Books', is_active: true },
    },
  ];

  // Simulate search filtering
  let results = mockListings;

  if (query.trim()) {
    const searchTerm = query.toLowerCase();
    results = results.filter(
      listing =>
        listing.title.toLowerCase().includes(searchTerm) ||
        listing.description.toLowerCase().includes(searchTerm) ||
        listing.category.name.toLowerCase().includes(searchTerm)
    );
  }

  if (filters.category_id) {
    results = results.filter(listing => listing.category_id === filters.category_id);
  }

  if (filters.min_price !== undefined) {
    results = results.filter(listing => listing.price_usd >= filters.min_price!);
  }

  if (filters.max_price !== undefined) {
    results = results.filter(listing => listing.price_usd <= filters.max_price!);
  }

  if (filters.status === 'active') {
    results = results.filter(listing => listing.status === 'active');
  }

  // Apply sorting
  switch (filters.sort_by) {
    case 'price_asc':
      results.sort((a, b) => a.price_usd - b.price_usd);
      break;
    case 'price_desc':
      results.sort((a, b) => b.price_usd - a.price_usd);
      break;
    case 'views':
      results.sort((a, b) => b.view_count - a.view_count);
      break;
    case 'expiring_soon':
      results.sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());
      break;
    default: // created_at
      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      break;
  }

  return results;
};

const fetchCategories = async (): Promise<Category[]> => {
  return [
    { id: 1, name: 'Electronics', parent_id: undefined, is_active: true },
    { id: 2, name: 'Phones', parent_id: 1, is_active: true },
    { id: 3, name: 'Laptops', parent_id: 1, is_active: true },
    { id: 4, name: 'Clothing', parent_id: undefined, is_active: true },
    { id: 5, name: 'Books', parent_id: undefined, is_active: true },
  ];
};

const getSearchSuggestions = async (query: string): Promise<string[]> => {
  // TODO: Replace with actual API call for search suggestions
  await new Promise(resolve => setTimeout(resolve, 200));

  const suggestions = [
    'iPhone 15',
    'MacBook Pro',
    'iPad Air',
    'JavaScript book',
    'Gaming laptop',
    'Wireless headphones',
    'Camera lens',
    'Winter jacket',
  ];

  if (!query.trim()) return [];

  return suggestions
    .filter(suggestion => suggestion.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 5);
};

export function Search({
  token,
  onListingClick,
  onClose,
  initialQuery = '',
}: SearchProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilters>({
    sort_by: 'created_at',
    status: 'active',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });

  const searchQuery = useQuery({
    queryKey: ['search', debouncedQuery, filters],
    queryFn: () => searchListings(debouncedQuery, filters, token),
    enabled:
      debouncedQuery.length >= 2 ||
      Object.keys(filters).some(
        key =>
          filters[key as keyof SearchFilters] !== undefined && key !== 'sort_by' && key !== 'status'
      ),
  });

  const suggestionsQuery = useQuery({
    queryKey: ['suggestions', searchQuery],
    queryFn: () => getSearchSuggestions(searchQuery),
    enabled: showSuggestions && searchQuery.length >= 1,
  });

  const categories = categoriesQuery.data || [];
  const childCategories = categories.filter(cat => cat.parent_id);
  const listings = searchQuery.data || [];
  const suggestions = suggestionsQuery.data || [];

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowSuggestions(value.length >= 1);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
    searchInputRef.current?.focus();
  };

  const handleFilterChange = (key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      sort_by: 'created_at',
      status: 'active',
    });
  };

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  const hasActiveFilters = Object.keys(filters).some(
    key =>
      key !== 'sort_by' && key !== 'status' && filters[key as keyof SearchFilters] !== undefined
  );

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <Text variant="title">🔍 Search Marketplace</Text>
          {onClose && (
            <Button variant="secondary" onClick={onClose} size="sm">
              ← Back
            </Button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative mb-4">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            onFocus={() => setShowSuggestions(searchQuery.length >= 1)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search for items, categories, or keywords..."
            className="w-full p-3 pr-12 border rounded-lg text-lg"
          />
          <div className="absolute right-3 top-3 text-gray-400">🔍</div>

          {/* Search Suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex items-center justify-between">
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)} size="sm">
            🔧 Filters {hasActiveFilters && '(Active)'}
          </Button>

          {hasActiveFilters && (
            <Button variant="secondary" onClick={clearFilters} size="sm">
              Clear Filters
            </Button>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <Card variant="elevated" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Category Filter */}
              <div>
                <Text className="text-sm font-medium mb-2">Category</Text>
                <select
                  value={filters.category_id || ''}
                  onChange={e =>
                    handleFilterChange(
                      'category_id',
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                  className="w-full p-2 border rounded"
                >
                  <option value="">All categories</option>
                  {childCategories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price Range */}
              <div>
                <Text className="text-sm font-medium mb-2">Min Price</Text>
                <input
                  type="number"
                  value={filters.min_price || ''}
                  onChange={e =>
                    handleFilterChange(
                      'min_price',
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  placeholder="$0"
                  className="w-full p-2 border rounded"
                />
              </div>

              <div>
                <Text className="text-sm font-medium mb-2">Max Price</Text>
                <input
                  type="number"
                  value={filters.max_price || ''}
                  onChange={e =>
                    handleFilterChange(
                      'max_price',
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  placeholder="No limit"
                  className="w-full p-2 border rounded"
                />
              </div>

              {/* Sort By */}
              <div>
                <Text className="text-sm font-medium mb-2">Sort by</Text>
                <select
                  value={filters.sort_by}
                  onChange={e => handleFilterChange('sort_by', e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  <option value="created_at">Newest first</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="views">Most viewed</option>
                  <option value="expiring_soon">Expiring soon</option>
                </select>
              </div>
            </div>
          </Card>
        )}
      </Card>

      {/* Search Results */}
      <div>
        {debouncedQuery.length < 2 && !hasActiveFilters ? (
          <Card variant="elevated" className="text-center py-8">
            <Text>Start typing to search for listings...</Text>
            <Text className="text-sm text-gray-600 mt-2">
              Search by item name, description, or category
            </Text>
          </Card>
        ) : searchQuery.isLoading ? (
          <Card variant="elevated" className="text-center py-8">
            <Text>Searching...</Text>
          </Card>
        ) : searchQuery.isError ? (
          <Card variant="elevated" className="text-center py-8">
            <Text className="text-red-600">Error searching listings. Please try again.</Text>
          </Card>
        ) : (
          <div>
            {/* Results Header */}
            <div className="mb-4">
              <Text>
                {listings.length} result{listings.length !== 1 ? 's' : ''}
                {debouncedQuery && ` for "${debouncedQuery}"`}
              </Text>
            </div>

            {/* Results List */}
            {listings.length === 0 ? (
              <Card variant="elevated" className="text-center py-8">
                <Text>No listings found</Text>
                <Text className="text-sm text-gray-600 mt-2">
                  Try adjusting your search terms or filters
                </Text>
              </Card>
            ) : (
              <div className="space-y-4">
                {listings.map(listing => (
                  <Card
                    key={listing.id}
                    variant={listing.is_highlighted ? 'feature' : 'elevated'}
                    className={`cursor-pointer hover:shadow-lg transition-shadow ${
                      listing.is_sticky ? 'border-2 border-yellow-400' : ''
                    }`}
                    onClick={() => onListingClick?.(listing)}
                  >
                    <div className="flex space-x-4">
                      {/* Listing Image */}
                      <div className="flex-shrink-0">
                        <img
                          src={
                            listing.images[0] || 'https://via.placeholder.com/120x80?text=No+Image'
                          }
                          alt={listing.title}
                          className="w-24 h-24 object-cover rounded-lg"
                        />
                      </div>

                      {/* Listing Details */}
                      <div className="flex-grow min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-grow min-w-0">
                            <h3 className="font-semibold text-lg truncate">{listing.title}</h3>
                            <p className="text-gray-600 text-sm line-clamp-2 mt-1">
                              {listing.description}
                            </p>
                            <div className="flex items-center mt-2 space-x-3">
                              <span className="text-lg font-bold text-green-600">
                                {formatPrice(listing.price_usd)}
                              </span>
                              <span className="text-sm text-gray-500">
                                📁 {listing.category.name}
                              </span>
                              {listing.is_sticky && (
                                <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                                  📌 Featured
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                          <span>👤 @{listing.contact_username}</span>
                          <span>👁️ {listing.view_count} views</span>
                          <span>⏰ {listing.time_left}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Search;
