import React, { Suspense, useState, useEffect } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { Buffer } from 'buffer';
import { Alert, AlertDescription } from './components/ui/Alert';
import LoadingFallback from './components/LoadingFallback';
import Navigation from './components/Navigation';
import Footer from './components/Footer';
import Header from './components/Header';
import Section from './components/Section';

if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
}

const AudioFileUploader = React.lazy(() => import('./components/AudioFileUploader'));
const DownloadButton = React.lazy(() => import('./components/DownloadButton'));

const App = () => {
  const API_URL = process.env.REACT_APP_API_URL || 'http://192.168.50.82:3001/api';
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = 'PackShack DB - Audio Manager';
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const checkApiStatus = async () => {
      if (!isOnline) return;
      try {
        const response = await fetch(`${API_URL}/health`);
        if (!response.ok) throw new Error('API is not responding');
      } catch (err) {
        setError('Unable to connect to the server. Please try again later.');
      }
    };

    checkApiStatus();
  }, [API_URL, isOnline]);

  if (!API_URL) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-50">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>
            Configuration Error: REACT_APP_API_URL is not set. Please check your environment configuration.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <Navigation isOnline={isOnline} />

      <main className="container mx-auto px-4 py-12" role="main">
        <Header />

        {error && (
          <Alert variant="destructive" className="max-w-2xl mx-auto mb-8">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-12">
          <Section 
            id="upload-section-title"
            title="Upload Audio Files"
            className="bg-white rounded-2xl shadow-xl overflow-hidden"
          >
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback message="Loading uploader..." />}>
                <AudioFileUploader apiUrl={API_URL} />
              </Suspense>
            </ErrorBoundary>
          </Section>

          <Section
            id="download-section-title"
            title="Download Audio File"
            className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden"
          >
            <p className="text-sm text-gray-600 mb-4">
              Click the button below to download the audio collection
            </p>
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback message="Loading downloader..." />}>
                <DownloadButton
                  apiUrl={API_URL}
                  fileName="audio-collection.wav"
                  disabled={!isOnline}
                />
              </Suspense>
            </ErrorBoundary>
          </Section>
        </div>

        <Footer />
      </main>
    </div>
  );
};

export default App;