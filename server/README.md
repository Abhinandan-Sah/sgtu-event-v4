# SGTU Event Management System - Server

Backend API for SGTU Event Management System built with Node.js, Express, and PostgreSQL (Neon).

## 🚀 Quick Setup for New Developers

### Prerequisites
- Node.js v18+ installed
- Neon PostgreSQL account (or any PostgreSQL database)
- Git

### 1. Clone the Repository
```bash
git clone https://github.com/Abhinandan-Sah/sgtu-event-v3.git
cd sgtu-event-v3/server
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Create a `.env` file in the `server` directory:
```env
# Database
DATABASE_URL=your_neon_postgres_connection_string

# JWT Secret
JWT_SECRET=your_jwt_secret_key_here

# Server
PORT=5000
NODE_ENV=development

# Redis (Optional - for caching)
REDIS_URL=your_redis_url

# Razorpay (For payment integration)
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

### 4. Database Setup (IMPORTANT!)

Run these commands in order:

```bash
# Step 1: Run all migrations (creates tables and adds all required columns)
npm run migrate

# Step 2: Run multi-event migration (adds event_id, student tracking, triggers)
npm run migrate:multi-event

# Step 3: Seed the database with sample data
npm run seed

# Step 4: Verify everything is set up correctly
npm run migrate:verify
```

**Alternative: One-command setup (recommended)**
```bash
npm run setup
```

**For fresh setup (drops existing data):**
```bash
npm run setup:fresh
```

### 5. Start the Server
```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm start
```

Server will start at `http://localhost:5000`

---

## 📋 What Does Migration 005 Do?

The multi-event migration (`005_add_multi_event_support.sql`) transforms the system and adds:

1. ✅ Event managers and event management tables
2. ✅ Multi-event support with paid/free events
3. ✅ `event_id` column to `check_in_outs` table
4. ✅ Student tracking columns (`total_events_registered`, `total_paid_events`, `total_spent_on_events`)
5. ✅ Automatic triggers for registration counting
6. ✅ Razorpay payment integration tables
7. ✅ Event permissions and audit logging

**This migration is crucial!** Without it, you'll get errors like:
- ❌ "column total_events_registered does not exist"
- ❌ "column event_id does not exist"

---

## 🧪 Testing the APIs



### API Endpoints

Import the Postman collection from `/postman` folder (if available) or test these endpoints:

**Base URL:** `http://localhost:5000/api`

#### Admin Routes
- POST `/admin/login` - Admin login
- GET `/admin/events` - Get all events
- POST `/admin/events/:id/approve` - Approve event
- POST `/admin/events/:id/reject` - Reject event

#### Event Manager Routes
- POST `/event-manager/login` - Manager login
- POST `/event-manager/events` - Create event
- GET `/event-manager/events` - Get my events
- PUT `/event-manager/events/:id` - Update event
- GET `/event-manager/events/:id/analytics` - Event analytics

#### Student Routes
- POST `/student/login` - Student login
- GET `/student/events` - Browse available events
- POST `/student/events/:id/register` - Register for free event
- GET `/student/my-events` - Get registered events

#### Volunteer Routes
- POST `/volunteer/login` - Volunteer login
- GET `/volunteer/assigned-events` - Get assigned events

---

## 📁 Project Structure

```
server/
├── src/
│   ├── config/          # Database & Redis config
│   ├── controllers/     # Route controllers
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── middleware/      # Auth, validation, etc.
│   ├── services/        # Business logic
│   ├── helpers/         # Utility functions
│   ├── migrations/      # Database migrations
│   ├── seeders/         # Sample data
│   └── index.js         # App entry point
├── setup-database.js    # DB setup script (IMPORTANT!)
├── package.json
└── README.md
```

---

## 🔧 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm start` | Start production server |
| `npm run migrate` | Run database migrations (001-004) |
| `npm run migrate:multi-event` | **Run migration 005 (multi-event support)** |
| `npm run seed` | Seed database with sample data |
| `npm run setup` | **Complete setup (migrate + multi-event + seed)** |
| `npm run setup:fresh` | Fresh setup (drops existing data) |
| `npm run migrate:verify` | Verify database schema |

---

## 🐛 Common Issues & Solutions

### Error: "column total_events_registered does not exist"
**Solution:** Run `npm run migrate:multi-event`

### Error: "column event_id does not exist" in check_in_outs
**Solution:** Run `npm run migrate:multi-event`

### Error: "relation does not exist"
**Solution:** Run `npm run migrate` first, then `npm run migrate:multi-event`

### Can't connect to database
**Solution:** Check your `.env` file has correct `DATABASE_URL`

### All APIs return 500 errors
**Solution:** 
1. Check server logs
2. Verify database connection
3. Run `npm run setup` for complete setup

---

## 🔒 Security Notes

- Never commit `.env` file
- Change default passwords after first login
- Use strong JWT_SECRET in production
- Enable HTTPS in production

---

## 📚 Technology Stack

- **Runtime:** Node.js v18+
- **Framework:** Express.js
- **Database:** PostgreSQL (Neon Serverless)
- **Caching:** Redis (Optional)
- **Authentication:** JWT
- **Payment:** Razorpay
- **File Upload:** Multer
- **Validation:** Express Validator

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 💬 Support

For issues or questions:
- Open a GitHub issue
- Contact: [Your Email]

---

**🎉 You're all set! Happy coding!**
