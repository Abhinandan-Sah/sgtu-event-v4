import { query } from '../config/db.js';
import { errorResponse } from '../helpers/response.js';

/**
 * Check if rankings are published for an event
 * Controls visibility based on event status and admin override
 * 
 * Logic:
 * 1. If rankings_published = TRUE → Always show (admin published early)
 * 2. If rankings_published = FALSE → Never show (admin blocked publication)
 * 3. If rankings_published = NULL → Auto-logic:
 *    - Show if event.status = 'COMPLETED'
 *    - Hide for DRAFT, PENDING_APPROVAL, APPROVED, ACTIVE, REJECTED, CANCELLED
 * 
 * @middleware
 */
export const checkRankingsPublished = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    
    if (!eventId) {
      return errorResponse(res, 'Event ID is required', 400);
    }
    
    // Get event details
    const eventQuery = `
      SELECT id, event_name, status, rankings_published 
      FROM events 
      WHERE id = $1
    `;
    const eventResult = await query(eventQuery, [eventId]);
    
    if (eventResult.length === 0) {
      return errorResponse(res, 'Event not found', 404);
    }
    
    const event = eventResult[0];
    
    // Decision tree for ranking visibility
    
    // Case 1: Admin explicitly published (override)
    if (event.rankings_published === true) {
      req.event = event;
      return next();
    }
    
    // Case 2: Admin explicitly blocked publication (override)
    if (event.rankings_published === false) {
      return errorResponse(
        res, 
        'Rankings are currently hidden by event organizers and will be revealed soon', 
        403
      );
    }
    
    // Case 3: Auto-logic (rankings_published = NULL)
    // Show only if event is completed
    if (event.status === 'COMPLETED') {
      req.event = event;
      return next();
    }
    
    // Default: Hide rankings during event
    return errorResponse(
      res, 
      'Rankings will be revealed after the event concludes', 
      403
    );
    
  } catch (error) {
    console.error('Error checking rankings publication status:', error);
    return errorResponse(res, 'Error checking rankings availability', 500);
  }
};
