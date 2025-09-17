import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Text, Avatar } from './ui';
import { Listing, User } from './ListingBrowse';

export interface ProfileProps {
  token: string;
  user: User;
  onEditListing?: (listing: Listing) => void;
  onCreateListing?: () => void;
  onBack?: () => void;
}

interface UserStats {
  total_listings: number;
  active_listings: number;
  sold_listings: number;
  total_views: number;
  member_since: string;
}

// Mock API functions - these should be replaced with actual API calls
const fetchUserListings = async (token: string): Promise<Listing[]> => {
  // TODO: Replace with actual API call to /api/me/listings
  await new Promise(resolve => setTimeout(resolve, 500));

  return [
    {
      id: '1',
      user_id: 123456789,
      category_id: 2,
      title: 'iPhone 15 Pro Max',
      description: 'Excellent condition, barely used.',
      price_usd: 899.99,
      images: ['https://via.placeholder.com/200x150?text=iPhone'],
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
      user_id: 123456789,
      category_id: 5,
      title: 'JavaScript: The Definitive Guide',
      description: 'Great book for learning JavaScript.',
      price_usd: 29.99,
      images: ['https://via.placeholder.com/200x150?text=Book'],
      created_at: '2024-01-10T14:30:00Z',
      expires_at: '2024-01-17T14:30:00Z',
      status: 'sold',
      is_sticky: false,
      is_highlighted: false,
      view_count: 23,
      contact_username: 'seller123',
      published_at: '2024-01-10T14:30:00Z',
      time_left: 'Sold',
      can_bump: false,
      user: {
        telegram_id: 123456789,
        username: 'seller123',
        first_name: 'John',
        last_name: 'Doe',
        is_admin: false,
      },
      category: { id: 5, name: 'Books', is_active: true },
    },
  ];
};

const fetchUserStats = async (token: string): Promise<UserStats> => {
  // TODO: Replace with actual API call
  await new Promise(resolve => setTimeout(resolve, 300));

  return {
    total_listings: 12,
    active_listings: 3,
    sold_listings: 8,
    total_views: 847,
    member_since: '2023-06-15',
  };
};

export function Profile({
  token,
  user,
  onEditListing,
  onCreateListing,
  onBack,
}: ProfileProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'active' | 'sold' | 'draft' | 'all'>('active');

  const listingsQuery = useQuery({
    queryKey: ['user-listings', token],
    queryFn: () => fetchUserListings(token),
  });

  const statsQuery = useQuery({
    queryKey: ['user-stats', token],
    queryFn: () => fetchUserStats(token),
  });

  const listings = listingsQuery.data || [];
  const stats = statsQuery.data;

  const filteredListings = listings.filter(listing => {
    switch (activeTab) {
      case 'active':
        return listing.status === 'active';
      case 'sold':
        return listing.status === 'sold';
      case 'draft':
        return listing.status === 'draft';
      default:
        return true;
    }
  });

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();

  const getStatusBadge = (status: string) => {
    const badges = {
      active: '🟢 Active',
      sold: '✅ Sold',
      draft: '📝 Draft',
      expired: '⏰ Expired',
      archived: '📦 Archived',
    };
    return badges[status as keyof typeof badges] || status;
  };

  const getStatusColor = (status: string) => {
    const colors = {
      active: 'text-green-600',
      sold: 'text-blue-600',
      draft: 'text-gray-600',
      expired: 'text-red-600',
      archived: 'text-gray-500',
    };
    return colors[status as keyof typeof colors] || 'text-gray-600';
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <Text variant="title">My Profile</Text>
          {onBack && (
            <Button variant="secondary" onClick={onBack} size="sm">
              ← Back
            </Button>
          )}
        </div>

        {/* User Info */}
        <div className="flex items-center space-x-4 mb-6">
          <Avatar
            src={user.profile_photo_url}
            alt={`${user.first_name} ${user.last_name || ''}`}
            size="lg"
          />
          <div>
            <h2 className="text-xl font-semibold">
              {user.first_name} {user.last_name || ''}
            </h2>
            <p className="text-gray-600">@{user.username}</p>
            {stats && (
              <p className="text-sm text-gray-500">Member since {formatDate(stats.member_since)}</p>
            )}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.total_listings}</div>
              <div className="text-sm text-gray-600">Total Listings</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.active_listings}</div>
              <div className="text-sm text-gray-600">Active</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.sold_listings}</div>
              <div className="text-sm text-gray-600">Sold</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.total_views}</div>
              <div className="text-sm text-gray-600">Total Views</div>
            </div>
          </div>
        )}

        {/* Create Listing Button */}
        {onCreateListing && (
          <Button variant="primary" onClick={onCreateListing} className="w-full">
            ➕ Create New Listing
          </Button>
        )}
      </Card>

      {/* Listings Section */}
      <Card>
        <Text variant="subtitle" className="mb-4">
          My Listings
        </Text>

        {/* Tab Navigation */}
        <div className="flex space-x-2 mb-4 border-b">
          {(['active', 'sold', 'draft', 'all'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              {tab}
              {tab !== 'all' && stats && (
                <span className="ml-1 text-xs">
                  (
                  {tab === 'active'
                    ? stats.active_listings
                    : tab === 'sold'
                      ? stats.sold_listings
                      : listings.filter(l => l.status === 'draft').length}
                  )
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {listingsQuery.isLoading && (
          <div className="text-center py-8">
            <Text>Loading your listings...</Text>
          </div>
        )}

        {/* Error State */}
        {listingsQuery.isError && (
          <div className="text-center py-8">
            <Text className="text-red-600">Error loading listings. Please try again.</Text>
          </div>
        )}

        {/* Listings */}
        {!listingsQuery.isLoading && !listingsQuery.isError && (
          <div className="space-y-4">
            {filteredListings.length === 0 ? (
              <div className="text-center py-8">
                <Text>No {activeTab !== 'all' ? activeTab : ''} listings found</Text>
                {onCreateListing && activeTab === 'active' && (
                  <Button variant="primary" onClick={onCreateListing} className="mt-4">
                    Create Your First Listing
                  </Button>
                )}
              </div>
            ) : (
              filteredListings.map(listing => (
                <Card key={listing.id} variant="elevated" className="p-4">
                  <div className="flex space-x-4">
                    {/* Listing Image */}
                    <div className="flex-shrink-0">
                      <img
                        src={
                          listing.images[0] || 'https://via.placeholder.com/100x80?text=No+Image'
                        }
                        alt={listing.title}
                        className="w-20 h-20 object-cover rounded-lg"
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
                          <div className="flex items-center mt-2 space-x-4">
                            <span className="font-bold text-green-600">
                              {formatPrice(listing.price_usd)}
                            </span>
                            <span
                              className={`text-sm font-medium ${getStatusColor(listing.status)}`}
                            >
                              {getStatusBadge(listing.status)}
                            </span>
                          </div>
                        </div>

                        {/* Action Button */}
                        {onEditListing && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onEditListing(listing)}
                          >
                            Edit
                          </Button>
                        )}
                      </div>

                      {/* Listing Stats */}
                      <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                        <span>Created {formatDate(listing.created_at)}</span>
                        <span>👁️ {listing.view_count} views</span>
                        {listing.status === 'active' && <span>{listing.time_left}</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export default Profile;
