/**
 * Event Context Middleware
 * Provides validation for event-scoped operations
 */

import Event from '../models/Event.model.js';
import EventRegistration from '../models/EventRegistration.model.js';
import CheckInOut from '../models/CheckInOut.model.js';
import { errorResponse } from '../helpers/response.js';

/**
 * Middleware: Validates that the event exists and is accessible
 * Attaches event data to req.event for downstream use
 * 
 * Usage: Add after authenticateToken middleware
 * Route param required: :eventId
 */
export const requireEventContext = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // Validate eventId format
    if (!eventId) {
      return res.status(400).json(
        errorResponse('Event ID is required', 400)
      );
    }

    // UUID format validation (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return res.status(400).json(
        errorResponse('Invalid event ID format', 400)
      );
    }

    // Check if event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json(
        errorResponse('Event not found', 404)
      );
    }

    // Attach event to request for downstream middleware/controllers
    req.event = event;
    req.eventId = eventId;

    next();
  } catch (error) {
    console.error('requireEventContext error:', error);
    return res.status(500).json(
      errorResponse('Error validating event context', 500)
    );
  }
};

/**
 * Middleware: Validates that the student is registered for the event
 * Requires: authenticateToken, authorizeRoles('STUDENT'), requireEventContext
 * Attaches registration data to req.registration
 * 
 * Usage: Add after requireEventContext
 */
export const requireEventRegistration = async (req, res, next) => {
  try {
    const { eventId, user } = req;

    // Check if student is registered for this event
    const registration = await EventRegistration.findByStudentAndEvent(
      user.id,
      eventId
    );

    if (!registration) {
      return res.status(403).json(
        errorResponse(
          'You are not registered for this event. Please register first.',
          403
        )
      );
    }

    // Check payment status for paid events
    if (req.event.event_type === 'PAID' && registration.payment_status !== 'PAID') {
      return res.status(402).json(
        errorResponse(
          'Payment required. Please complete payment to access this event.',
          402
        )
      );
    }

    // Attach registration to request
    req.registration = registration;

    next();
  } catch (error) {
    console.error('requireEventRegistration error:', error);
    return res.status(500).json(
      errorResponse('Error validating event registration', 500)
    );
  }
};

/**
 * Middleware: Validates that the student has an active check-in for the event
 * Requires: authenticateToken, authorizeRoles('STUDENT'), requireEventContext, requireEventRegistration
 * Attaches active check-in data to req.activeCheckIn
 * 
 * Usage: Add after requireEventRegistration for operations that require physical presence
 */
export const requireActiveCheckIn = async (req, res, next) => {
  try {
    const { eventId, user } = req;

    // Find the most recent check-in for this student in this event
    const activeCheckIn = await CheckInOut.findActiveCheckInForEvent(
      user.id,
      eventId
    );

    if (!activeCheckIn) {
      return res.status(403).json(
        errorResponse(
          'You must be checked in to the event to perform this action. Please scan your QR code at the entrance.',
          403
        )
      );
    }

    // Attach active check-in to request
    req.activeCheckIn = activeCheckIn;

    next();
  } catch (error) {
    console.error('requireActiveCheckIn error:', error);
    return res.status(500).json(
      errorResponse('Error validating active check-in', 500)
    );
  }
};

/**
 * Optional Middleware: Adds event context if eventId is provided, but doesn't fail if missing
 * Useful for endpoints that can work both globally and event-scoped
 * 
 * Usage: Add to routes that should support both modes
 */
export const optionalEventContext = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    if (eventId) {
      const event = await Event.findById(eventId);
      if (event) {
        req.event = event;
        req.eventId = eventId;
      }
    }

    next();
  } catch (error) {
    // Don't fail the request, just log and continue
    console.error('optionalEventContext error:', error);
    next();
  }
};

export default {
  requireEventContext,
  requireEventRegistration,
  requireActiveCheckIn,
  optionalEventContext,
};
