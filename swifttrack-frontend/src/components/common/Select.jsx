import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

const Select = forwardRef(({ 
  label,
  error,
  options = [],
  placeholder = 'Select an option',
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
        <select
          ref={ref}
          className={`
            w-full px-4 py-3 rounded-xl border appearance-none
            ${error 
              ? 'border-red-500 focus:ring-red-500' 
              : 'border-gray-200 dark:border-slate-600 focus:ring-primary-500'
            }
            bg-white dark:bg-slate-800 text-gray-900 dark:text-white
            focus:outline-none focus:ring-2 focus:border-transparent
            transition-all duration-200
            ${className}
          `}
          {...props}
        >
          <option value="" disabled>{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <ChevronDown className="h-5 w-5 text-gray-400" />
        </div>
      </div>
      {error && (
        <p className="mt-1.5 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

export default Select;
