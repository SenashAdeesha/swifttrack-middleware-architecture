import { Loader2 } from 'lucide-react';

const Loader = ({ size = 'md', text = '', fullScreen = false, className = '' }) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const content = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <Loader2 className={`${sizes[size]} text-primary-500 animate-spin`} />
      {text && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50">
        {content}
      </div>
    );
  }

  return content;
};

export const LoadingSkeleton = ({ className = '', rows = 1 }) => {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`h-4 bg-gray-200 dark:bg-slate-700 rounded ${className}`} />
      ))}
    </div>
  );
};

export const CardSkeleton = ({ className = '' }) => {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-2xl p-6 animate-pulse ${className}`}>
      <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/3 mb-4" />
      <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded w-1/2 mb-2" />
      <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-2/3" />
    </div>
  );
};

export const TableSkeleton = ({ rows = 5, cols = 4 }) => {
  return (
    <div className="animate-pulse">
      <div className="bg-gray-50 dark:bg-slate-800/50 p-4 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 bg-gray-200 dark:bg-slate-700 rounded flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex gap-4 border-b border-gray-100 dark:border-slate-700">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 bg-gray-200 dark:bg-slate-700 rounded flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
};

export default Loader;
