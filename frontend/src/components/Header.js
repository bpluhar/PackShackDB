import React from 'react';
import { Database } from 'lucide-react';

const Header = ({ className }) => (
  <header className={`mb-12 max-w-2xl mx-auto text-center ${className}`}>
    <div className="flex items-center justify-center mb-4">
      <Database className="h-12 w-12 text-blue-500" aria-hidden="true" />
    </div>
    <h1 className="text-4xl font-bold text-gray-800 mb-3">
      Audio File Manager
    </h1>
    <p className="text-lg text-gray-600">
      Seamlessly upload and manage your audio collection
    </p>
  </header>
);

export default Header;
