import { useWebApp } from '@vkruglikov/react-telegram-web-app';

interface AvatarProps {
  initials: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
}

export function Avatar({ initials, size = 'md', className = '', onClick }: AvatarProps) {
  const { themeParams } = useWebApp();

  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-16 h-16 text-2xl',
    xl: 'w-20 h-20 text-3xl',
  };

  const borderWidth = {
    sm: 'border',
    md: 'border-2',
    lg: 'border-2',
    xl: 'border-3',
  };

  return (
    <div
      className={`
        rounded-full flex items-center justify-center font-bold 
        ${sizeClasses[size]} ${borderWidth[size]} ${className}
        ${onClick ? 'cursor-pointer' : ''}
      `}
      style={{
        backgroundColor: themeParams?.button_color || '#007acc',
        color: themeParams?.button_text_color || '#ffffff',
        borderColor: themeParams?.hint_color || '#999999',
      }}
      onClick={onClick}
    >
      {initials}
    </div>
  );
}
