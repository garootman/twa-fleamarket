import { ReactNode } from 'react';
import { useWebApp } from '@vkruglikov/react-telegram-web-app';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  as?: 'button' | 'a';
  href?: string;
  target?: string;
  rel?: string;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  as = 'button',
  href,
  target,
  rel,
}: ButtonProps) {
  const { themeParams } = useWebApp();

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  const baseClasses =
    'border-none rounded-xl font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 inline-block text-center no-underline transition-all duration-200 hover:transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md';

  const commonProps = {
    className: `${baseClasses} ${sizeClasses[size]} ${className}`,
    style: {
      backgroundColor:
        variant === 'primary'
          ? themeParams?.button_color || '#007acc'
          : themeParams?.secondary_bg_color || '#f8f9fa',
      color:
        variant === 'primary'
          ? themeParams?.button_text_color || '#ffffff'
          : themeParams?.text_color || '#000000',
    },
  };

  if (as === 'a') {
    return (
      <a {...commonProps} href={href} target={target} rel={rel} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <button {...commonProps} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
