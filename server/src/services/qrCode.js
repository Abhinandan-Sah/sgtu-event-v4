// QR Code Service - Production-grade QR generation and verification with Redis caching
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import redisClient from '../config/redis.js';

class QRCodeService {
  // ============================================================
  // 🔄 ROTATING QR CODE CONFIGURATION (30-second rotation)
  // ============================================================
  static ROTATION_INTERVAL_SECONDS = 30;  // Token rotates every 30 seconds
  static GRACE_PERIOD_WINDOWS = 2;        // Accept tokens from 2 previous windows (60 seconds grace)

  /**
   * Get current time window for rotating QR codes
   * Time window changes every 30 seconds (floor division)
   * Example: timestamp 1732368450 → window 57745614
   * @returns {number} Current time window
   */
  static getCurrentTimeWindow() {
    return Math.floor(Date.now() / 1000 / this.ROTATION_INTERVAL_SECONDS);
  }

  /**
   * Generate rotating student QR token (changes every 30 seconds)
   * Uses HMAC for security without database updates
   * Token format: JWT with { r: registration_no, w: time_window, h: hmac, t: 'RS' }
   * Token size: ~120-140 characters (creates Version 4 QR code - clean & scannable)
   * 
   * UNIVERSAL QR CODE: One QR per student works for ALL events (free & paid)
   * Event validation happens during scanning, not in QR token
   * 
   * @param {Object} student - Student object with registration_no
   * @returns {string} JWT token that expires in 90 seconds (covers 3 time windows)
   */
  static generateRotatingStudentToken(student) {
    if (!student || !student.registration_no) {
      throw new Error('Invalid student data for rotating QR generation');
    }

    const currentWindow = this.getCurrentTimeWindow();
    
    // HMAC signature: proves token wasn't tampered with
    // Uses registration_no + time_window + secret key
    const hmac = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(`${student.registration_no}:${currentWindow}`)
      .digest('hex')
      .substring(0, 12); // 12 chars sufficient for security

    // Minimal payload for smallest QR code
    const payload = {
      r: student.registration_no,  // Registration number (primary lookup)
      w: currentWindow,             // Time window (for rotation)
      h: hmac,                      // HMAC signature (for verification)
      t: 'RS'                       // Type: Rotating Student
    };

    // JWT expires in 90 seconds (covers current + 2 grace period windows)
    return jwt.sign(payload, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '90s'
    });
  }

  /**
   * Verify rotating student QR token
   * Validates HMAC signature and checks if time window is within grace period
   * 
   * UNIVERSAL QR CODE: Token identifies student only, not event
   * Event authorization checked separately in database during scanning
   * 
   * @param {string} token - JWT token from QR code
   * @returns {Object} { valid, registration_no, time_window, isStatic } or { valid: false }
   */
  static verifyRotatingStudentToken(token) {
    try {
      // 1. Decode JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 2. Check if it's a rotating token
      if (decoded.t !== 'RS') {
        // Not a rotating token, might be static
        return { valid: false, isStatic: true };
      }

      const { r: registration_no, w: tokenWindow, h: receivedHmac } = decoded;

      // 3. Calculate expected HMAC for the token's time window
      const expectedHmac = crypto
        .createHmac('sha256', process.env.JWT_SECRET)
        .update(`${registration_no}:${tokenWindow}`)
        .digest('hex')
        .substring(0, 12);

      // 4. Validate HMAC
      if (receivedHmac !== expectedHmac) {
        console.log('❌ [ROTATING QR] HMAC mismatch - token tampered');
        return { valid: false };
      }

      // 5. Check if time window is within grace period
      const currentWindow = this.getCurrentTimeWindow();
      const windowDifference = currentWindow - tokenWindow;

      if (windowDifference > this.GRACE_PERIOD_WINDOWS || windowDifference < 0) {
        console.log(`❌ [ROTATING QR] Token expired (window difference: ${windowDifference})`);
        return { valid: false, expired: true };
      }

      console.log(`✅ [ROTATING QR] Valid token (window: ${tokenWindow}, current: ${currentWindow}, diff: ${windowDifference})`);

      return {
        valid: true,
        registration_no,
        time_window: tokenWindow,
        isStatic: false
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        console.log('❌ [ROTATING QR] JWT expired');
        return { valid: false, expired: true };
      }
      console.log('❌ [ROTATING QR] Invalid token:', error.message);
      return { valid: false };
    }
  }

  /**
   * Generate rotating QR code image (with Redis caching)
   * Caches QR image with key based on time window for automatic expiration
   * Redis key includes time window, so cache auto-expires when rotation happens
   * 
   * UNIVERSAL QR CODE: Same QR works for all events student is registered for
   * 
   * @param {Object} student - Student object with registration_no
   * @param {Object} options - QR code generation options
   * @returns {Promise<string>} Base64 QR code image (data URL)
   */
  static async generateRotatingQRCodeImage(student, options = {}) {
    const currentWindow = this.getCurrentTimeWindow();
    const cacheKey = `qr:rotating:${student.registration_no}:${currentWindow}`;

    // 1. Check Redis cache (key includes time window for auto-expiration)
    try {
      const cachedQR = await redisClient.get(cacheKey);
      if (cachedQR) {
        console.log(`✅ [CACHE HIT] Rotating QR for student ${student.registration_no} (window: ${currentWindow})`);
        return cachedQR;
      }
    } catch (error) {
      console.log('⚠️ [CACHE] Redis read failed:', error.message);
    }

    // 2. Generate fresh rotating token (universal for all events)
    const token = this.generateRotatingStudentToken(student);

    // 3. Generate QR code image
    const qrOptions = {
      errorCorrectionLevel: 'M',  // Medium error correction (15%)
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: options.width || 300,
      ...options
    };

    const qrCodeDataURL = await QRCode.toDataURL(token, qrOptions);

    // 4. Cache in Redis with TTL = rotation interval (60 seconds)
    try {
      await redisClient.setex(
        cacheKey,
        this.ROTATION_INTERVAL_SECONDS,  // Expires when next rotation happens
        qrCodeDataURL
      );
      console.log(`✅ [CACHE SET] Rotating QR cached for ${this.ROTATION_INTERVAL_SECONDS}s (window: ${currentWindow})`);
    } catch (error) {
      console.log('⚠️ [CACHE] Redis write failed:', error.message);
    }

    return qrCodeDataURL;
  }

  /**
   * Get seconds until next QR code rotation
   * Useful for UI countdown timers
   * @returns {number} Seconds until next rotation (0-30)
   */
  static getSecondsUntilRotation() {
    const now = Math.floor(Date.now() / 1000);
    const currentWindow = this.getCurrentTimeWindow();
    const nextRotationTime = (currentWindow + 1) * this.ROTATION_INTERVAL_SECONDS;
    return nextRotationTime - now;
  }

  // ============================================================
  // 📌 STATIC QR CODE METHODS (original methods preserved)
  // ============================================================

  /**
   * Generate Static QR Token for Student (OPTIMIZED for scanning)
   * Compressed payload: 317 chars → ~100 chars for better QR density
   * Token includes: type, student_id, registration_no (primary lookup)
   * Never expires (static QR for physical ID cards)
   */
  static generateStudentQRToken(student) {
    if (!student || !student.registration_no) {
      throw new Error('Invalid student data for QR generation');
    }

    // PRODUCTION: Tiny nonce for uniqueness, no UUID needed (registration_no is unique)
    const nonce = crypto.randomBytes(2).toString('hex'); // 4 chars only

    // ULTRA-OPTIMIZED: Minimal payload for smallest QR codes
    const payload = {
      n: nonce,                   // 4-char nonce (minimal uniqueness)
      t: 'S',                     // type: Student
      r: student.registration_no  // PRIMARY KEY (unique, indexed) - no UUID needed!
    };

    // JWT with no expiration (static QR)
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      algorithm: 'HS256'
    });

    return token;
  }

  /**
   * Generate Static QR Token for Stall (ULTRA-SHORT format)
   * Simple string format: STALL_{stall_number}_{timestamp}_{random_id}
   * Example: STALL_CS-001_1763272340083_4am2ghcnl
   * ~40 chars only - creates beautiful, sparse QR codes!
   */
  static generateStallQRToken(stall) {
    if (!stall || !stall.stall_number) {
      throw new Error('Invalid stall data for QR generation');
    }

    // STATIC TOKEN: Same stall_number always generates the same token
    // Format: STALL_{stall_number}
    const token = `STALL_${stall.stall_number}`;

    return token;
  }

  /**
   * Generate QR Code Image from Token
   * Returns: Base64 Data URL for display/printing
   * Production-optimized with Redis caching
   * 
   * Performance:
   * - Cache hit: <10ms (from Redis)
   * - Cache miss: ~200ms (generate + cache)
   * - Cache TTL: 24 hours (renewable on access)
   */
  static async generateQRCodeImage(token, options = {}) {
    if (!token) {
      throw new Error('Token is required for QR code generation');
    }

    // Create cache key from token hash (to avoid storing full JWT in key)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
    const cacheKey = `qr:image:${tokenHash}`;

    try {
      // 1. CHECK CACHE FIRST (5-10ms) ⚡
      const cachedQR = await redisClient.get(cacheKey);
      if (cachedQR) {
        // Cache hit - return immediately
        return cachedQR;
      }

      // 2. CACHE MISS - Generate QR code (200ms)
      const defaultOptions = {
        width: 400, // Production quality (high DPI)
        margin: 4, // Safe margin for scanning
        color: {
          dark: '#000000', // Black (best contrast)
          light: '#FFFFFF' // White background
        },
        errorCorrectionLevel: 'H', // Highest error correction (30% damage tolerance)
        type: 'image/png',
        quality: 1.0, // Maximum quality
        mode: 'alphanumeric', // Force alphanumeric mode for JWT tokens
        ...options
      };

      const qrCodeDataURL = await QRCode.toDataURL(token, defaultOptions);

      // 3. CACHE for future requests (24 hours TTL)
      await redisClient.set(cacheKey, qrCodeDataURL, 86400);

      return qrCodeDataURL;
    } catch (error) {
      console.error('QR Code generation error:', error);
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }
  }

  /**
   * Generate QR Code as Buffer (for file storage/email attachments)
   * Production use: Saving to S3, sending via email
   */
  static async generateQRCodeBuffer(token, options = {}) {
    if (!token) {
      throw new Error('Token is required for QR code generation');
    }

    const defaultOptions = {
      width: 400,
      margin: 4,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'H',
      type: 'png',
      mode: 'alphanumeric', // Force alphanumeric mode for JWT tokens
      ...options
    };

    try {
      const buffer = await QRCode.toBuffer(token, defaultOptions);
      return buffer;
    } catch (error) {
      console.error('QR Code buffer generation error:', error);
      throw new Error(`Failed to generate QR code buffer: ${error.message}`);
    }
  }

  /**
   * Verify Student QR Token (BACKWARD COMPATIBLE)
   * Supports both old (long) and new (optimized) token formats
   * Returns: { valid, student_id, registration_no } or { valid: false, error }
   */
  static verifyStudentQRToken(token) {
    if (!token) {
      return { valid: false, error: 'QR token is required' };
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256']
      });

      // BACKWARD COMPATIBLE: Support all formats (ultra-optimized, old optimized, legacy)
      const isNewFormat = decoded.t !== undefined;
      const isOldFormat = decoded.type !== undefined;

      // Type check (support both formats)
      const tokenType = isNewFormat ? decoded.t : decoded.type;
      if (tokenType !== 'S' && tokenType !== 'STUDENT') {
        return { valid: false, error: 'Invalid QR code type - expected STUDENT' };
      }

      // Extract fields (support all formats)
      const nonce = decoded.n; // May be undefined for old tokens
      const studentId = decoded.id || decoded.student_id; // May be undefined for ultra-optimized
      const registrationNo = decoded.r || decoded.registration_no;
      const checksum = decoded.c || decoded.checksum; // May be undefined for ultra-optimized
      
      // Ultra-optimized format: No checksum validation needed (JWT signature is sufficient)
      if (!checksum && nonce && registrationNo && !studentId) {
        // NEW ULTRA-OPTIMIZED FORMAT: {n, t, r} only
        return {
          valid: true,
          registration_no: registrationNo
        };
      }
      
      // OLD FORMAT: Validate checksum
      const hasNonce = nonce !== undefined;
      const checksumLength = hasNonce ? 6 : (isNewFormat ? 8 : 16);

      // Checksum verification for old formats
      const checksumInput = hasNonce
        ? `${nonce}${studentId}${registrationNo}${process.env.JWT_SECRET}`
        : (isNewFormat 
          ? `${studentId}${registrationNo}${process.env.JWT_SECRET}`
          : `${studentId}${decoded.email}${process.env.JWT_SECRET}`);
        
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(checksumInput)
        .digest('hex')
        .substring(0, checksumLength);

      if (checksum !== expectedChecksum) {
        return { valid: false, error: 'QR code checksum validation failed' };
      }

      return {
        valid: true,
        student_id: studentId,
        registration_no: registrationNo,
        // Include email if present (old format)
        ...(decoded.email && { email: decoded.email })
      };
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return { valid: false, error: 'Invalid QR code signature' };
      }
      if (error.name === 'TokenExpiredError') {
        return { valid: false, error: 'QR code expired' };
      }
      return { valid: false, error: error.message };
    }
  }

  /**
   * Verify Stall QR Token (BACKWARD COMPATIBLE)
   * Supports: Simple format (STALL_*) and old JWT formats
   * Returns: { valid, stall_number } or { valid: false, error }
   */
  static verifyStallQRToken(token) {
    if (!token) {
      return { valid: false, error: 'QR token is required' };
    }

    try {
      // NEW SIMPLE FORMAT: STALL_{stall_number}_{timestamp}_{random_id}
      if (token.startsWith('STALL_')) {
        const parts = token.split('_');
        if (parts.length >= 2) {
          const stallNumber = parts[1];
          return {
            valid: true,
            stall_number: stallNumber
          };
        }
        return { valid: false, error: 'Invalid stall QR format' };
      }

      // OLD JWT FORMAT: Backward compatibility
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256']
      });

      const isNewFormat = decoded.t !== undefined;
      const tokenType = isNewFormat ? decoded.t : decoded.type;
      
      if (tokenType !== 'T' && tokenType !== 'STALL') {
        return { valid: false, error: 'Invalid QR code type - expected STALL' };
      }

      const nonce = decoded.n;
      const stallId = decoded.id || decoded.stall_id;
      const stallNumber = decoded.s || decoded.stall_number;
      const checksum = decoded.c || decoded.checksum;
      
      if (!checksum && nonce && stallNumber && !stallId) {
        return {
          valid: true,
          stall_number: stallNumber
        };
      }
      
      const hasNonce = nonce !== undefined;
      const checksumLength = hasNonce ? 6 : (isNewFormat ? 8 : 16);

      const checksumInput = hasNonce
        ? `${nonce}${stallId}${stallNumber}${process.env.JWT_SECRET}`
        : (isNewFormat 
          ? `${stallId}${stallNumber}${process.env.JWT_SECRET}`
          : `${stallId}${stallNumber}${process.env.JWT_SECRET}`);
        
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(checksumInput)
        .digest('hex')
        .substring(0, checksumLength);

      if (checksum !== expectedChecksum) {
        return { valid: false, error: 'QR code checksum validation failed' };
      }

      return {
        valid: true,
        stall_id: stallId,
        stall_number: stallNumber,
        ...(decoded.school_id && { school_id: decoded.school_id })
      };
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return { valid: false, error: 'Invalid QR code signature' };
      }
      if (error.name === 'TokenExpiredError') {
        return { valid: false, error: 'QR code expired' };
      }
      return { valid: false, error: error.message };
    }
  }

  /**
   * Generate QR for Student (with auto-save to database)
   * Production: Called during student registration/login
   */
  static async generateAndSaveStudentQR(student, sql) {
    try {
      // Generate token
      const token = this.generateStudentQRToken(student);

      // Update student record with QR token
      const updateQuery = `
        UPDATE students 
        SET qr_code_token = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      
      await sql(updateQuery, [token, student.id]);

      // Generate QR image for immediate response
      const qrImage = await this.generateQRCodeImage(token);

      return {
        success: true,
        qr_token: token,
        qr_image: qrImage
      };
    } catch (error) {
      console.error('Generate and save student QR error:', error);
      throw error;
    }
  }

  /**
   * Generate QR for Stall (with auto-save to database)
   * Production: Called when admin creates stall
   */
  static async generateAndSaveStallQR(stall, sql) {
    try {
      // Generate token
      const token = this.generateStallQRToken(stall);

      // Update stall record with QR token
      const updateQuery = `
        UPDATE stalls 
        SET qr_code_token = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      
      await sql(updateQuery, [token, stall.id]);

      // Generate QR image for immediate response
      const qrImage = await this.generateQRCodeImage(token);

      return {
        success: true,
        qr_token: token,
        qr_image: qrImage
      };
    } catch (error) {
      console.error('Generate and save stall QR error:', error);
      throw error;
    }
  }

  /**
   * Regenerate QR Code (if compromised)
   * Production: Admin can regenerate QR if security concern
   */
  static async regenerateStudentQR(studentId, sql) {
    try {
      // Fetch student
      const student = await sql`SELECT * FROM students WHERE id = ${studentId} LIMIT 1`;
      
      if (student.length === 0) {
        throw new Error('Student not found');
      }

      return await this.generateAndSaveStudentQR(student[0], sql);
    } catch (error) {
      console.error('Regenerate student QR error:', error);
      throw error;
    }
  }

  /**
   * Batch Generate QR Codes for Multiple Students
   * Production: Used during bulk student import
   */
  static async batchGenerateStudentQRs(studentIds, sql) {
    const results = {
      success: [],
      failed: []
    };

    for (const studentId of studentIds) {
      try {
        const student = await sql`SELECT * FROM students WHERE id = ${studentId} LIMIT 1`;
        
        if (student.length === 0) {
          results.failed.push({ studentId, error: 'Student not found' });
          continue;
        }

        const qrData = await this.generateAndSaveStudentQR(student[0], sql);
        results.success.push({
          student_id: studentId,
          registration_no: student[0].registration_no,
          qr_generated: true
        });
      } catch (error) {
        results.failed.push({
          studentId,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Batch Generate QR Codes for Multiple Stalls
   * Production: Used when setting up event stalls
   */
  static async batchGenerateStallQRs(stallIds, sql) {
    const results = {
      success: [],
      failed: []
    };

    for (const stallId of stallIds) {
      try {
        const stall = await sql`SELECT * FROM stalls WHERE id = ${stallId} LIMIT 1`;
        
        if (stall.length === 0) {
          results.failed.push({ stallId, error: 'Stall not found' });
          continue;
        }

        const qrData = await this.generateAndSaveStallQR(stall[0], sql);
        results.success.push({
          stall_id: stallId,
          stall_number: stall[0].stall_number,
          qr_generated: true
        });
      } catch (error) {
        results.failed.push({
          stallId,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get QR Code Image for Existing Token
   * Production: Retrieve QR image without regenerating token
   * Uses cache-first strategy for optimal performance
   */
  static async getQRImageFromToken(token) {
    if (!token) {
      throw new Error('Token is required');
    }

    try {
      return await this.generateQRCodeImage(token);
    } catch (error) {
      console.error('Get QR image error:', error);
      throw error;
    }
  }

  /**
   * Get Student QR Code by Student ID (optimized for API endpoints)
   * Performance: <10ms for cached QRs
   * @param {string} studentId - Student UUID
   * @param {object} sql - Database connection
   */
  static async getStudentQRById(studentId, sql) {
    try {
      // Fetch student with QR token
      const result = await sql`
        SELECT id, email, registration_no, qr_code_token 
        FROM students 
        WHERE id = ${studentId} 
        LIMIT 1
      `;

      if (result.length === 0) {
        throw new Error('Student not found');
      }

      const student = result[0];

      // If no QR token exists, generate it
      if (!student.qr_code_token) {
        return await this.generateAndSaveStudentQR(student, sql);
      }

      // Return cached QR image
      const qrImage = await this.generateQRCodeImage(student.qr_code_token);

      return {
        success: true,
        qr_token: student.qr_code_token,
        qr_image: qrImage,
        cached: true
      };
    } catch (error) {
      console.error('Get student QR error:', error);
      throw error;
    }
  }

  /**
   * Get Stall QR Code by Stall ID (optimized for API endpoints)
   * Performance: <10ms for cached QRs
   * @param {string} stallId - Stall UUID
   * @param {object} sql - Database connection
   */
  static async getStallQRById(stallId, sql) {
    try {
      // Fetch stall with QR token
      const result = await sql`
        SELECT id, stall_number, school_id, qr_code_token 
        FROM stalls 
        WHERE id = ${stallId} 
        LIMIT 1
      `;

      if (result.length === 0) {
        throw new Error('Stall not found');
      }

      const stall = result[0];

      // If no QR token exists, generate it
      if (!stall.qr_code_token) {
        return await this.generateAndSaveStallQR(stall, sql);
      }

      // Return cached QR image
      const qrImage = await this.generateQRCodeImage(stall.qr_code_token);

      return {
        success: true,
        qr_token: stall.qr_code_token,
        qr_image: qrImage,
        cached: true
      };
    } catch (error) {
      console.error('Get stall QR error:', error);
      throw error;
    }
  }

  /**
   * Warm QR Cache - Pre-generate all student QR codes
   * Production: Run during off-peak hours (night)
   * Performance: ~100 QRs/second in batches
   * 
   * @param {object} sql - Database connection
   * @param {number} batchSize - Number of QRs to generate per batch (default: 100)
   * @param {number} delayMs - Delay between batches in ms (default: 1000ms)
   */
  static async warmStudentQRCache(sql, batchSize = 100, delayMs = 1000) {
    console.log('🔥 Starting QR cache warming for students...');
    const startTime = Date.now();

    try {
      // Get all students with QR tokens
      const students = await sql`
        SELECT id, email, registration_no, qr_code_token 
        FROM students 
        WHERE qr_code_token IS NOT NULL
        ORDER BY created_at ASC
      `;

      const total = students.length;
      let processed = 0;
      let cached = 0;
      let failed = 0;

      console.log(`📊 Found ${total} students with QR tokens`);

      // Process in batches
      for (let i = 0; i < students.length; i += batchSize) {
        const batch = students.slice(i, i + batchSize);
        
        // Generate QRs in parallel for this batch
        const results = await Promise.allSettled(
          batch.map(student => this.generateQRCodeImage(student.qr_code_token))
        );

        // Count successes and failures
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            cached++;
          } else {
            failed++;
          }
          processed++;
        });

        // Progress update
        const progress = ((processed / total) * 100).toFixed(1);
        console.log(`⏳ Progress: ${processed}/${total} (${progress}%) - Cached: ${cached}, Failed: ${failed}`);

        // Delay between batches to avoid overload
        if (i + batchSize < students.length) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const qrsPerSecond = (cached / (duration / 1)).toFixed(0);

      console.log(`✅ QR cache warming completed!`);
      console.log(`📊 Stats:`);
      console.log(`   - Total: ${total}`);
      console.log(`   - Cached: ${cached}`);
      console.log(`   - Failed: ${failed}`);
      console.log(`   - Duration: ${duration}s`);
      console.log(`   - Speed: ${qrsPerSecond} QRs/second`);

      return {
        success: true,
        total,
        cached,
        failed,
        duration: parseFloat(duration),
        qrsPerSecond: parseInt(qrsPerSecond)
      };
    } catch (error) {
      console.error('❌ QR cache warming failed:', error);
      throw error;
    }
  }

  /**
   * Warm QR Cache for Stalls
   * Production: Run when stalls are created
   * 
   * @param {object} sql - Database connection
   */
  static async warmStallQRCache(sql) {
    console.log('🔥 Starting QR cache warming for stalls...');
    const startTime = Date.now();

    try {
      const stalls = await sql`
        SELECT id, stall_number, school_id, qr_code_token 
        FROM stalls 
        WHERE qr_code_token IS NOT NULL
        ORDER BY stall_number ASC
      `;

      const total = stalls.length;
      console.log(`📊 Found ${total} stalls with QR tokens`);

      // Generate all QRs in parallel (stalls are small count, ~200)
      const results = await Promise.allSettled(
        stalls.map(stall => this.generateQRCodeImage(stall.qr_code_token))
      );

      const cached = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`✅ Stall QR cache warming completed!`);
      console.log(`📊 Stats: ${cached} cached, ${failed} failed in ${duration}s`);

      return {
        success: true,
        total,
        cached,
        failed,
        duration: parseFloat(duration)
      };
    } catch (error) {
      console.error('❌ Stall QR cache warming failed:', error);
      throw error;
    }
  }

  /**
   * Clear QR Cache for specific student (after regeneration)
   * @param {string} token - QR token to invalidate
   */
  static async clearQRCache(token) {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
      const cacheKey = `qr:image:${tokenHash}`;
      await redisClient.del(cacheKey);
      return true;
    } catch (error) {
      console.error('Clear QR cache error:', error);
      return false;
    }
  }

  /**
   * Get QR Cache Statistics
   * Production: Monitor cache performance
   */
  static async getQRCacheStats() {
    try {
      const stats = await redisClient.getStats();
      
      if (!stats) {
        return { error: 'Redis not available' };
      }

      // Parse Redis info for relevant QR stats
      const keys = await redisClient.client.keys('qr:image:*');
      
      return {
        connected: stats.connected,
        totalQRsCached: keys.length,
        redisMemory: stats.memory,
        redisStats: stats.info
      };
    } catch (error) {
      console.error('Get QR cache stats error:', error);
      return { error: error.message };
    }
  }
}

export default QRCodeService;
