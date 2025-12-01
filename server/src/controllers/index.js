/**
 * Controllers Index
 * Central export point for all controllers
 */

import adminController from './admin.controller.js';
import studentController from './student.controller.js';
import volunteerController from './volunteer.controller.js';
import stallController from './stall.controller.js';
import feedbackController from './feedback.controller.js';
import rankingController from './ranking.controller.js';
import checkInOutController from './checkInOut.controller.js';

export {
  adminController,
  studentController,
  volunteerController,
  stallController,
  feedbackController,
  rankingController,
  checkInOutController
};
