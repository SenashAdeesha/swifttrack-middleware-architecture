const Card = ({ 
  children, 
  className = '', 
  hover = false, 
  gradient = false,
  padding = 'default',
  ...props 
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    default: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      className={`
        bg-white dark:bg-slate-800 rounded-2xl 
        border border-gray-100 dark:border-slate-700
        ${hover ? 'transition-all duration-300 hover:shadow-soft-lg hover:-translate-y-1 cursor-pointer' : 'shadow-soft'}
        ${gradient ? 'bg-gradient-to-br from-white to-gray-50 dark:from-slate-800 dark:to-slate-900' : ''}
        ${paddingClasses[padding]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = '' }) => (
  <div className={`mb-4 ${className}`}>
    {children}
  </div>
);

export const CardTitle = ({ children, className = '' }) => (
  <h3 className={`text-lg font-semibold text-gray-900 dark:text-white ${className}`}>
    {children}
  </h3>
);

export const CardDescription = ({ children, className = '' }) => (
  <p className={`text-sm text-gray-500 dark:text-gray-400 mt-1 ${className}`}>
    {children}
  </p>
);

export const CardContent = ({ children, className = '' }) => (
  <div className={className}>
    {children}
  </div>
);

export const CardFooter = ({ children, className = '' }) => (
  <div className={`mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 ${className}`}>
    {children}
  </div>
);

export default Card;
