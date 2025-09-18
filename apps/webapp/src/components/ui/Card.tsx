import { ReactNode } from 'react';
import { useWebApp } from '@vkruglikov/react-telegram-web-app';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'elevated' | 'feature';
}

export function Card({ children, className = '', padding = 'md', variant = 'default' }: CardProps) {
  const { themeParams } = useWebApp();

  const paddingClasses = {
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-6',
  };

  const variantClasses = {
    default: 'rounded-xl border',
    elevated: 'rounded-2xl shadow-lg border-0',
    feature:
      'rounded-2xl shadow-lg border-0 hover:shadow-xl transition-all duration-300 hover:scale-105',
  };

  const getBackgroundStyle = () => {
    const baseColor = themeParams?.secondary_bg_color || '#f8f9fa';

    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: baseColor,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        };
      case 'feature':
        return {
          background: `linear-gradient(145deg, ${baseColor}, ${adjustColorBrightness(baseColor, 0.95)})`,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
        };
      default:
        return {
          backgroundColor: baseColor,
          borderColor: themeParams?.hint_color || '#e9ecef',
        };
    }
  };

  return (
    <div
      className={`${variantClasses[variant]} ${paddingClasses[padding]} ${className}`}
      style={getBackgroundStyle()}
    >
      {children}
    </div>
  );
}

// Helper function to adjust color brightness
function adjustColorBrightness(color: string, factor: number): string {
  // Simple brightness adjustment for hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const num = parseInt(hex, 16);
    const r = Math.floor((num >> 16) * factor);
    const g = Math.floor(((num >> 8) & 0x00ff) * factor);
    const b = Math.floor((num & 0x0000ff) * factor);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }
  // Fallback for non-hex colors
  return color;
}
