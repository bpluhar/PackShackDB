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
const fsSync = require('fs');
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

// Rate limiting for file uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many upload requests from this IP' }
});

// Middleware setup
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
      console.log(`Deleted temporary file: ${filePath}`);
    } catch (error) {
      console.error(`Error deleting file: ${filePath}`, error);
    }
  }

  async generateFingerprint(filePath) {
    try {
      return await chromaprint(filePath);
    } catch (error) {
      console.error('Error generating fingerprint:', error);
      throw new Error('Failed to generate fingerprint');
    }
  }

  async getOrCreateFolder(folderPath) {
    if (!folderPath) return null;
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const parts = folderPath.split(path.sep).filter(Boolean);
      let parentId = null;
      let currentPath = [];

      for (const folderName of parts) {
        currentPath.push(folderName);
        const result = await client.query(
          `INSERT INTO folders (name, parent_id, path_parts)
           VALUES ($1, $2, $3)
           ON CONFLICT (parent_id, name) DO UPDATE
           SET path_parts = $3
           RETURNING id`,
          [folderName, parentId, currentPath]
        );
        parentId = result.rows[0].id;
      }

      await client.query('COMMIT');
      return parentId;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in getOrCreateFolder:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async detectManufacturer(filename, filepath) {
    try {
      const result = await this.pool.query('SELECT id, name FROM manufacturers');
      const lowerFilename = filename.toLowerCase();
      const parentFolder = filepath ? path.dirname(filepath).split(path.sep).pop()?.toLowerCase() || '' : '';

      let manufacturer = result.rows.find(m =>
        lowerFilename.startsWith(m.name.toLowerCase() + ' -') ||
        (parentFolder && parentFolder.startsWith(m.name.toLowerCase()))
      );

      if (!manufacturer) {
        manufacturer = result.rows.find(m =>
          lowerFilename.includes(m.name.toLowerCase()) ||
          (parentFolder && parentFolder.includes(m.name.toLowerCase()))
        );
      }

      return manufacturer?.id || null;
    } catch (error) {
      console.error('Error detecting manufacturer:', error);
      return null;
    }
  }

  async detectCategory(filename) {
    try {
      const result = await this.pool.query('SELECT id, name FROM categories');
      const lowerFilename = filename.toLowerCase();

      const category = result.rows.find(c =>
        lowerFilename.includes(c.name.toLowerCase())
      );

      return category?.id || null;
    } catch (error) {
      console.error('Error detecting category:', error);
      return null;
    }
  }

  async detectSubcategory(categoryId, filename) {
    if (!categoryId) return null;
    
    try {
      const result = await this.pool.query(
        'SELECT id, name FROM subcategories WHERE category_id = $1',
        [categoryId]
      );
      const lowerFilename = filename.toLowerCase();

      const subcategory = result.rows.find(sc =>
        lowerFilename.includes(sc.name.toLowerCase())
      );

      return subcategory?.id || null;
    } catch (error) {
      console.error('Error detecting subcategory:', error);
      return null;
    }
  }

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
        lossless: ['wav', 'flac', 'aiff'].includes(metadata.format.container.toLowerCase()),
        bitDepth: metadata.format.bitsPerSample
      };
    } catch (error) {
      console.error('Error reading audio metadata:', error);
      return {};
    }
  }

  async isDuplicate(fingerprint) {
    const result = await this.pool.query(
      'SELECT EXISTS(SELECT 1 FROM audio_files WHERE fingerprint = $1)',
      [fingerprint]
    );
    return result.rows[0].exists;
  }

  async processFile(file, metadata = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const audioMetadata = await this.getAudioMetadata(file.path);
      let fingerprint = await this.generateFingerprint(file.path);
      fingerprint = fingerprint.slice(0, 512);

      if (await this.isDuplicate(fingerprint)) {
        return { isDuplicate: true, filename: file.originalname };
      }

      const filePath = `audio-files/${file.filename}`;
      const manufacturerId = await this.detectManufacturer(file.originalname, metadata.path);
      const categoryId = await this.detectCategory(file.originalname);
      const subcategoryId = await this.detectSubcategory(categoryId, file.originalname);
      const folderId = await this.getOrCreateFolder(metadata.path ? path.dirname(metadata.path) : '');

      const bpm = audioMetadata.bpm || file.originalname.match(/\b(\d+)\s*BPM\b/i)?.[1];
      const keySignature = file.originalname.match(/\b([A-G]#?\s*(?:maj|min))\b/i)?.[1];

      const stats = fsSync.statSync(file.path);
      const fileType = file.mimetype.split('/')[1];

      const result = await client.query(
        `INSERT INTO audio_files 
         (filename, original_filename, file_type, filepath, fingerprint, 
          manufacturer_id, category_id, subcategory_id, folder_id, file_size, 
          duration, bpm, key_signature, sample_rate, channels, bit_depth,
          last_modified, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING id, filename, filepath`,
        [
          file.filename,
          file.originalname,
          fileType,
          filePath,
          fingerprint,
          manufacturerId,
          categoryId,
          subcategoryId,
          folderId,
          file.size,
          audioMetadata.duration,
          bpm ? parseFloat(bpm) : null,
          keySignature,
          audioMetadata.sampleRate,
          audioMetadata.channels,
          audioMetadata.bitDepth,
          stats.mtime,
          new Date()
        ]
      );

      await client.query('COMMIT');

      return {
        id: result.rows[0].id,
        filename: result.rows[0].filename,
        originalName: file.originalname,
        path: result.rows[0].filepath,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error processing file:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

// Ensure upload directory exists
if (!fsSync.existsSync('audio-files')) {
  fsSync.mkdirSync('audio-files', { recursive: true });
}

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is healthy' });
});

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

// Download endpoint with CORS headers
app.get('/api/download/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    // Get file information from database
    const result = await client.query(
      'SELECT filepath, original_filename, file_type FROM audio_files WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const { filepath, original_filename, file_type } = result.rows[0];
    const absolutePath = path.join(__dirname, filepath);

    // Verify file exists on disk
    try {
      await fs.access(absolutePath);
    } catch (error) {
      console.error('File not found on disk:', absolutePath);
      return res.status(404).json({ success: false, message: 'File not found on disk' });
    }

    // Set CORS headers
    res.header('Access-Control-Allow-Origin', 'http://192.168.50.83:3000');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');

    // Set download headers
    res.setHeader('Content-Type', `audio/${file_type}`);
    res.setHeader('Content-Disposition', `attachment; filename="${original_filename}"`);

    // Stream the file
    const fileStream = fsSync.createReadStream(absolutePath);
    fileStream.pipe(res);

    // Handle errors during streaming
    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error streaming file' });
      }
    });

  } catch (error) {
    console.error('Error in download endpoint:', error);
    next(error);
  } finally {
    client.release();
  }
});

// Also add OPTIONS handler for the download endpoint
app.options('/api/download/:id', (req, res) => {
  res.header('Access-Control-Allow-Origin', 'http://192.168.50.83:3000');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
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

// Upload endpoint with CORS headers
app.post('/api/upload',
  (req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://192.168.50.83:3000');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  },
  uploadLimiter,
  upload.array('files'),
  validateUploadRequest,
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
      const responses = [];
      const errors = [];

      for (const file of req.files) {
        try {
          const result = await audioProcessor.processFile(file, metadata);
          if (result.isDuplicate) {
            errors.push({
              file: file.originalname,
              error: 'Duplicate file detected'
            });
          } else {
            responses.push(result);
          }
        } catch (error) {
          errors.push({
            file: file.originalname,
            error: error.message
          });
        }
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        files: responses,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error processing files:', error);
      next(error);
    } finally {
      client.release();
    }
  }
);

// Error handling middleware with CORS headers
app.use((err, req, res, next) => {
  console.error(err);
  res.header('Access-Control-Allow-Origin', 'http://192.168.50.83:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(err.status || 500).json({ success: false, message: err.message });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});