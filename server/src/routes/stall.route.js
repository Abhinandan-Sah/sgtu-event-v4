import express from 'express';
const router = express.Router();
import stallController from '../controllers/stall.controller.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

/**
 * Stall Routes
 * Security: Router-level middleware for authenticated access
 * 
 * Note: Stall QR codes are physically posted at stalls.
 * Students must be logged in to scan and interact with stalls.
 */

// 🔒 Apply authentication to ALL routes
router.use(authenticateToken);

// View routes (authenticated users only)
router.get('/', stallController.getAllStalls);
router.get('/:id', stallController.getStallById);
router.get('/number/:stallNumber', stallController.getStallByNumber);
router.get('/school/:schoolName', stallController.getStallsBySchool);
router.get('/:id/qr-code', stallController.getStallQRCode);

// Staff-only routes (volunteers, event managers, admins)
router.get('/:id/stats', authorizeRoles('ADMIN', 'EVENT_MANAGER', 'VOLUNTEER'), stallController.getStallStats);

// Management routes (admin and event manager only)
router.post('/', authorizeRoles('ADMIN', 'EVENT_MANAGER'), stallController.createStall);
router.put('/:id', authorizeRoles('ADMIN', 'EVENT_MANAGER'), stallController.updateStall);
router.delete('/:id', authorizeRoles('ADMIN', 'EVENT_MANAGER'), stallController.deleteStall);

export default router;
