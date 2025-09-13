import React from 'react';
import { User } from '../api';

interface FleaMarketHomeProps {
  user: User;
}

function FleaMarketHome({ user: _user }: FleaMarketHomeProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        minHeight: '100vh',
        textAlign: 'center',
        padding: '20px',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: '48px',
            margin: '0 0 20px 0',
            fontWeight: 'bold',
          }}
        >
          🚧
        </h1>
        <h2
          style={{
            fontSize: '32px',
            margin: '0 0 10px 0',
            fontWeight: 'bold',
          }}
        >
          Coming Soon
        </h2>
        <p
          style={{
            fontSize: '18px',
            color: '#666',
            margin: '0',
          }}
        >
          We&apos;re working hard to bring you the best marketplace experience.
        </p>
      </div>
    </div>
  );
}

export default FleaMarketHome;
