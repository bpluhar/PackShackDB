import React, { useState } from 'react';
import { Download, Loader2, AlertCircle } from 'lucide-react';

const DownloadButton = ({ audioFileUrl, fileName = 'audio-file.wav' }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDownload = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(audioFileUrl);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Extract filename from the Content-Disposition header or use the default fileName
      const disposition = response.headers.get('Content-Disposition');
      const extractedFileName =
        disposition?.match(/filename="(.+)"/)?.[1] ?? fileName;

      // Read the file content as a Blob
      const audioFileData = await response.blob();
      const url = URL.createObjectURL(audioFileData);

      // Create a temporary anchor element for downloading
      const link = document.createElement('a');
      link.href = url;
      link.download = extractedFileName;
      document.body.appendChild(link);
      link.click();

      // Cleanup: remove the link and revoke the object URL
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
      {/* Error Message */}
      {error && (
        <div className="mb-4 flex items-center gap-2 text-red-500">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Download Button */}
      <button
        onClick={handleDownload}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-label="Download audio file"
        className="flex items-center gap-2 bg-blue-500 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
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
