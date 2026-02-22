import { forwardRef } from 'react';

const Input = forwardRef(({ 
  label,
  error,
  icon: Icon,
  type = 'text',
  className = '',
  ...props 
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Icon className="h-5 w-5 text-gray-400" />
          </div>
        )}
        <input
          ref={ref}
          type={type}
          className={`
            w-full px-4 py-3 rounded-xl border 
            ${error 
              ? 'border-red-500 focus:ring-red-500' 
              : 'border-gray-200 dark:border-slate-600 focus:ring-primary-500'
            }
            bg-white dark:bg-slate-800 text-gray-900 dark:text-white
            placeholder-gray-400 dark:placeholder-gray-500
            focus:outline-none focus:ring-2 focus:border-transparent
            transition-all duration-200
            ${Icon ? 'pl-12' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && (
        <p className="mt-1.5 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
