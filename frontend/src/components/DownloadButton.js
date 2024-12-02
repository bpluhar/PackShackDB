import React, { useState } from 'react';
import { Download, Loader2, AlertCircle } from 'lucide-react';

const DownloadButton = ({ fileId, fileName }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDownload = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Use the new download endpoint
      const response = await fetch(`http://192.168.50.82:3001/api/download/${fileId}`);
      
      if (!response.ok) {
        throw new Error(
          response.status === 404 
            ? 'File not found' 
            : `Download failed: ${response.statusText}`
        );
      }

      // Get filename from Content-Disposition header
      const disposition = response.headers.get('Content-Disposition');
      const extractedFileName = disposition?.match(/filename="(.+)"/)?.[1] ?? fileName;

      // Create blob from response
      const audioFileData = await response.blob();
      const url = URL.createObjectURL(audioFileData);

      // Trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = extractedFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading file:', err);
      setError('Failed to download the audio file. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="inline-block">
      {error && (
        <div className="mb-4 flex items-center gap-2 text-red-500">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <button
        onClick={handleDownload}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-label="Download audio file"
        className="flex items-center gap-2 bg-blue-500 hover:bg-blue-700 text-white font-semibold 
                   py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 
                   disabled:cursor-not-allowed shadow-md"
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Download className="h-5 w-5" />
        )}
        <span>{isLoading ? 'Downloading...' : 'Download Audio'}</span>
      </button>
    </div>
  );
};

export default DownloadButton;