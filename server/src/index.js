import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: true, // Allow all origins or specify
  // origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true // Enable cookies and authentication headers
}));
app.use(compression());
app.use(cookieParser()); // Parse cookies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'SGT University Event Management API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.get('/api', (req, res) => {
  res.json({
    message: 'SGT University Event Management API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      students: '/api/student',
      volunteers: '/api/volunteer',
      stalls: '/api/stall',
      admin: '/api/admin',
      feedback: '/api/feedback',
      ranking: '/api/ranking',
      checkInOut: '/api/check-in-out',
      eventManagers: '/api/event-managers' 
    }
  });
});

// Import routes
import {
  adminRoutes,
  studentRoutes,
  volunteerRoutes,
  stallRoutes,
  feedbackRoutes,
  rankingRoutes,
  checkInOutRoutes,
  eventManagerRoutes
} from './routes/index.js';

// Use routes
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/volunteer', volunteerRoutes);
app.use('/api/stall', stallRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/check-in-out', checkInOutRoutes);
app.use('/api/event-manager', eventManagerRoutes); 

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  // Don't log full error stack in production
  if (process.env.NODE_ENV === 'production') {
    console.error('Error:', err.message);
  } else {
    console.error('Error:', err);
  }
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  if (process.env.NODE_ENV === 'production') {
    console.log(`✅ Server ready on port ${PORT}`);
  } else {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
    console.log(`💚 Health check at http://localhost:${PORT}/health`);
    console.log(`🎓 SGT University Event Management System`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 CORS allowed from: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});``

export default app;
