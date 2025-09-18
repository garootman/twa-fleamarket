import { ReactNode } from 'react';
import { useWebApp } from '@vkruglikov/react-telegram-web-app';

interface TextProps {
  children: ReactNode;
  variant?: 'body' | 'caption' | 'label' | 'heading' | 'title';
  color?: 'primary' | 'secondary' | 'hint';
  className?: string;
}

export function Text({ children, variant = 'body', color = 'primary', className = '' }: TextProps) {
  const { themeParams } = useWebApp();

  const variantClasses = {
    title: 'text-2xl font-semibold',
    heading: 'text-xl font-semibold',
    body: 'text-base',
    caption: 'text-sm',
    label: 'text-sm uppercase tracking-wide',
  };

  const getColor = () => {
    switch (color) {
      case 'primary':
        return themeParams?.text_color || '#000000';
      case 'secondary':
        return themeParams?.text_color || '#000000';
      case 'hint':
        return themeParams?.hint_color || '#6c757d';
      default:
        return themeParams?.text_color || '#000000';
    }
  };

  return (
    <div className={`${variantClasses[variant]} ${className}`} style={{ color: getColor() }}>
      {children}
    </div>
  );
}
