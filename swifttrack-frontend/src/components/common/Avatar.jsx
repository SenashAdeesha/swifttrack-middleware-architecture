const sizes = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
};

const Avatar = ({ 
  src, 
  alt = '', 
  initials, 
  size = 'md',
  status,
  className = '' 
}) => {
  const statusColors = {
    online: 'bg-green-500',
    offline: 'bg-gray-400',
    busy: 'bg-red-500',
    away: 'bg-yellow-500',
  };

  return (
    <div className={`relative inline-flex ${className}`}>
      {src ? (
        <img
          src={src}
          alt={alt}
          className={`${sizes[size]} rounded-full object-cover`}
        />
      ) : (
        <div className={`
          ${sizes[size]} rounded-full 
          bg-gradient-to-br from-primary-500 to-secondary-500 
          flex items-center justify-center font-semibold text-white
        `}>
          {initials || alt?.charAt(0)?.toUpperCase() || '?'}
        </div>
      )}
      {status && (
        <span className={`
          absolute bottom-0 right-0 w-3 h-3 
          ${statusColors[status]} 
          rounded-full border-2 border-white dark:border-slate-800
        `} />
      )}
    </div>
  );
};

export default Avatar;
