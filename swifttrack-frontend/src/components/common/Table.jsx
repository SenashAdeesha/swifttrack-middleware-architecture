const Table = ({ children, className = '' }) => {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-700">
      <table className={`w-full ${className}`}>
        {children}
      </table>
    </div>
  );
};

export const TableHeader = ({ children, className = '' }) => (
  <thead className={`bg-gray-50 dark:bg-slate-800/50 ${className}`}>
    {children}
  </thead>
);

export const TableBody = ({ children, className = '' }) => (
  <tbody className={`bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700 ${className}`}>
    {children}
  </tbody>
);

export const TableRow = ({ children, className = '', onClick, hover = true }) => (
  <tr 
    onClick={onClick}
    className={`
      ${hover ? 'hover:bg-gray-50 dark:hover:bg-slate-700/50' : ''} 
      ${onClick ? 'cursor-pointer' : ''}
      transition-colors
      ${className}
    `}
  >
    {children}
  </tr>
);

export const TableHead = ({ children, className = '' }) => (
  <th className={`px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${className}`}>
    {children}
  </th>
);

export const TableCell = ({ children, className = '' }) => (
  <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 ${className}`}>
    {children}
  </td>
);

export default Table;
