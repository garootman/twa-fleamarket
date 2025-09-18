import { ReactNode } from 'react';
import { useWebApp } from '@vkruglikov/react-telegram-web-app';

interface LayoutProps {
  children: ReactNode;
  className?: string;
  fullHeight?: boolean;
  padding?: boolean;
  style?: React.CSSProperties;
}

export function Layout({
  children,
  className = '',
  fullHeight = true,
  padding = true,
  style,
}: LayoutProps) {
  const { themeParams } = useWebApp();

  return (
    <div
      className={`
        w-full
        ${fullHeight ? 'min-h-screen' : ''}
        ${padding ? 'px-4 py-2' : ''}
        ${className}
      `}
      style={{
        backgroundColor: themeParams?.bg_color || '#ffffff',
        color: themeParams?.text_color || '#000000',
        paddingBottom: padding ? 'max(0.5rem, env(safe-area-inset-bottom))' : undefined,
        maxWidth: 'none',
        margin: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface CenterLayoutProps {
  children: ReactNode;
  className?: string;
}

export function CenterLayout({ children, className = '' }: CenterLayoutProps) {
  return (
    <Layout
      className={`flex flex-col items-center justify-center text-center ${className}`}
      fullHeight={true}
      padding={true}
    >
      {children}
    </Layout>
  );
}
