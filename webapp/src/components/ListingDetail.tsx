import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Text, Avatar } from './ui';
import { Listing, User } from './ListingBrowse';

export interface ListingDetailProps {
  listingId: string;
  token: string;
  currentUser?: User;
  onBack?: () => void;
  onContact?: (username: string) => void;
  onFlag?: (listingId: string) => void;
  onEdit?: (listing: Listing) => void;
}

// Mock API functions - these should be replaced with actual API calls
const fetchListingById = async (listingId: string): Promise<Listing> => {
  // TODO: Replace with actual API call
  await new Promise(resolve => setTimeout(resolve, 300)); // Simulate API delay

  // Mock listing data
  return {
    id: listingId,
    user_id: 123456789,
    category_id: 2,
    title: 'iPhone 15 Pro Max 256GB',
    description: `Excellent condition iPhone 15 Pro Max in Natural Titanium.

Features:
• 256GB storage
• Dual eSIM support
• All original accessories included
• Screen protector applied since day one
• Always kept in a case

No scratches, dents, or signs of wear. Adult owned, non-smoking household.

Original receipt available for warranty purposes. Selling because I upgraded to iPhone 16 Pro Max.

Serious buyers only. Cash or Apple Pay preferred.`,
    price_usd: 899.99,
    images: [
      'https://via.placeholder.com/400x300?text=iPhone+Front',
      'https://via.placeholder.com/400x300?text=iPhone+Back',
      'https://via.placeholder.com/400x300?text=iPhone+Side',
      'https://via.placeholder.com/400x300?text=Accessories',
    ],
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
      profile_photo_url: 'https://via.placeholder.com/50x50?text=JD',
      is_admin: false,
    },
    category: { id: 2, name: 'Phones', parent_id: 1, is_active: true },
  };
};

const bumpListing = async (listingId: string, token: string): Promise<void> => {
  // TODO: Replace with actual API call
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('Bumped listing:', listingId);
};

const flagListing = async (listingId: string, reason: string, token: string): Promise<void> => {
  // TODO: Replace with actual API call
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('Flagged listing:', listingId, reason);
};

export function ListingDetail({
  listingId,
  token,
  currentUser,
  onBack,
  onContact,
  onFlag,
  onEdit,
}: ListingDetailProps): JSX.Element {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  const queryClient = useQueryClient();

  const listingQuery = useQuery({
    queryKey: ['listing', listingId],
    queryFn: () => fetchListingById(listingId),
  });

  const bumpMutation = useMutation({
    mutationFn: () => bumpListing(listingId, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
      alert('Listing bumped successfully!');
    },
    onError: error => {
      alert(`Failed to bump listing: ${error.message}`);
    },
  });

  const flagMutation = useMutation({
    mutationFn: (reason: string) => flagListing(listingId, reason, token),
    onSuccess: () => {
      setShowFlagModal(false);
      setFlagReason('');
      alert('Listing flagged successfully. Thank you for keeping our marketplace safe.');
    },
    onError: error => {
      alert(`Failed to flag listing: ${error.message}`);
    },
  });

  const listing = listingQuery.data;

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();

  const isOwner = currentUser && listing && currentUser.telegram_id === listing.user_id;

  const handleImageChange = (direction: 'prev' | 'next') => {
    if (!listing?.images) return;

    if (direction === 'prev') {
      setCurrentImageIndex(prev => (prev === 0 ? listing.images.length - 1 : prev - 1));
    } else {
      setCurrentImageIndex(prev => (prev === listing.images.length - 1 ? 0 : prev + 1));
    }
  };

  const handleFlag = () => {
    if (!flagReason.trim()) {
      alert('Please select a reason for flagging this listing.');
      return;
    }
    flagMutation.mutate(flagReason);
  };

  if (listingQuery.isLoading) {
    return (
      <div className="p-4">
        <div className="text-center py-8">
          <Text>Loading listing...</Text>
        </div>
      </div>
    );
  }

  if (listingQuery.isError || !listing) {
    return (
      <div className="p-4">
        <Card variant="elevated" className="text-center py-8">
          <Text className="text-red-600">
            Error loading listing. It may have been removed or doesn't exist.
          </Text>
          {onBack && (
            <Button variant="secondary" onClick={onBack} className="mt-4">
              ← Back to listings
            </Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header with back button */}
      {onBack && (
        <div className="mb-4">
          <Button variant="secondary" onClick={onBack} size="sm">
            ← Back to listings
          </Button>
        </div>
      )}

      {/* Image Gallery */}
      <Card className="mb-4 p-0 overflow-hidden">
        <div className="relative">
          <img
            src={listing.images[currentImageIndex]}
            alt={`${listing.title} - Image ${currentImageIndex + 1}`}
            className="w-full h-64 sm:h-80 object-cover"
          />

          {listing.images.length > 1 && (
            <>
              {/* Previous button */}
              <button
                onClick={() => handleImageChange('prev')}
                className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-opacity"
              >
                ←
              </button>

              {/* Next button */}
              <button
                onClick={() => handleImageChange('next')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-opacity"
              >
                →
              </button>

              {/* Image indicators */}
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1">
                {listing.images.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentImageIndex ? 'bg-white' : 'bg-white bg-opacity-50'
                    }`}
                  />
                ))}
              </div>
            </>
          )}

          {/* Image counter */}
          <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
            {currentImageIndex + 1} / {listing.images.length}
          </div>
        </div>
      </Card>

      {/* Listing Details */}
      <Card className="mb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-grow">
            <h1 className="text-2xl font-bold mb-2">{listing.title}</h1>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>📁 {listing.category.name}</span>
              <span>👁️ {listing.view_count} views</span>
              <span>📅 {formatDate(listing.created_at)}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-green-600 mb-1">
              {formatPrice(listing.price_usd)}
            </div>
            {listing.is_sticky && (
              <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                📌 Featured
              </span>
            )}
          </div>
        </div>

        <div className="text-gray-700 whitespace-pre-line mb-6">{listing.description}</div>

        {/* Time remaining */}
        <div className="bg-gray-50 p-3 rounded-lg mb-4">
          <Text className="text-sm text-gray-600">⏱️ {listing.time_left}</Text>
        </div>
      </Card>

      {/* Seller Information */}
      <Card className="mb-4">
        <Text variant="subtitle" className="mb-3">
          Seller Information
        </Text>
        <div className="flex items-center space-x-3">
          <Avatar
            src={listing.user.profile_photo_url}
            alt={`${listing.user.first_name} ${listing.user.last_name || ''}`}
            size="md"
          />
          <div>
            <div className="font-semibold">
              {listing.user.first_name} {listing.user.last_name || ''}
            </div>
            <div className="text-sm text-gray-600">@{listing.contact_username}</div>
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <Card>
        <div className="space-y-3">
          {isOwner ? (
            // Owner actions
            <>
              <Button variant="primary" onClick={() => onEdit?.(listing)} className="w-full">
                ✏️ Edit Listing
              </Button>

              {listing.can_bump && (
                <Button
                  variant="secondary"
                  onClick={() => bumpMutation.mutate()}
                  disabled={bumpMutation.isPending}
                  className="w-full"
                >
                  {bumpMutation.isPending ? 'Bumping...' : '⬆️ Bump Listing'}
                </Button>
              )}
            </>
          ) : (
            // Buyer actions
            <>
              <Button
                variant="primary"
                onClick={() => onContact?.(listing.contact_username)}
                className="w-full"
              >
                💬 Contact Seller
              </Button>

              <div className="flex space-x-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowFlagModal(true)}
                  size="sm"
                  className="flex-1"
                >
                  🚩 Report
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Flag Modal */}
      {showFlagModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <Text variant="subtitle" className="mb-4">
              Report Listing
            </Text>

            <div className="space-y-2 mb-4">
              {['spam', 'inappropriate', 'fake', 'other'].map(reason => (
                <label key={reason} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="flagReason"
                    value={reason}
                    checked={flagReason === reason}
                    onChange={e => setFlagReason(e.target.value)}
                    className="form-radio"
                  />
                  <span className="capitalize">{reason}</span>
                </label>
              ))}
            </div>

            <div className="flex space-x-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowFlagModal(false);
                  setFlagReason('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleFlag}
                disabled={!flagReason || flagMutation.isPending}
                className="flex-1"
              >
                {flagMutation.isPending ? 'Reporting...' : 'Report'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default ListingDetail;
