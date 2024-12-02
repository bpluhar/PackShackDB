// server.js

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const { parseFile } = require('music-metadata');
const chromaprint = require('chromaprint');
const morgan = require('morgan');
const fs = require('fs').promises;
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Create an Express app instance
const app = express();

// Set server port
const port = process.env.PORT || 3001;

// Middleware setup
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// PostgreSQL connection pool setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper: Delete temporary file
async function deleteFile(filePath) {
  try {
    await fs.unlink(filePath);
    console.log(`Deleted temporary file: ${filePath}`);
  } catch (error) {
    console.error(`Error deleting file: ${filePath}`, error);
  }
}

// Helper: Generate audio fingerprint
async function generateFingerprint(filePath) {
  try {
    return await chromaprint(filePath);
  } catch (error) {
    console.error('Error generating fingerprint:', error);
    throw new Error('Failed to generate fingerprint');
  }
}

// Helper: Get or create folder hierarchy
async function getOrCreateFolder(folderPath) {
  try {
    const parts = folderPath.split(path.sep).filter(Boolean);
    let parentId = null;

    for (const folderName of parts) {
      const result = await pool.query(
        `INSERT INTO folders (name, parent_id)
         VALUES ($1, $2)
         ON CONFLICT (name, parent_id) DO NOTHING
         RETURNING id`,
        [folderName, parentId]
      );
      parentId = result.rows[0]?.id || parentId;
    }
    return parentId;
  } catch (error) {
    console.error('Error in getOrCreateFolder:', error);
    throw error;
  }
}

// Helper: Detect manufacturer
async function detectManufacturer(filename, filepath) {
  try {
    const result = await pool.query('SELECT id, name FROM manufacturers');
    const lowerFilename = filename.toLowerCase();
    const parentFolder = path.dirname(filepath).split(path.sep).pop().toLowerCase();

    let manufacturer = result.rows.find(m =>
      lowerFilename.startsWith(m.name.toLowerCase() + ' -') ||
      parentFolder.startsWith(m.name.toLowerCase())
    );

    if (!manufacturer) {
      manufacturer = result.rows.find(m =>
        lowerFilename.includes(m.name.toLowerCase()) ||
        parentFolder.includes(m.name.toLowerCase())
      );
    }

    return manufacturer?.id || null;
  } catch (error) {
    console.error('Error detecting manufacturer:', error);
    return null;
  }
}

// Helper: Detect sample pack
async function detectSamplePack(filename, filepath, manufacturerId) {
  try {
    if (!manufacturerId) return null;

    const result = await pool.query(
      'SELECT id, name FROM sample_packs WHERE manufacturer_id = $1',
      [manufacturerId]
    );

    const lowerFilename = filename.toLowerCase();
    const parentFolder = path.dirname(filepath).split(path.sep).pop().toLowerCase();
    const grandParentFolder = path.dirname(path.dirname(filepath)).split(path.sep).pop().toLowerCase();

    let samplePack = result.rows.find(sp => {
      const packName = sp.name.toLowerCase();
      return (
        parentFolder.includes(packName) ||
        grandParentFolder.includes(packName) ||
        lowerFilename.includes(packName)
      );
    });

    if (!samplePack && parentFolder) {
      const newPackResult = await pool.query(
        'INSERT INTO sample_packs (manufacturer_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
        [manufacturerId, parentFolder]
      );
      return newPackResult.rows[0]?.id || null;
    }

    return samplePack?.id || null;
  } catch (error) {
    console.error('Error detecting sample pack:', error);
    return null;
  }
}

// Helper: Extract audio metadata
async function getAudioMetadata(filePath) {
  try {
    const metadata = await parseFile(filePath);
    return {
      duration: metadata.format.duration || null,
      sampleRate: metadata.format.sampleRate,
      bitrate: metadata.format.bitrate,
      codec: metadata.format.codec,
      channels: metadata.format.numberOfChannels,
      bpm: metadata.native?.['ID3v2.3']?.find(tag => tag.id === 'TBPM')?.value || null,
      format: metadata.format.container,
      lossless: ['wav', 'flac', 'aiff'].includes(metadata.format.container.toLowerCase())
    };
  } catch (error) {
    console.error('Error reading audio metadata:', error);
    return {};
  }
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'audio-files'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const filename = path.basename(file.originalname, ext);
    cb(null, `${filename}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/flac', 'audio/aiff'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed.'));
    }
  },
});

// Upload endpoint
app.post('/api/upload', upload.array('files'), async (req, res) => {
  try {
    const files = req.files;
    if (!files?.length) throw new Error('No files received.');

    const uploadedFiles = [];

    for (const file of files) {
      const metadata = JSON.parse(req.body.metadata || '{}');
      const audioMetadata = await getAudioMetadata(file.path);
      const fingerprint = await generateFingerprint(file.path);

      // Check for duplicates
      const duplicateCheck = await pool.query(
        'SELECT id FROM audio_files WHERE fingerprint = $1',
        [fingerprint]
      );

      if (duplicateCheck.rows.length > 0) {
        console.log(`Duplicate file detected: ${file.originalname}`);
        continue;
      }

      const filePath = `audio-files/${file.filename}`;
      const folderPath = path.dirname(metadata.path || file.originalname);

      const manufacturerId = await detectManufacturer(file.originalname, metadata.path);
      const samplePackId = await detectSamplePack(file.originalname, metadata.path, manufacturerId);
      const folderId = await getOrCreateFolder(folderPath);

      const bpm = audioMetadata.bpm || file.originalname.match(/\b(\d+)\s*BPM\b/i)?.[1];
      const keySignature = file.originalname.match(/\b([A-G]#?\s*(?:maj|min))\b/i)?.[1];

      const result = await pool.query(
        `INSERT INTO audio_files 
         (filename, filepath, fingerprint, manufacturer_id, sample_pack_id, folder_id, file_size, duration, bpm, key_signature, sample_rate, channels)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, filename`,
        [
          file.filename,
          filePath,
          fingerprint,
          manufacturerId,
          samplePackId,
          folderId,
          file.size,
          audioMetadata.duration,
          bpm ? parseFloat(bpm) : null,
          keySignature,
          audioMetadata.sampleRate,
          audioMetadata.channels,
        ]
      );

      uploadedFiles.push({
        id: result.rows[0].id,
        filename: result.rows[0].filename,
        originalName: file.originalname,
        path: filePath,
      });
    }

    res.json({
      success: true,
      message: 'Files uploaded successfully.',
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    for (const file of req.files || []) {
      await deleteFile(file.path);
    }
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ message: 'Server is healthy' });
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});
