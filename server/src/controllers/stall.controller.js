import Stall from '../models/Stall.model.js';
import School from '../models/School.model.js';
import QRCodeService from '../services/qrCode.js';
import { successResponse, errorResponse } from '../helpers/response.js';
import { query } from '../config/db.js';
import { uploadStallImage } from '../services/cloudinary.js';


/**
 * Stall Controller
 * Handles stall operations and QR code retrieval
 */

/**
 * Get all stalls
 * @route GET /api/stall
 */
const getAllStalls = async (req, res, next) => {
  try {
    const stalls = await Stall.findAll(query);
    return successResponse(res, stalls);
  } catch (error) {
    next(error);
  }
};

/**
 * Get stall by ID
 * @route GET /api/stall/:id
 */
const getStallById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const stall = await Stall.findById(id, query);

    if (!stall) {
      return errorResponse(res, 'Stall not found', 404);
    }

    return successResponse(res, stall);
  } catch (error) {
    next(error);
  }
};

/**
 * Get stall by stall number
 * @route GET /api/stall/number/:stallNumber
 */
const getStallByNumber = async (req, res, next) => {
  try {
    const { stallNumber } = req.params;
    const stall = await Stall.findByStallNumber(parseInt(stallNumber), query);

    if (!stall) {
      return errorResponse(res, 'Stall not found', 404);
    }

    return successResponse(res, stall);
  } catch (error) {
    next(error);
  }
};

/**
 * Get stall QR code
 * @route GET /api/stall/:id/qr-code
 */
const getStallQRCode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const stall = await Stall.findById(id, query);

    if (!stall) {
      return errorResponse(res, 'Stall not found', 404);
    }

    if (!stall.qr_code_token) {
      return errorResponse(res, 'QR code not generated for this stall', 404);
    }

    // Generate QR code image
    const qrCodeImage = await QRCodeService.generateQRCodeImage(stall.qr_code_token);

    return successResponse(res, {
      qr_code: qrCodeImage,
      token: stall.qr_code_token,
      stall_number: stall.stall_number,
      stall_name: stall.stall_name
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get stalls by school name
 * @route GET /api/stall/school/:schoolName
 */
const getStallsBySchool = async (req, res, next) => {
  try {
    const { schoolName } = req.params;
    const stalls = await Stall.findBySchoolName(schoolName, query);
    return successResponse(res, stalls);
  } catch (error) {
    next(error);
  }
};

/**
 * Get stall visitor statistics
 * @route GET /api/stall/:id/stats
 */
const getStallStats = async (req, res, next) => {
  try {
    const { id } = req.params;
    const CheckInOut = require('../models/CheckInOut.model');
    
    const stall = await Stall.findById(id, query);
    if (!stall) {
      return errorResponse(res, 'Stall not found', 404);
    }

    const checkIns = await CheckInOut.findByStallId(id);
    
    return successResponse(res, {
      stall_name: stall.stall_name,
      stall_number: stall.stall_number,
      total_visits: checkIns.length,
      active_visitors: checkIns.filter(c => !c.check_out_time).length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new stall (admin and event manager)
 * @route POST /api/stall
 */
const createStall = async (req, res, next) => {
  try {
    const { stall_name, stall_number, school_id, school_name, description, location, event_id, image_base64 } = req.body;

    if (!stall_name || !stall_number) {
      return errorResponse(res, 'Stall name and number are required', 400);
    }

    if (!event_id) {
      return errorResponse(res, 'event_id is required', 400);
    }

    // Resolve school_id from school_name if provided
    let resolvedSchoolId = school_id;
    if (!resolvedSchoolId && school_name) {
      const school = await School.findByName(school_name, query);
      if (!school) {
        return errorResponse(res, 'School not found', 404);
      }
      resolvedSchoolId = school.id;
    }

    if (!resolvedSchoolId) {
      return errorResponse(res, 'Either school_id or school_name is required', 400);
    }

    // Check if stall number already exists for this event
    const existingStallQuery = `
      SELECT * FROM stalls 
      WHERE stall_number = $1 AND event_id = $2 AND is_active = true
    `;
    const existingStallResult = await query(existingStallQuery, [stall_number, event_id]);
    if (existingStallResult.length > 0) {
      return errorResponse(res, 'Stall number already exists for this event', 409);
    }

    const stallData = {
      stall_name,
      stall_number,
      school_id: resolvedSchoolId,
      description: description || null,
      location: location || null,
      event_id,
      image_url: null
    };

    // Create stall first
    const newStall = await Stall.create(stallData, query);

    // Handle image upload if provided
    if (image_base64) {
      try {
        const imageUrl = await uploadStallImage(image_base64, event_id, newStall.id);
        
        // Update stall with image URL
        const updateQuery = `
          UPDATE stalls SET image_url = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 RETURNING *
        `;
        const updatedResult = await query(updateQuery, [imageUrl, newStall.id]);
        const updatedStall = updatedResult[0];
        
        return successResponse(res, updatedStall, 'Stall created successfully with image', 201);
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        // Return the stall without image if upload fails
        return successResponse(res, newStall, 'Stall created but image upload failed', 201);
      }
    }

    return successResponse(res, newStall, 'Stall created successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Update stall (admin and event manager)
 * @route PUT /api/stall/:id
 */
const updateStall = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { stall_name, stall_number, description, location, image_url, is_active } = req.body;

    // Prevent stall_number changes (tied to QR code)
    if (stall_number !== undefined) {
      return errorResponse(res, 'Stall number cannot be changed (linked to QR code)', 400);
    }

    const updateData = {};
    if (stall_name !== undefined) updateData.stall_name = stall_name;
    if (description !== undefined) updateData.description = description;
    if (location !== undefined) updateData.location = location;
    if (image_url !== undefined) updateData.image_url = image_url;
    if (is_active !== undefined) updateData.is_active = is_active;

    const updatedStall = await Stall.update(id, updateData, query);
    if (!updatedStall) {
      return errorResponse(res, 'Stall not found', 404);
    }

    return successResponse(res, updatedStall, 'Stall updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Delete stall (admin and event manager)
 * @route DELETE /api/stall/:id
 */
const deleteStall = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const deleted = await Stall.delete(id, query);
    if (!deleted) {
      return errorResponse(res, 'Stall not found', 404);
    }

    return successResponse(res, null, 'Stall deleted (soft delete - marked inactive)');
  } catch (error) {
    next(error);
  }
};

export default {
  getAllStalls,
  getStallById,
  getStallByNumber,
  getStallQRCode,
  getStallsBySchool,
  getStallStats,
  createStall,
  updateStall,
  deleteStall
};
