import { Package } from 'lucide-react';
import Button from './Button';

const EmptyState = ({ 
  icon: Icon = Package,
  title = 'No data found',
  description = 'There is nothing here yet.',
  action,
  actionLabel = 'Add New',
  onAction,
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <div className="p-4 bg-gray-100 dark:bg-slate-700 rounded-2xl mb-4">
        <Icon className="w-12 h-12 text-gray-400 dark:text-gray-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-6">
        {description}
      </p>
      {(action || onAction) && (
        <Button onClick={onAction || action}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
