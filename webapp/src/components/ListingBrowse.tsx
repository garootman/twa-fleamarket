import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Text } from './ui';

// Types based on API schema
export interface Category {
  id: number;
  name: string;
  parent_id?: number;
  description?: string;
  is_active: boolean;
}

export interface User {
  telegram_id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  profile_photo_url?: string;
  is_admin: boolean;
}

export interface Listing {
  id: string;
  user_id: number;
  category_id: number;
  title: string;
  description: string;
  price_usd: number;
  images: string[];
  created_at: string;
  expires_at: string;
  status: 'draft' | 'active' | 'expired' | 'sold' | 'archived' | 'hidden';
  is_sticky: boolean;
  is_highlighted: boolean;
  view_count: number;
  contact_username: string;
  published_at?: string;
  time_left: string;
  can_bump: boolean;
  user: User;
  category: Category;
}

export interface ListingBrowseProps {
  token: string;
  onListingClick?: (listing: Listing) => void;
  onCategorySelect?: (categoryId: number | null) => void;
}

// Mock API functions - these should be replaced with actual API calls
const fetchCategories = async (): Promise<Category[]> => {
  // TODO: Replace with actual API call
  return [
    { id: 1, name: 'Electronics', parent_id: undefined, is_active: true },
    { id: 2, name: 'Phones', parent_id: 1, is_active: true },
    { id: 3, name: 'Laptops', parent_id: 1, is_active: true },
    { id: 4, name: 'Clothing', parent_id: undefined, is_active: true },
    { id: 5, name: 'Books', parent_id: undefined, is_active: true },
  ];
};

const fetchListings = async (categoryId?: number, search?: string): Promise<Listing[]> => {
  // TODO: Replace with actual API call
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay

  const mockListings: Listing[] = [
    {
      id: '1',
      user_id: 123456789,
      category_id: 2,
      title: 'iPhone 15 Pro Max',
      description: 'Excellent condition, barely used. All accessories included.',
      price_usd: 899.99,
      images: ['https://via.placeholder.com/300x200?text=iPhone'],
      created_at: '2024-01-15T10:00:00Z',
      expires_at: '2024-01-22T10:00:00Z',
      status: 'active',
      is_sticky: false,
      is_highlighted: false,
      view_count: 45,
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
      title: 'MacBook Pro M3',
      description: 'Perfect for work and creative projects. 16GB RAM, 512GB SSD.',
      price_usd: 1599.0,
      images: ['https://via.placeholder.com/300x200?text=MacBook'],
      created_at: '2024-01-14T15:30:00Z',
      expires_at: '2024-01-21T15:30:00Z',
      status: 'active',
      is_sticky: true,
      is_highlighted: true,
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
  ];

  // Filter by category if specified
  if (categoryId) {
    return mockListings.filter(listing => listing.category_id === categoryId);
  }

  // Filter by search if specified
  if (search) {
    const searchLower = search.toLowerCase();
    return mockListings.filter(
      listing =>
        listing.title.toLowerCase().includes(searchLower) ||
        listing.description.toLowerCase().includes(searchLower)
    );
  }

  return mockListings;
};

export function ListingBrowse({
  token,
  onListingClick,
  onCategorySelect,
}: ListingBrowseProps): JSX.Element {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });

  const listingsQuery = useQuery({
    queryKey: ['listings', selectedCategoryId, searchQuery],
    queryFn: () => fetchListings(selectedCategoryId || undefined, searchQuery || undefined),
  });

  const categories = categoriesQuery.data || [];
  const listings = listingsQuery.data || [];

  // Organize categories into parent-child structure
  const parentCategories = categories.filter(cat => !cat.parent_id);
  const getChildCategories = (parentId: number) =>
    categories.filter(cat => cat.parent_id === parentId);

  const handleCategorySelect = (categoryId: number | null) => {
    setSelectedCategoryId(categoryId);
    onCategorySelect?.(categoryId);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  const formatTimeLeft = (timeLeft: string) => {
    if (timeLeft.includes('expired')) return '⏰ Expired';
    return `⏱️ ${timeLeft}`;
  };

  return (
    <div className="space-y-4 p-4">
      {/* Search Bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search listings..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="w-full px-4 py-2 border rounded-lg"
        />
      </div>

      {/* Category Filter */}
      <Card className="mb-4">
        <Text variant="subtitle" className="mb-3">
          Categories
        </Text>
        <div className="space-y-2">
          <Button
            variant={selectedCategoryId === null ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handleCategorySelect(null)}
            className="mr-2 mb-2"
          >
            All Categories
          </Button>

          {parentCategories.map(parentCategory => (
            <div key={parentCategory.id} className="space-y-1">
              <Button
                variant={selectedCategoryId === parentCategory.id ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => handleCategorySelect(parentCategory.id)}
                className="mr-2 mb-2"
              >
                📁 {parentCategory.name}
              </Button>

              {getChildCategories(parentCategory.id).map(childCategory => (
                <Button
                  key={childCategory.id}
                  variant={selectedCategoryId === childCategory.id ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleCategorySelect(childCategory.id)}
                  className="ml-4 mr-2 mb-2"
                >
                  📄 {childCategory.name}
                </Button>
              ))}
            </div>
          ))}
        </div>
      </Card>

      {/* Loading State */}
      {listingsQuery.isLoading && (
        <div className="text-center py-8">
          <Text>Loading listings...</Text>
        </div>
      )}

      {/* Error State */}
      {listingsQuery.isError && (
        <Card variant="elevated" className="text-center py-8">
          <Text className="text-red-600">Error loading listings. Please try again.</Text>
        </Card>
      )}

      {/* Listings Grid */}
      {!listingsQuery.isLoading && !listingsQuery.isError && (
        <div className="space-y-4">
          {listings.length === 0 ? (
            <Card variant="elevated" className="text-center py-8">
              <Text>No listings found</Text>
              {selectedCategoryId && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCategorySelect(null)}
                  className="mt-2"
                >
                  Show all categories
                </Button>
              )}
            </Card>
          ) : (
            listings.map(listing => (
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
                      src={listing.images[0] || 'https://via.placeholder.com/120x80?text=No+Image'}
                      alt={listing.title}
                      className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg"
                    />
                  </div>

                  {/* Listing Details */}
                  <div className="flex-grow min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-grow min-w-0">
                        <h3 className="font-semibold text-lg truncate">{listing.title}</h3>
                        <p className="text-sm text-gray-600 line-clamp-2 mt-1">
                          {listing.description}
                        </p>
                        <div className="flex items-center mt-2 space-x-2">
                          <span className="text-lg font-bold text-green-600">
                            {formatPrice(listing.price_usd)}
                          </span>
                          {listing.is_sticky && (
                            <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                              📌 Sticky
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                      <span>👤 @{listing.contact_username}</span>
                      <span>{formatTimeLeft(listing.time_left)}</span>
                      <span>👁️ {listing.view_count} views</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default ListingBrowse;
