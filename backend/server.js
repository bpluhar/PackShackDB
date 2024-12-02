// Import required modules
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
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Server Configuration
const port = process.env.PORT || 3001;
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || 100 * 1024 * 1024; // 100MB
const ALLOWED_FILE_TYPES = ['audio/wav', 'audio/mp3', 'audio/flac', 'audio/aiff'];

// Middleware setup
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting for file uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit to 100 requests per IP
  message: { success: false, message: 'Too many upload requests from this IP' }
});

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Audio file processing class
class AudioFileProcessor {
  constructor(pool) {
    this.pool = pool;
  }

  // Delete temporary file
  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
      console.log(`Deleted temporary file: ${filePath}`);
    } catch (error) {
      console.error(`Error deleting file: ${filePath}`, error);
    }
  }

  // Generate fingerprint for audio file
  async generateFingerprint(filePath) {
    try {
      return await chromaprint(filePath);
    } catch (error) {
      console.error('Error generating fingerprint:', error);
      throw new Error('Failed to generate fingerprint');
    }
  }

  // Get or create folder in database
  async getOrCreateFolder(folderPath) {
    try {
      const parts = folderPath.split(path.sep).filter(Boolean);
      let parentId = null;

      for (const folderName of parts) {
        const result = await this.pool.query(
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

  // Detect manufacturer based on filename and filepath
  async detectManufacturer(filename, filepath) {
    try {
      const result = await this.pool.query('SELECT id, name FROM manufacturers');
      const lowerFilename = filename.toLowerCase();
      const parentFolder = path.dirname(filepath).split(path.sep).pop()?.toLowerCase() || '';

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

  // Get audio metadata (duration, sample rate, bitrate, etc.)
  async getAudioMetadata(filePath) {
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

  // Check if a file is a duplicate (based on fingerprint)
  async isDuplicate(fingerprint) {
    const result = await this.pool.query(
      'SELECT EXISTS(SELECT 1 FROM audio_files WHERE fingerprint = $1)',
      [fingerprint]
    );
    return result.rows[0].exists;
  }

  // Process uploaded audio file
  async processFile(file, metadata = {}) {
    try {
      const audioMetadata = await this.getAudioMetadata(file.path);
      let fingerprint = await this.generateFingerprint(file.path);
      fingerprint = fingerprint.slice(0, 512);

      if (await this.isDuplicate(fingerprint)) {
        return { isDuplicate: true, filename: file.originalname };
      }

      const filePath = `audio-files/${file.filename}`;
      const manufacturerId = await this.detectManufacturer(file.originalname, metadata.path);
      const folderId = await this.getOrCreateFolder(metadata.path ? path.dirname(metadata.path) : '');

      const bpm = audioMetadata.bpm || file.originalname.match(/\b(\d+)\s*BPM\b/i)?.[1];
      const keySignature = file.originalname.match(/\b([A-G]#?\s*(?:maj|min))\b/i)?.[1];

      // Update the INSERT query to include the original filename
      const result = await this.pool.query(
        `INSERT INTO audio_files 
         (filename, original_filename, filepath, fingerprint, manufacturer_id, folder_id, 
          file_size, duration, bpm, key_signature, sample_rate, channels)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, filename`,
        [
          file.filename,
          file.originalname, // Add the original filename here
          filePath,
          fingerprint,
          manufacturerId,
          folderId,
          file.size,
          audioMetadata.duration,
          bpm ? parseFloat(bpm) : null,
          keySignature,
          audioMetadata.sampleRate,
          audioMetadata.channels,
        ]
      );

      return {
        id: result.rows[0].id,
        filename: result.rows[0].filename,
        originalName: file.originalname,  // Return the original filename as well
        path: filePath,
      };
    } catch (error) {
      console.error('Error processing file:', error);
      throw error;
    }
  }
}

// Multer configuration for file uploads
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
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`));
    }
  },
});

// Request validation middleware
const validateUploadRequest = (req, res, next) => {
  if (!req.files?.length) {
    return next(new Error('No files received'));
  }

  try {
    if (req.body.metadata) {
      JSON.parse(req.body.metadata);
    }
    next();
  } catch (error) {
    next(new Error('Invalid metadata format'));
  }
};

// Initialize audio file processor instance
const audioProcessor = new AudioFileProcessor(pool);

// Upload endpoint
app.post('/api/upload',
  uploadLimiter,
  upload.array('files'),
  validateUploadRequest,
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const metadata = JSON.parse(req.body.metadata || '{}');
      const uploadedFiles = [];
      const duplicates = [];

      for (const file of req.files) {
        const result = await audioProcessor.processFile(file, metadata);
        
        if (result.isDuplicate) {
          duplicates.push(result.filename);
        } else {
          uploadedFiles.push(result);
        }
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        message: 'Files processed successfully.',
        files: uploadedFiles,
        duplicates,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
      for (const file of req.files || []) {
        await audioProcessor.deleteFile(file.path);
      }
    }
  }
);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, uptime: process.uptime() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Database connection error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// Start the server
const server = app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app;
