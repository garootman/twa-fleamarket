import React from 'react';
import { User } from '../api';
import { BackButton } from '@vkruglikov/react-telegram-web-app';

interface MePageProps {
  user: User;
  onBack: () => void;
  onHome: () => void;
}

function MePage({ user, onBack, onHome }: MePageProps): JSX.Element {
  const getInitials = (user: User): string => {
    if (user.firstName) {
      const first = user.firstName.charAt(0).toUpperCase();
      const last = user.lastName ? user.lastName.charAt(0).toUpperCase() : '';
      return first + last;
    }
    return user.username ? user.username.charAt(0).toUpperCase() : '?';
  };

  const getDisplayName = (user: User): string => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) {
      return user.firstName;
    }
    return 'Unnamed User';
  };

  return (
    <div style={{ padding: '16px', maxWidth: '100%' }}>
      <BackButton onClick={onBack} />

      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        {/* User Avatar */}
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            backgroundColor: '#007acc',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            fontWeight: 'bold',
            margin: '0 auto 20px auto',
          }}
        >
          {getInitials(user)}
        </div>

        {/* User Name */}
        <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 'bold' }}>
          {getDisplayName(user)}
        </h2>

        {/* Username */}
        {user.username && (
          <p style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#666' }}>@{user.username}</p>
        )}

        {/* Telegram ID */}
        <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#888' }}>
          Telegram ID: {user.telegramId}
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={onBack}
            style={{
              padding: '12px 20px',
              backgroundColor: '#f0f0f0',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            Back
          </button>
          <button
            onClick={onHome}
            style={{
              padding: '12px 20px',
              backgroundColor: '#007acc',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default MePage;
