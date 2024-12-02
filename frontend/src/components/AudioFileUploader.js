import React, { useState, useRef, useCallback } from 'react';
import { Upload, Music, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Alert, AlertDescription } from './ui/Alert';

const API_URL = 'http://192.168.50.82:3001/api/upload';
const MAX_FILE_SIZE_MB = 500; // Max size in MB
const SUPPORTED_FORMATS = ['.wav', '.mp3', '.flac', '.aiff'];

const AudioFileUploader = () => {
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const validateFileType = useCallback((file) => {
    return file.type.startsWith('audio/') || 
           SUPPORTED_FORMATS.some(ext => file.name.toLowerCase().endsWith(ext));
  }, []);

  const validateFileSize = useCallback((file) => {
    return file.size / 1024 / 1024 <= MAX_FILE_SIZE_MB;
  }, []);

  const getAudioDuration = useCallback((file) => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.src = URL.createObjectURL(file);
      
      audio.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(audio.src);
        resolve(audio.duration);
      });
      
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(audio.src);
        resolve(null);
      });
    });
  }, []);

  const getFileMetadata = useCallback(async (file) => {
    const duration = await getAudioDuration(file);
    
    return {
      file,
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2),
      type: file.type || 'audio/wav',
      duration: duration ? duration.toFixed(2) : null,
      lastModified: new Date(file.lastModified).toLocaleDateString(),
      path: file.webkitRelativePath || file.name,
    };
  }, [getAudioDuration]);

  const handleFolderSelect = useCallback(async (event) => {
    setIsLoading(true);
    setError(null);
    setUploadSuccess(false);

    try {
      const selectedFiles = Array.from(event.target.files);
      
      // Validate file types
      const invalidFiles = selectedFiles.filter(file => !validateFileType(file));
      if (invalidFiles.length > 0) {
        throw new Error(`Unsupported file type(s): ${invalidFiles.map(f => f.name).join(', ')}`);
      }

      // Validate file sizes
      const oversizedFiles = selectedFiles.filter(file => !validateFileSize(file));
      if (oversizedFiles.length > 0) {
        throw new Error(`Files exceeding ${MAX_FILE_SIZE_MB}MB: ${oversizedFiles.map(f => f.name).join(', ')}`);
      }

      const filesWithMetadata = await Promise.all(
        selectedFiles.map(file => getFileMetadata(file))
      );
      
      setFiles(filesWithMetadata);
    } catch (err) {
      setError(err.message);
      console.error('Folder selection error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [validateFileType, validateFileSize, getFileMetadata]);

  const removeFile = useCallback((index) => {
    setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setUploadSuccess(false);

    // Create new AbortController for this upload
    abortControllerRef.current = new AbortController();

    try {
      const formData = new FormData();
      files.forEach((fileData, index) => {
        formData.append('files', fileData.file);
        formData.append(`metadata${index}`, JSON.stringify({
          duration: fileData.duration || 'unknown',
          type: fileData.type,
          lastModified: fileData.lastModified,
          path: fileData.path,
        }));
      });

      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Upload failed: ${response.statusText}`);
      }

      setFiles([]);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Upload cancelled');
      } else {
        setError(err.message || 'Upload failed. Please try again.');
        console.error('Upload error:', err);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [files]);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
      <div className="p-8">
        <div 
          className="flex flex-col items-center justify-center py-8 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFolderSelect({ target: { files: e.dataTransfer.files } });
          }}
        >
          <input
            id="folderInput"
            type="file"
            ref={fileInputRef}
            onChange={handleFolderSelect}
            className="hidden"
            webkitdirectory="true"
            directory="true"
            multiple
            accept={SUPPORTED_FORMATS.join(',')}
          />

          <label
            htmlFor="folderInput"
            className="flex items-center gap-3 px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-200 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <Upload size={24} />
            )}
            <span className="font-semibold">
              {isLoading ? 'Processing...' : 'Select Audio Folder'}
            </span>
          </label>
          <p className="mt-4 text-sm text-gray-500">
            Drop a folder here or click to select. Supported formats: {SUPPORTED_FORMATS.join(', ')}. 
            Max size: {MAX_FILE_SIZE_MB} MB.
          </p>
        </div>

        {uploadSuccess && (
          <Alert className="mt-6 bg-green-50 border-green-500">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <AlertDescription className="ml-2 text-green-700">
              Files uploaded successfully!
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="mt-6 bg-red-50 border-red-500">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <AlertDescription className="ml-2 text-red-700">{error}</AlertDescription>
          </Alert>
        )}

        {files.length > 0 && (
          <div className="mt-8 space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Music className="h-5 w-5 text-blue-500" />
                  Selected Files ({files.length})
                </h2>
              </div>
              <div className="divide-y divide-gray-200">
                {files.map((fileData, index) => (
                  <div key={index} className="p-6 hover:bg-gray-50 transition-colors duration-150">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <Music className="h-6 w-6 text-blue-600" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {fileData.name}
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-4 text-sm text-gray-600">
                            <p>Size: {fileData.size} MB</p>
                            <p>Duration: {fileData.duration ? `${fileData.duration}s` : 'Unknown'}</p>
                            <p>Type: {fileData.type.split('/')[1]?.toUpperCase() || 'Unknown'}</p>
                            <p className="truncate">Path: {fileData.path}</p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        className="p-1 hover:bg-gray-100 rounded-full"
                      >
                        <X className="h-5 w-5 text-gray-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleUpload}
                className="flex-1 flex items-center justify-center gap-3 px-8 py-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all duration-200 disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <Upload size={24} />
                )}
                <span className="font-semibold">
                  {isLoading ? 'Uploading...' : 'Upload Files'}
                </span>
              </button>
              
              {isLoading && (
                <button
                  onClick={cancelUpload}
                  className="px-8 py-4 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all duration-200"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioFileUploader;
