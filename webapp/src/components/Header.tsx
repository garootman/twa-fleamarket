import React from 'react';
import { User } from '../api';

interface HeaderProps {
  user: User | null;
  onProfileClick: () => void;
}

function Header({ user, onProfileClick }: HeaderProps): JSX.Element {
  const getInitials = (user: User): string => {
    if (user.firstName) {
      const first = user.firstName.charAt(0).toUpperCase();
      const last = user.lastName ? user.lastName.charAt(0).toUpperCase() : '';
      return first + last;
    }
    return user.username ? user.username.charAt(0).toUpperCase() : '?';
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
        minHeight: '60px',
        borderBottom: '1px solid #e9ecef',
        backgroundColor: '#f8f9fa',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: '20px',
          fontWeight: 'bold',
        }}
      >
        Flea Market
      </h1>

      {user && (
        <div
          onClick={onProfileClick}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: '#007acc',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          {getInitials(user)}
        </div>
      )}
    </header>
  );
}

export default Header;
