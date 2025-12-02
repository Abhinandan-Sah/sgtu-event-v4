import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload event banner image to Cloudinary
 * @param {string} base64Image - Base64 encoded image string
 * @param {string} eventId - Event ID for folder organization
 * @returns {Promise<string>} - Cloudinary URL
 */
const uploadEventBanner = async (base64Image, eventId) => {
  try {
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: `sgtu-events/events/${eventId}/banner`,
      resource_type: 'image',
      transformation: [
        { width: 1920, height: 1080, crop: 'limit' },
        { quality: 'auto', fetch_format: 'auto' }
      ]
    });
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading event banner to Cloudinary:', error);
    throw new Error('Failed to upload event banner image');
  }
};

/**
 * Upload event image to Cloudinary
 * @param {string} base64Image - Base64 encoded image string
 * @param {string} eventId - Event ID for folder organization
 * @returns {Promise<string>} - Cloudinary URL
 */
const uploadEventImage = async (base64Image, eventId) => {
  try {
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: `sgtu-events/events/${eventId}/images`,
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 800, crop: 'limit' },
        { quality: 'auto', fetch_format: 'auto' }
      ]
    });
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading event image to Cloudinary:', error);
    throw new Error('Failed to upload event image');
  }
};

/**
 * Upload stall image to Cloudinary
 * @param {string} base64Image - Base64 encoded image string
 * @param {string} eventId - Event ID for folder organization
 * @param {string} stallId - Stall ID for file naming
 * @returns {Promise<string>} - Cloudinary URL
 */
const uploadStallImage = async (base64Image, eventId, stallId) => {
  try {
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: `sgtu-events/events/${eventId}/stalls`,
      public_id: `stall_${stallId}`,
      resource_type: 'image',
      transformation: [
        { width: 800, height: 600, crop: 'limit' },
        { quality: 'auto', fetch_format: 'auto' }
      ]
    });
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading stall image to Cloudinary:', error);
    throw new Error('Failed to upload stall image');
  }
};

/**
 * Delete image from Cloudinary
 * @param {string} imageUrl - Cloudinary image URL to delete
 * @returns {Promise<void>}
 */
const deleteImage = async (imageUrl) => {
  try {
    // Extract public_id from Cloudinary URL
    const urlParts = imageUrl.split('/');
    const versionIndex = urlParts.findIndex(part => part.startsWith('v'));
    const publicIdWithExtension = urlParts.slice(versionIndex + 1).join('/');
    const publicId = publicIdWithExtension.replace(/\.[^/.]+$/, '');

    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    // Don't throw error, just log it (image deletion is not critical)
  }
};

export {
  uploadEventBanner,
  uploadEventImage,
  uploadStallImage,
  deleteImage,
};
