import { query } from '../config/db.js';
import { errorResponse } from '../helpers/response.js';

/**
 * Inject event_id from URL params into request body
 * Used for event manager convenience routes
 * @middleware
 */
export const injectEventIdFromParams = (req, res, next) => {
  if (req.params.eventId) {
    req.body.event_id = req.params.eventId;
  }
  next();
};

/**
 * Map resource-specific ID to generic 'id' param
 * Allows reusing controllers that expect req.params.id
 * @param {string} resourceParam - Name of the resource parameter (e.g., 'stallId', 'volunteerId')
 * @middleware
 */
export const mapResourceIdToGenericId = (resourceParam) => {
  return (req, res, next) => {
    if (req.params[resourceParam]) {
      req.params.id = req.params[resourceParam];
    }
    next();
  };
};

/**
 * Validate event ownership before allowing operations
 * Ensures event managers can only manage their own events
 * @middleware
 */
export const validateEventOwnership = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const managerId = req.user.id;
    
    if (!eventId) {
      return errorResponse(res, 'Event ID is required', 400);
    }
    
    // Check if event exists and belongs to this manager
    const eventQuery = 'SELECT * FROM events WHERE id = $1';
    const eventResult = await query(eventQuery, [eventId]);
    
    if (eventResult.length === 0) {
      return errorResponse(res, 'Event not found', 404);
    }
    
    const event = eventResult[0];
    
    // Validate ownership
    if (event.created_by_manager_id !== managerId) {
      return errorResponse(res, 'Unauthorized: You can only manage resources for your own events', 403);
    }
    
    // Check if event is in editable status (DRAFT or REJECTED)
    if (!['DRAFT', 'REJECTED'].includes(event.status)) {
      return errorResponse(res, `Cannot modify resources for events in ${event.status} status. Only DRAFT and REJECTED events can be modified.`, 400);
    }
    
    // Attach event to request for downstream use if needed
    req.managedEvent = event;
    
    next();
  } catch (error) {
    console.error('Event ownership validation error:', error);
    return errorResponse(res, 'Error validating event ownership', 500);
  }
};

/**
 * Filter query results by event_id for GET requests
 * Adds event_id to query parameters
 * @middleware
 */
export const filterByEventId = (req, res, next) => {
  if (req.params.eventId) {
    req.query.event_id = req.params.eventId;
  }
  next();
};

/**
 * Validate event ownership for read-only operations
 * Allows viewing completed/active events (not just draft)
 * Skips validation for ADMIN role
 * @middleware
 */
export const validateEventOwnershipForViewOnly = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const managerId = req.user.id;
    const userRole = req.user.role;
    
    // Skip validation for ADMIN role
    if (userRole === 'ADMIN') {
      return next();
    }
    
    if (!eventId) {
      return errorResponse(res, 'Event ID is required', 400);
    }
    
    // Check if event exists and belongs to this manager
    const eventQuery = 'SELECT * FROM events WHERE id = $1';
    const eventResult = await query(eventQuery, [eventId]);
    
    if (eventResult.length === 0) {
      return errorResponse(res, 'Event not found', 404);
    }
    
    const event = eventResult[0];
    
    // Validate ownership (EVENT_MANAGER can only view their own events)
    if (event.created_by_manager_id !== managerId) {
      return errorResponse(res, 'Unauthorized: You can only view rankings for your own events', 403);
    }
    
    // Attach event to request for downstream use if needed
    req.managedEvent = event;
    
    next();
  } catch (error) {
    console.error('Event ownership validation error:', error);
    return errorResponse(res, 'Error validating event ownership', 500);
  }
};
