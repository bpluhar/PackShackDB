import React from 'react';
import { Loader2 } from 'lucide-react';

const LoadingFallback = ({ message, className }) => (
  <div className={`flex items-center justify-center p-8 space-x-2 ${className}`}>
    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
    <span className="text-gray-600">{message}</span>
  </div>
);

export default LoadingFallback;
