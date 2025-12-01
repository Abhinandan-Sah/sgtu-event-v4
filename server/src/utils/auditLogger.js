/**
 * Audit Logger Utility
 * Tracks critical operations for security and compliance
 */
import { query } from '../config/db.js';

/**
 * Audit event types
 */
export const AuditEventType = {
  EVENT_CREATED: 'EVENT_CREATED',
  EVENT_UPDATED: 'EVENT_UPDATED',
  EVENT_DELETED: 'EVENT_DELETED',
  EVENT_APPROVED: 'EVENT_APPROVED',
  EVENT_REJECTED: 'EVENT_REJECTED',
  EVENT_STATUS_CHANGED: 'EVENT_STATUS_CHANGED',
  VOLUNTEER_ASSIGNED: 'VOLUNTEER_ASSIGNED',
  VOLUNTEER_REMOVED: 'VOLUNTEER_REMOVED',
  REGISTRATION_CREATED: 'REGISTRATION_CREATED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  MANAGER_CREATED: 'MANAGER_CREATED',
  MANAGER_UPDATED: 'MANAGER_UPDATED',
  MANAGER_DELETED: 'MANAGER_DELETED',
  MANAGER_APPROVED: 'MANAGER_APPROVED',
  MANAGER_DEACTIVATED: 'MANAGER_DEACTIVATED'
};

/**
 * Log audit event
 * @param {Object} auditData - Audit event data
 * @param {string} auditData.event_type - Type of event (from AuditEventType)
 * @param {string} auditData.user_id - ID of user performing the action
 * @param {string} auditData.user_role - Role of user (ADMIN, EVENT_MANAGER, STUDENT, etc.)
 * @param {string} auditData.resource_type - Type of resource affected (EVENT, VOLUNTEER, etc.)
 * @param {string} auditData.resource_id - ID of affected resource
 * @param {Object} auditData.metadata - Additional context data
 * @param {string} auditData.ip_address - IP address of request
 * @param {string} auditData.user_agent - User agent string
 * @returns {Promise<void>}
 */
export const logAuditEvent = async (auditData) => {
  const {
    event_type,
    user_id,
    user_role,
    resource_type,
    resource_id,
    metadata = {},
    ip_address = null,
    user_agent = null
  } = auditData;

  try {
    // For now, log to console and/or winston logger
    // In production, this should write to a dedicated audit_logs table
    const auditLog = {
      timestamp: new Date().toISOString(),
      event_type,
      user_id,
      user_role,
      resource_type,
      resource_id,
      metadata,
      ip_address,
      user_agent
    };

    console.log('[AUDIT]', JSON.stringify(auditLog));

    // TODO: Implement database logging when audit_logs table is created
    /*
    await query(
      `INSERT INTO audit_logs 
       (event_type, user_id, user_role, resource_type, resource_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [event_type, user_id, user_role, resource_type, resource_id, JSON.stringify(metadata), ip_address, user_agent]
    );
    */
  } catch (error) {
    console.error('Audit logging error:', error);
    // Don't throw - audit logging failures should not break the main operation
  }
};

/**
 * Express middleware to extract request metadata for audit logging
 */
export const auditMiddleware = (req, res, next) => {
  req.auditLog = (event_type, resource_type, resource_id, metadata = {}) => {
    logAuditEvent({
      event_type,
      user_id: req.user?.id || null,
      user_role: req.user?.role || 'ANONYMOUS',
      resource_type,
      resource_id,
      metadata,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('user-agent')
    });
  };
  next();
};

/**
 * Create audit log table migration (for future use)
 * 
 * CREATE TABLE IF NOT EXISTS audit_logs (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   event_type VARCHAR(50) NOT NULL,
 *   user_id UUID,
 *   user_role VARCHAR(20),
 *   resource_type VARCHAR(50) NOT NULL,
 *   resource_id UUID NOT NULL,
 *   metadata JSONB DEFAULT '{}'::jsonb,
 *   ip_address VARCHAR(45),
 *   user_agent TEXT,
 *   created_at TIMESTAMP DEFAULT NOW()
 * );
 * 
 * CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
 * CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
 * CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
 * CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
 */

export default {
  AuditEventType,
  logAuditEvent,
  auditMiddleware
};
