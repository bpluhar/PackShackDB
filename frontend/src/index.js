import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';  // shadcn/ui base styles
import './styles/index.css';    // your custom styles
import App from './App';
import { register as registerServiceWorker } from './components/serviceWorker';
import ErrorBoundary from './components/ErrorBoundary';

// Environment-specific logging
if (process.env.NODE_ENV === 'development') {
  console.log('Development mode: additional debug logging enabled.');
  window.addEventListener('error', e => console.error('Global error:', e));
  window.addEventListener('unhandledrejection', e => console.error('Unhandled rejection:', e));
}

// Conditionally register service worker for production
if (process.env.NODE_ENV === 'production') {
  registerServiceWorker();
}

// Create root element for React
const root = ReactDOM.createRoot(document.getElementById('root'));

// Render the App component inside StrictMode with ErrorBoundary
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
