import multer from 'multer';
import path from 'path';

/**
 * Multer Configuration for Excel File Uploads
 * Handles .xlsx and .xls files for bulk student uploads
 */

// File size limit: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

// Allowed MIME types for Excel files
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/octet-stream', // Sometimes Excel files are detected as this
];

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

/**
 * File filter function to validate Excel files
 */
const fileFilter = (req, file, cb) => {
  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype;

  // Validate extension
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(
      new Error(
        `Invalid file type. Only Excel files (.xlsx, .xls) are allowed. Received: ${ext}`
      ),
      false
    );
  }

  // Validate MIME type (more lenient to handle different browsers)
  if (!ALLOWED_MIME_TYPES.includes(mimeType) && !ext.match(/\.(xlsx|xls)$/)) {
    return cb(
      new Error(
        `Invalid file MIME type. Expected Excel file but received: ${mimeType}`
      ),
      false
    );
  }

  // File is valid
  cb(null, true);
};

/**
 * Multer configuration with memory storage
 * Files are stored in memory as Buffer for immediate processing
 */
const upload = multer({
  storage: multer.memoryStorage(), // Store in memory for immediate processing
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Only allow single file upload
  },
  fileFilter: fileFilter,
});

/**
 * Error handler for multer errors
 * Wraps multer middleware to provide better error messages
 */
export const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File size exceeds the limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        timestamp: new Date().toISOString(),
      });
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Only one file can be uploaded at a time',
        timestamp: new Date().toISOString(),
      });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name. Use "file" as the field name',
        timestamp: new Date().toISOString(),
      });
    }

    // Generic multer error
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
      timestamp: new Date().toISOString(),
    });
  }

  // Custom validation errors from fileFilter
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }

  next();
};

export default upload;
