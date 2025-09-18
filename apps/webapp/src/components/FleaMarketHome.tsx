import React, { useState } from 'react';
import { User } from '../api';
import ListingBrowse, { Listing } from './ListingBrowse';
import ListingDetail from './ListingDetail';
import CreateListing from './CreateListing';

interface FleaMarketHomeProps {
  user: User;
}

function FleaMarketHome({ user }: FleaMarketHomeProps): JSX.Element {
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [showCreateListing, setShowCreateListing] = useState(false);
  const [token] = useState('dev-bypass-token'); // Using mock token for dev

  if (selectedListing) {
    return (
      <ListingDetail
        listing={selectedListing}
        token={token}
        onBack={() => setSelectedListing(null)}
        onContactSeller={() => {
          // Handle contact seller logic
          console.log('Contact seller:', selectedListing.user);
        }}
      />
    );
  }

  if (showCreateListing) {
    return (
      <CreateListing
        token={token}
        onBack={() => setShowCreateListing(false)}
        onSuccess={() => {
          setShowCreateListing(false);
          // Refresh listings
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center p-4 border-b">
        <h1 className="text-2xl font-bold">🏪 Flea Market</h1>
        <button
          onClick={() => setShowCreateListing(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          + Create Listing
        </button>
      </div>
      <div className="flex-1">
        <ListingBrowse
          token={token}
          onListingClick={setSelectedListing}
        />
      </div>
    </div>
  );
}

export default FleaMarketHome;
