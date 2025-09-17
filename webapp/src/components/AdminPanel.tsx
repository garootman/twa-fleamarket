import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Text } from './ui';
import { Listing, User } from './ListingBrowse';

export interface AdminPanelProps {
  token: string;
  currentUser: User;
  onBack?: () => void;
}

interface FlaggedListing extends Listing {
  flags: {
    id: string;
    reason: string;
    description?: string;
    reporter_id: number;
    created_at: string;
  }[];
}

interface BlockedWord {
  id: number;
  word: string;
  created_at: string;
}

interface ModerationStats {
  pending_flags: number;
  total_listings: number;
  banned_users: number;
  blocked_words: number;
}

// Mock API functions - these should be replaced with actual API calls
const fetchModerationStats = async (token: string): Promise<ModerationStats> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  return {
    pending_flags: 3,
    total_listings: 145,
    banned_users: 2,
    blocked_words: 15,
  };
};

const fetchFlaggedListings = async (token: string): Promise<FlaggedListing[]> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return [
    {
      id: '1',
      user_id: 987654321,
      category_id: 2,
      title: 'iPhone 15 Pro Max - Best Deal Ever!!!',
      description: 'Brand new iPhone, never used, best price guaranteed!',
      price_usd: 299.99,
      images: ['https://via.placeholder.com/200x150?text=iPhone'],
      created_at: '2024-01-15T10:00:00Z',
      expires_at: '2024-01-22T10:00:00Z',
      status: 'active',
      is_sticky: false,
      is_highlighted: false,
      view_count: 85,
      contact_username: 'suspicious_seller',
      published_at: '2024-01-15T10:00:00Z',
      time_left: '2 days left',
      can_bump: true,
      user: {
        telegram_id: 987654321,
        username: 'suspicious_seller',
        first_name: 'Bob',
        last_name: 'Smith',
        is_admin: false,
      },
      category: { id: 2, name: 'Phones', parent_id: 1, is_active: true },
      flags: [
        {
          id: 'flag1',
          reason: 'fake',
          description: 'Price seems too good to be true',
          reporter_id: 123456789,
          created_at: '2024-01-16T09:00:00Z',
        },
        {
          id: 'flag2',
          reason: 'spam',
          description: 'Multiple exclamation marks and suspicious claims',
          reporter_id: 456789123,
          created_at: '2024-01-16T11:30:00Z',
        },
      ],
    },
  ];
};

const fetchBlockedWords = async (token: string): Promise<BlockedWord[]> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  return [
    { id: 1, word: 'scam', created_at: '2024-01-01T00:00:00Z' },
    { id: 2, word: 'fake', created_at: '2024-01-01T00:00:00Z' },
    { id: 3, word: 'stolen', created_at: '2024-01-01T00:00:00Z' },
  ];
};

const moderateListing = async (listingId: string, action: string, token: string): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log(`Moderated listing ${listingId} with action: ${action}`);
};

const banUser = async (userId: number, reason: string, token: string): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log(`Banned user ${userId} for: ${reason}`);
};

const addBlockedWord = async (word: string, token: string): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  console.log(`Added blocked word: ${word}`);
};

const removeBlockedWord = async (wordId: number, token: string): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  console.log(`Removed blocked word ID: ${wordId}`);
};

export function AdminPanel({ token, currentUser, onBack }: AdminPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'overview' | 'flags' | 'words' | 'users'>('overview');
  const [newBlockedWord, setNewBlockedWord] = useState('');
  const [banReason, setBanReason] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const queryClient = useQueryClient();

  // Verify admin access
  if (!currentUser.is_admin) {
    return (
      <div className="p-4">
        <Card variant="elevated" className="text-center py-8">
          <Text className="text-red-600">Access denied. Admin privileges required.</Text>
          {onBack && (
            <Button variant="secondary" onClick={onBack} className="mt-4">
              ← Back
            </Button>
          )}
        </Card>
      </div>
    );
  }

  const statsQuery = useQuery({
    queryKey: ['admin-stats', token],
    queryFn: () => fetchModerationStats(token),
  });

  const flaggedListingsQuery = useQuery({
    queryKey: ['flagged-listings', token],
    queryFn: () => fetchFlaggedListings(token),
    enabled: activeTab === 'flags',
  });

  const blockedWordsQuery = useQuery({
    queryKey: ['blocked-words', token],
    queryFn: () => fetchBlockedWords(token),
    enabled: activeTab === 'words',
  });

  const moderationMutation = useMutation({
    mutationFn: ({ listingId, action }: { listingId: string; action: string }) =>
      moderateListing(listingId, action, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flagged-listings'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const banMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: number; reason: string }) =>
      banUser(userId, reason, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flagged-listings'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const addWordMutation = useMutation({
    mutationFn: (word: string) => addBlockedWord(word, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-words'] });
      setNewBlockedWord('');
    },
  });

  const removeWordMutation = useMutation({
    mutationFn: (wordId: number) => removeBlockedWord(wordId, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-words'] });
    },
  });

  const stats = statsQuery.data;
  const flaggedListings = flaggedListingsQuery.data || [];
  const blockedWords = blockedWordsQuery.data || [];

  const handleModeration = (listingId: string, action: string) => {
    if (confirm(`Are you sure you want to ${action} this listing?`)) {
      moderationMutation.mutate({ listingId, action });
    }
  };

  const handleBanUser = (userId: number) => {
    if (!banReason.trim()) {
      alert('Please provide a reason for banning this user.');
      return;
    }
    if (confirm(`Are you sure you want to ban this user?`)) {
      banMutation.mutate({ userId, reason: banReason });
      setBanReason('');
      setSelectedUserId(null);
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Header */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <Text variant="title">🔧 Admin Panel</Text>
          {onBack && (
            <Button variant="secondary" onClick={onBack} size="sm">
              ← Back
            </Button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-2 border-b">
          {(['overview', 'flags', 'words', 'users'] as const).map(tab => (
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
              {tab === 'flags' && stats && stats.pending_flags > 0 && (
                <span className="ml-1 bg-red-500 text-white text-xs px-1 rounded-full">
                  {stats.pending_flags}
                </span>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <Card>
          <Text variant="subtitle" className="mb-4">
            Moderation Overview
          </Text>

          {stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{stats.pending_flags}</div>
                <div className="text-sm text-gray-600">Pending Flags</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.total_listings}</div>
                <div className="text-sm text-gray-600">Total Listings</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{stats.banned_users}</div>
                <div className="text-sm text-gray-600">Banned Users</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{stats.blocked_words}</div>
                <div className="text-sm text-gray-600">Blocked Words</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Text>Loading statistics...</Text>
            </div>
          )}
        </Card>
      )}

      {/* Flagged Listings Tab */}
      {activeTab === 'flags' && (
        <Card>
          <Text variant="subtitle" className="mb-4">
            Flagged Listings
          </Text>

          {flaggedListingsQuery.isLoading ? (
            <div className="text-center py-8">
              <Text>Loading flagged listings...</Text>
            </div>
          ) : flaggedListings.length === 0 ? (
            <div className="text-center py-8">
              <Text>No flagged listings found</Text>
            </div>
          ) : (
            <div className="space-y-4">
              {flaggedListings.map(listing => (
                <Card key={listing.id} variant="elevated" className="p-4">
                  <div className="flex space-x-4">
                    <img
                      src={listing.images[0] || 'https://via.placeholder.com/100x80?text=No+Image'}
                      alt={listing.title}
                      className="w-20 h-20 object-cover rounded-lg"
                    />

                    <div className="flex-grow">
                      <h3 className="font-semibold text-lg">{listing.title}</h3>
                      <p className="text-gray-600 text-sm">{listing.description}</p>
                      <p className="text-green-600 font-bold">${listing.price_usd}</p>
                      <p className="text-sm text-gray-500">
                        By @{listing.contact_username} • {formatDate(listing.created_at)}
                      </p>

                      {/* Flags */}
                      <div className="mt-2">
                        <Text className="text-sm font-medium mb-1">
                          Flags ({listing.flags.length}):
                        </Text>
                        {listing.flags.map(flag => (
                          <div key={flag.id} className="text-xs bg-red-50 p-2 rounded mb-1">
                            <span className="font-medium capitalize">{flag.reason}</span>
                            {flag.description && <span> - {flag.description}</span>}
                            <span className="text-gray-500"> ({formatDate(flag.created_at)})</span>
                          </div>
                        ))}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex space-x-2 mt-3">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleModeration(listing.id, 'approve')}
                          disabled={moderationMutation.isPending}
                        >
                          ✅ Approve
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleModeration(listing.id, 'hide')}
                          disabled={moderationMutation.isPending}
                        >
                          🙈 Hide
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleModeration(listing.id, 'remove')}
                          disabled={moderationMutation.isPending}
                        >
                          🗑️ Remove
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedUserId(listing.user_id)}
                        >
                          🚫 Ban User
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Blocked Words Tab */}
      {activeTab === 'words' && (
        <Card>
          <Text variant="subtitle" className="mb-4">
            Content Filter - Blocked Words
          </Text>

          {/* Add New Word */}
          <div className="mb-6">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newBlockedWord}
                onChange={e => setNewBlockedWord(e.target.value)}
                placeholder="Add blocked word"
                className="flex-1 p-2 border rounded-lg"
              />
              <Button
                variant="primary"
                onClick={() => addWordMutation.mutate(newBlockedWord)}
                disabled={!newBlockedWord.trim() || addWordMutation.isPending}
              >
                {addWordMutation.isPending ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </div>

          {/* Blocked Words List */}
          {blockedWordsQuery.isLoading ? (
            <div className="text-center py-8">
              <Text>Loading blocked words...</Text>
            </div>
          ) : (
            <div className="space-y-2">
              {blockedWords.map(word => (
                <div
                  key={word.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <span className="font-medium">{word.word}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      Added {formatDate(word.created_at)}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => removeWordMutation.mutate(word.id)}
                    disabled={removeWordMutation.isPending}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Ban User Modal */}
      {selectedUserId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <Text variant="subtitle" className="mb-4">
              Ban User
            </Text>

            <textarea
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              placeholder="Reason for banning this user"
              className="w-full p-2 border rounded-lg mb-4"
              rows={3}
            />

            <div className="flex space-x-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedUserId(null);
                  setBanReason('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleBanUser(selectedUserId)}
                disabled={!banReason.trim() || banMutation.isPending}
                className="flex-1"
              >
                {banMutation.isPending ? 'Banning...' : 'Ban User'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
