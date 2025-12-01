/**
 * Routes Index
 * Central export point for all routes
 */

import adminRoutes from './admin.route.js';
import studentRoutes from './student.route.js';
import volunteerRoutes from './volunteer.route.js';
import stallRoutes from './stall.route.js';
import feedbackRoutes from './feedback.route.js';
import rankingRoutes from './ranking.route.js';
import checkInOutRoutes from './checkInOut.route.js';
import eventManagerRoutes from './eventManager.route.js';

export {
  adminRoutes,
  studentRoutes,
  volunteerRoutes,
  stallRoutes,
  feedbackRoutes,
  rankingRoutes,
  checkInOutRoutes,
  eventManagerRoutes
};
