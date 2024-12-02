import React from 'react';

const Navigation = ({ isOnline, className }) => (
  <nav
    className={`bg-white shadow-sm sticky top-0 z-10 ${className}`}
    aria-label="Main navigation"
  >
    <div className="container mx-auto px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <img
            src="/logo/PackShackDB-Logo.png"
            alt="PackShackDB Logo"
            className="h-8 w-auto"
            loading="lazy"
            aria-label="PackShackDB Logo"
          />
          <h2 className="text-xl font-semibold text-gray-800">PackShack DB</h2>
        </div>
        <span 
          className={`text-sm ${isOnline ? 'text-green-600' : 'text-red-600'}`}
        >
          {isOnline ? 'You are online' : 'You are currently offline'}
        </span>
      </div>
    </div>
  </nav>
);

export default Navigation;
