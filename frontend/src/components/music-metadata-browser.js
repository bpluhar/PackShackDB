import * as mm from 'music-metadata-browser';

/**
 * Extract metadata from an audio file.
 * @param {File} file - The audio file to parse.
 * @returns {Promise<Object>} - A promise that resolves to the metadata object.
 */
export const extractMetadata = async (file) => {
  try {
    // Parse the metadata from the file using music-metadata-browser
    const metadata = await mm.parseBlob(file);

    // Return relevant metadata fields with fallback values
    return {
      title: metadata.common.title || 'Unknown',  // Default to 'Unknown' if title is not available
      artist: metadata.common.artist || 'Unknown', // Default to 'Unknown' if artist is not available
      album: metadata.common.album || 'Unknown',  // Default to 'Unknown' if album is not available
      genre: metadata.common.genre?.join(', ') || 'Unknown', // Join genres if there are multiple
      year: metadata.common.year || 'Unknown',    // Default to 'Unknown' if year is not available
      duration: metadata.format.duration ? metadata.format.duration.toFixed(2) : 'Unknown', // Format duration to 2 decimal places
      bitrate: metadata.format.bitrate
        ? (metadata.format.bitrate / 1000).toFixed(0) + ' kbps'
        : 'Unknown', // Convert bitrate to kbps
      sampleRate: metadata.format.sampleRate || 'Unknown', // Default to 'Unknown' if sampleRate is not available
      format: metadata.format.container || 'Unknown', // Default to 'Unknown' if container format is not available
    };
  } catch (error) {
    console.error('Error extracting metadata:', error);
    // Throw a new error with a more specific message
    throw new Error('Failed to extract metadata from the audio file. Please ensure the file is a valid audio format.');
  }
};
