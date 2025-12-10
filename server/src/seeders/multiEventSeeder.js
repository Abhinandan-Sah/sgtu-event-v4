/**
 * Multi-Event Management System Seeder
 * Seeds sample data for testing multi-event feature
 * 
 * Creates:
 * - 3 Event Managers (1 approved, 1 pending, 1 rejected)
 * - 8 Events (free/paid, various statuses)
 * - 15+ Student Registrations
 * - 5+ Volunteer Assignments
 * 
 * Usage: node src/seeders/multiEventSeeder.js
 */

import bcryptjs from 'bcryptjs';
import { query } from '../config/db.js';

// Simple logger replacement
const logger = {
  info: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
};

// ============================================================
// SEED DATA CONFIGURATION
// ============================================================

const EVENT_MANAGERS = [
  {
    email: 'tech.lead@sgtu.edu',
    password: 'TechLead@123',
    full_name: 'Dr. Rajesh Kumar',
    phone: '9876543210',
    school_name: 'School of Engineering', // Will be converted to school_id
    is_approved_by_admin: true,
    is_active: true,
  },
  {
    email: 'cultural.head@sgtu.edu',
    password: 'Culture@123',
    full_name: 'Prof. Priya Sharma',
    phone: '9876543211',
    school_name: 'School of Arts', // Will be converted to school_id
    is_approved_by_admin: true,
    is_active: true,
  },
  {
    email: 'external.organizer@events.com',
    password: 'External@123',
    full_name: 'Amit Patel',
    phone: '9876543212',
    school_name: 'School of Management', // Will be converted to school_id
    is_approved_by_admin: false, // Pending approval
    is_active: true,
  },
];

const EVENTS = [
  // FREE EVENTS
  {
    event_name: 'AI & Machine Learning Workshop',
    event_code: 'AI-WORKSHOP-2025',
    description: 'Hands-on workshop covering fundamentals of AI, ML algorithms, and practical applications using Python and TensorFlow.',
    event_type: 'FREE',
    price: 0.00,
    event_category: 'Workshop',
    tags: ['AI', 'Machine Learning', 'Python', 'TensorFlow', 'Workshop'],
    venue: 'Seminar Hall A, Block 3',
    start_date: new Date('2025-02-15T10:00:00'),
    end_date: new Date('2025-02-15T16:00:00'),
    registration_start_date: new Date('2025-01-20T00:00:00'),
    registration_end_date: new Date('2025-02-14T23:59:59'),
    max_capacity: 100,
    waitlist_enabled: true,
    status: 'APPROVED',
    is_visible: true,
    manager_index: 0, // Dr. Rajesh Kumar
  },
  {
    event_name: 'Cultural Fest 2025 - Sangeet Night',
    event_code: 'SANGEET-2025',
    description: 'Annual music festival featuring classical, folk, and contemporary performances by students and guest artists.',
    event_type: 'FREE',
    price: 0.00,
    event_category: 'Cultural',
    tags: ['Music', 'Cultural', 'Performance', 'Festival'],
    venue: 'University Auditorium',
    start_date: new Date('2025-03-20T18:00:00'),
    end_date: new Date('2025-03-20T22:00:00'),
    registration_start_date: new Date('2025-02-01T00:00:00'),
    registration_end_date: new Date('2025-03-19T23:59:59'),
    max_capacity: 500,
    waitlist_enabled: false,
    status: 'APPROVED',
    is_visible: true,
    manager_index: 1, // Prof. Priya Sharma
  },
  {
    event_name: 'Career Counseling Session',
    event_code: 'CAREER-GUIDE-2025',
    description: 'Expert guidance on career planning, resume building, and interview preparation for final year students.',
    event_type: 'FREE',
    price: 0.00,
    event_category: 'Seminar',
    tags: ['Career', 'Counseling', 'Jobs', 'Placement'],
    venue: 'Conference Room, Administration Block',
    start_date: new Date('2025-02-10T14:00:00'),
    end_date: new Date('2025-02-10T17:00:00'),
    registration_start_date: new Date('2025-01-25T00:00:00'),
    registration_end_date: new Date('2025-02-09T23:59:59'),
    max_capacity: 50,
    waitlist_enabled: false,
    status: 'APPROVED',
    is_visible: true,
    manager_index: 0, // Dr. Rajesh Kumar
  },

  // PAID EVENTS
  {
    event_name: 'National Coding Championship',
    event_code: 'CODE-CHAMP-2025',
    description: 'Competitive coding competition with prizes worth ₹1,00,000. 3 rounds: MCQ, Problem Solving, and Final Round.',
    event_type: 'PAID',
    price: 299.00,
    event_category: 'Competition',
    tags: ['Coding', 'Competition', 'Programming', 'Hackathon'],
    venue: 'Computer Lab 1-3, IT Block',
    start_date: new Date('2025-03-05T09:00:00'),
    end_date: new Date('2025-03-05T18:00:00'),
    registration_start_date: new Date('2025-02-01T00:00:00'),
    registration_end_date: new Date('2025-03-04T23:59:59'),
    max_capacity: 200,
    waitlist_enabled: true,
    status: 'APPROVED',
    is_visible: true,
    manager_index: 0, // Dr. Rajesh Kumar
  },
  {
    event_name: 'Advanced Web Development Bootcamp',
    event_code: 'WEBDEV-BOOT-2025',
    description: '3-day intensive bootcamp covering React, Node.js, MongoDB, deployment. Certificate of completion provided.',
    event_type: 'PAID',
    price: 1499.00,
    event_category: 'Workshop',
    tags: ['Web Development', 'React', 'Node.js', 'Full Stack', 'Bootcamp'],
    venue: 'Lab 201, IT Building',
    start_date: new Date('2025-04-10T10:00:00'),
    end_date: new Date('2025-04-12T17:00:00'),
    registration_start_date: new Date('2025-03-01T00:00:00'),
    registration_end_date: new Date('2025-04-09T23:59:59'),
    max_capacity: 60,
    waitlist_enabled: true,
    status: 'APPROVED',
    is_visible: true,
    manager_index: 0, // Dr. Rajesh Kumar
  },
  {
    event_name: 'Business Plan Competition',
    event_code: 'BIZ-PLAN-2025',
    description: 'Startup pitch competition judged by industry experts. Winner gets ₹50,000 seed funding and mentorship.',
    event_type: 'PAID',
    price: 499.00,
    event_category: 'Competition',
    tags: ['Business', 'Startup', 'Entrepreneurship', 'Competition'],
    venue: 'Innovation Center',
    start_date: new Date('2025-03-25T10:00:00'),
    end_date: new Date('2025-03-25T17:00:00'),
    registration_start_date: new Date('2025-02-15T00:00:00'),
    registration_end_date: new Date('2025-03-24T23:59:59'),
    max_capacity: 30,
    waitlist_enabled: false,
    status: 'APPROVED',
    is_visible: true,
    manager_index: 1, // Prof. Priya Sharma
  },

  // EVENTS WITH DIFFERENT STATUSES
  {
    event_name: 'Robotics Workshop',
    event_code: 'ROBO-WORK-2025',
    description: 'Build and program robots using Arduino. All materials provided.',
    event_type: 'PAID',
    price: 799.00,
    event_category: 'Workshop',
    tags: ['Robotics', 'Arduino', 'Electronics', 'Workshop'],
    venue: 'Robotics Lab',
    start_date: new Date('2025-04-20T10:00:00'),
    end_date: new Date('2025-04-21T17:00:00'),
    registration_start_date: new Date('2025-03-15T00:00:00'),
    registration_end_date: new Date('2025-04-19T23:59:59'),
    max_capacity: 40,
    waitlist_enabled: true,
    status: 'PENDING_APPROVAL', // Waiting for admin approval
    is_visible: false,
    manager_index: 0, // Dr. Rajesh Kumar
  },
  {
    event_name: 'Data Science Masterclass',
    event_code: 'DS-MASTER-2025',
    description: 'Learn data analysis, visualization, and predictive modeling with Python.',
    event_type: 'PAID',
    price: 999.00,
    event_category: 'Workshop',
    tags: ['Data Science', 'Python', 'Analytics', 'Machine Learning'],
    venue: 'Computer Lab 4',
    start_date: new Date('2025-05-01T10:00:00'),
    end_date: new Date('2025-05-02T17:00:00'),
    registration_start_date: new Date('2025-04-01T00:00:00'),
    registration_end_date: new Date('2025-04-30T23:59:59'),
    max_capacity: 50,
    waitlist_enabled: true,
    status: 'DRAFT', // Still being created
    is_visible: false,
    manager_index: 0, // Dr. Rajesh Kumar
  },
];

// ============================================================
// SEEDER FUNCTIONS
// ============================================================

/**
 * Clear existing multi-event data (for clean re-seeding)
 */
async function clearExistingData() {
  logger.info('🧹 Clearing existing multi-event data...');
  
  try {
    // Order matters due to foreign key constraints
    await query('DELETE FROM event_registrations WHERE 1=1');
    await query('DELETE FROM event_volunteers WHERE 1=1');
    await query('DELETE FROM events WHERE 1=1');
    await query('DELETE FROM event_managers WHERE 1=1');
    
    logger.info('✅ Existing data cleared');
  } catch (error) {
    logger.error('❌ Error clearing data:', error);
    throw error;
  }
}

/**
 * Seed Event Managers
 */
async function seedEventManagers() {
  logger.info('\n👤 Seeding Event Managers...');
  
  const managerIds = [];
  
  for (const manager of EVENT_MANAGERS) {
    try {
      const passwordHash = await bcryptjs.hash(manager.password, 10);
      
      // Get school_id from school_name
      const schoolResult = await query('SELECT id FROM schools WHERE school_name = $1 LIMIT 1', [manager.school_name]);
      if (!schoolResult || schoolResult.length === 0) {
        logger.error(`   ❌ School not found: ${manager.school_name}`);
        continue;
      }
      const schoolId = schoolResult[0].id;
      
      // Get admin ID for approved managers (use first admin)
      let approvedByAdminId = null;
      let approvedAt = null;
      
      if (manager.is_approved_by_admin) {
        const adminResult = await query('SELECT id FROM admins LIMIT 1');
        if (adminResult && adminResult.length > 0) {
          approvedByAdminId = adminResult[0].id;
          approvedAt = new Date();
        }
      }
      
      const result = await query(`
        INSERT INTO event_managers (
          email, password_hash, full_name, phone, school_id,
          is_approved_by_admin, approved_by_admin_id, approved_at, is_active, password_reset_required
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, email, full_name
      `, [
        manager.email,
        passwordHash,
        manager.full_name,
        manager.phone,
        schoolId,
        manager.is_approved_by_admin,
        approvedByAdminId,
        approvedAt,
        manager.is_active,
        false, // password_reset_required = false for seeded accounts with known passwords
      ]);
      
      managerIds.push(result[0].id);
      logger.info(`   ✅ Created: ${result[0].full_name} (${result[0].email}) - ${manager.is_approved_by_admin ? 'APPROVED' : 'PENDING'}`);
    } catch (error) {
      logger.error(`   ❌ Error creating ${manager.email}:`, error.message);
      throw error;
    }
  }
  
  logger.info(`\n✅ Created ${managerIds.length} event managers`);
  return managerIds;
}

/**
 * Seed Events
 */
async function seedEvents(managerIds) {
  logger.info('\n🎉 Seeding Events...');
  
  const eventIds = [];
  
  for (const event of EVENTS) {
    try {
      const managerId = managerIds[event.manager_index];
      
      // Get admin ID for approved events
      let approvedByAdminId = null;
      let adminApprovedAt = null;
      
      if (event.status === 'APPROVED') {
        const adminResult = await query('SELECT id FROM admins LIMIT 1');
        if (adminResult && adminResult.length > 0) {
          approvedByAdminId = adminResult[0].id;
          adminApprovedAt = new Date();
        }
      }
      
      const result = await query(`
        INSERT INTO events (
          event_name, event_code, description, event_type, price, currency,
          event_category, tags, venue,
          start_date, end_date, registration_start_date, registration_end_date,
          max_capacity, waitlist_enabled, status,
          created_by_manager_id, approved_by_admin_id, admin_approved_at,
          is_visible
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING id, event_name, event_code, event_type, status
      `, [
        event.event_name,
        event.event_code,
        event.description,
        event.event_type,
        event.price,
        event.currency || 'INR',
        event.event_category,
        event.tags,
        event.venue,
        event.start_date,
        event.end_date,
        event.registration_start_date,
        event.registration_end_date,
        event.max_capacity,
        event.waitlist_enabled,
        event.status,
        managerId,
        approvedByAdminId,
        adminApprovedAt,
        event.is_visible,
      ]);
      
      eventIds.push(result[0].id);
      logger.info(`   ✅ ${result[0].event_name} (${result[0].event_code})`);
      logger.info(`      Type: ${result[0].event_type} | Status: ${result[0].status} | Price: ₹${event.price}`);
    } catch (error) {
      logger.error(`   ❌ Error creating ${event.event_name}:`, error.message);
      throw error;
    }
  }
  
  logger.info(`\n✅ Created ${eventIds.length} events`);
  return eventIds;
}

/**
 * Seed Student Registrations
 */
async function seedRegistrations(eventIds) {
  logger.info('\n📝 Seeding Student Registrations...');
  
  // Get existing students
  const studentsResult = await query('SELECT id, registration_no FROM students LIMIT 20');
  const students = studentsResult || [];
  
  if (students.length === 0) {
    logger.warn('⚠️  No students found. Run student seeder first.');
    return [];
  }
  
  // Get approved free and paid events
  const freeEventsResult = await query(`
    SELECT id FROM events 
    WHERE event_type = 'FREE' AND status = 'APPROVED' 
    LIMIT 3
  `);
  const freeEvents = freeEventsResult || [];
  
  const paidEventsResult = await query(`
    SELECT id FROM events 
    WHERE event_type = 'PAID' AND status = 'APPROVED' 
    LIMIT 3
  `);
  const paidEvents = paidEventsResult || [];
  
  const registrationIds = [];
  
  // Register students for FREE events
  for (let i = 0; i < Math.min(10, students.length); i++) {
    for (const event of freeEvents) {
      try {
        const result = await query(`
          INSERT INTO event_registrations (
            student_id, event_id, registration_type, registration_status, payment_status,
            registered_at
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [
          students[i].id,
          event.id,
          'STANDARD', // registration_type
          'CONFIRMED',
          'NOT_REQUIRED', // Free event
          new Date(),
        ]);
        
        registrationIds.push(result[0].id);
      } catch (error) {
        // Skip duplicates
        if (!error.message.includes('unique')) {
          logger.error(`   ❌ Error registering student:`, error.message);
        }
      }
    }
  }
  
  // Register students for PAID events (some completed, some pending)
  for (let i = 0; i < Math.min(8, students.length); i++) {
    for (const event of paidEvents.slice(0, 2)) {
      try {
        const isPaid = i < 5; // First 5 students have completed payment
        
        const result = await query(`
          INSERT INTO event_registrations (
            student_id, event_id, registration_type, registration_status, payment_status,
            razorpay_order_id, razorpay_payment_id, razorpay_signature,
            payment_amount, payment_currency, registered_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
        `, [
          students[i].id,
          event.id,
          'STANDARD', // registration_type
          isPaid ? 'CONFIRMED' : 'PENDING_PAYMENT',
          isPaid ? 'COMPLETED' : 'PENDING',
          isPaid ? `order_${Date.now()}_${i}` : null,
          isPaid ? `pay_${Date.now()}_${i}` : null,
          isPaid ? `sig_${Date.now()}_${i}` : null,
          isPaid ? 299.00 : null,
          isPaid ? 'INR' : null,
          new Date(),
        ]);
        
        registrationIds.push(result[0].id);
      } catch (error) {
        if (!error.message.includes('unique')) {
          logger.error(`   ❌ Error registering student:`, error.message);
        }
      }
    }
  }
  
  logger.info(`✅ Created ${registrationIds.length} student registrations`);
  return registrationIds;
}

/**
 * Seed Volunteer Assignments
 */
async function seedVolunteerAssignments(eventIds) {
  logger.info('\n👥 Seeding Volunteer Assignments...');
  
  // Get existing volunteers
  const volunteersResult = await query('SELECT id, email FROM volunteers LIMIT 10');
  const volunteers = volunteersResult || [];
  
  if (volunteers.length === 0) {
    logger.warn('⚠️  No volunteers found. Run volunteer seeder first.');
    return [];
  }
  
  // Get approved events
  const eventsResult = await query(`
    SELECT id, event_name FROM events 
    WHERE status = 'APPROVED' 
    LIMIT 5
  `);
  const events = eventsResult || [];
  
  const assignmentIds = [];
  
  // Assign 2-3 volunteers per event
  for (const event of events) {
    const numVolunteers = Math.min(3, volunteers.length);
    
    for (let i = 0; i < numVolunteers; i++) {
      try {
        const result = await query(`
          INSERT INTO event_volunteers (
            volunteer_id, event_id, assigned_by_manager_id,
            can_scan_qr, can_view_registrations, assigned_at, status
          )
          SELECT $1, $2, created_by_manager_id, $3, $4, $5, $6
          FROM events WHERE id = $2
          RETURNING id
        `, [
          volunteers[i].id,
          event.id,
          true, // can_scan_qr
          true, // can_view_registrations
          new Date(),
          'ACTIVE',
        ]);
        
        assignmentIds.push(result[0].id);
      } catch (error) {
        if (!error.message.includes('unique')) {
          logger.error(`   ❌ Error assigning volunteer:`, error.message);
        }
      }
    }
    
    logger.info(`   ✅ Assigned ${numVolunteers} volunteers to: ${event.event_name}`);
  }
  
  logger.info(`\n✅ Created ${assignmentIds.length} volunteer assignments`);
  return assignmentIds;
}

/**
 * Display seeding summary
 */
async function displaySummary() {
  logger.info('\n' + '='.repeat(60));
  logger.info('📊 SEEDING SUMMARY');
  logger.info('='.repeat(60));
  
  // Event Managers
  const managersResult = await query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_approved_by_admin = true) as approved,
      COUNT(*) FILTER (WHERE is_approved_by_admin = false) as pending
    FROM event_managers
  `);
  const managers = managersResult[0];
  logger.info(`\n👤 Event Managers: ${managers.total}`);
  logger.info(`   ✅ Approved: ${managers.approved}`);
  logger.info(`   ⏳ Pending: ${managers.pending}`);
  
  // Events
  const eventsResult = await query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE event_type = 'FREE') as free,
      COUNT(*) FILTER (WHERE event_type = 'PAID') as paid,
      COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
      COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL') as pending_approval,
      COUNT(*) FILTER (WHERE status = 'DRAFT') as draft
    FROM events
  `);
  const events = eventsResult[0];
  logger.info(`\n🎉 Events: ${events.total}`);
  logger.info(`   🆓 Free Events: ${events.free}`);
  logger.info(`   💰 Paid Events: ${events.paid}`);
  logger.info(`   ✅ Approved: ${events.approved}`);
  logger.info(`   ⏳ Pending Approval: ${events.pending_approval}`);
  logger.info(`   📝 Draft: ${events.draft}`);
  
  // Registrations
  const registrationsResult = await query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE payment_status = 'COMPLETED') as paid,
      COUNT(*) FILTER (WHERE payment_status = 'PENDING') as pending_payment,
      COUNT(*) FILTER (WHERE payment_status = 'NOT_REQUIRED') as free
    FROM event_registrations
  `);
  const registrations = registrationsResult[0];
  logger.info(`\n📝 Registrations: ${registrations.total}`);
  logger.info(`   ✅ Paid Registrations: ${registrations.paid}`);
  logger.info(`   ⏳ Pending Payment: ${registrations.pending_payment}`);
  logger.info(`   🆓 Free Registrations: ${registrations.free}`);
  
  // Volunteers
  const volunteersResult = await query(`
    SELECT COUNT(*) as total FROM event_volunteers
  `);
  const volunteerCount = volunteersResult[0].total;
  logger.info(`\n👥 Volunteer Assignments: ${volunteerCount}`);
  
  logger.info('\n' + '='.repeat(60));
  
  // Login credentials
  logger.info('\n🔐 TEST LOGIN CREDENTIALS:');
  logger.info('\nEvent Managers:');
  for (const manager of EVENT_MANAGERS) {
    logger.info(`   Email: ${manager.email}`);
    logger.info(`   Password: ${manager.password}`);
    logger.info(`   Status: ${manager.is_approved_by_admin ? 'APPROVED ✅' : 'PENDING ⏳'}`);
    logger.info('');
  }
  
  logger.info('='.repeat(60));
}

// ============================================================
// MAIN SEEDER EXECUTION
// ============================================================

async function main() {
  logger.info('========================================');
  logger.info('🌱 MULTI-EVENT SEEDER');
  logger.info('========================================\n');
  
  try {
    // Step 1: Clear existing data
    await clearExistingData();
    
    // Step 2: Seed event managers
    const managerIds = await seedEventManagers();
    
    // Step 3: Seed events
    const eventIds = await seedEvents(managerIds);
    
    // Step 4: Seed registrations
    await seedRegistrations(eventIds);
    
    // Step 5: Seed volunteer assignments
    await seedVolunteerAssignments(eventIds);
    
    // Step 6: Display summary
    await displaySummary();
    
    logger.info('\n✅ Seeding completed successfully!');
    logger.info('\n💡 Next Steps:');
    logger.info('   1. Test event manager login with provided credentials');
    logger.info('   2. Test student event browsing and registration');
    logger.info('   3. Test payment flow for paid events');
    logger.info('   4. Test volunteer event scanning');
    logger.info('   5. Test admin approval workflows\n');
    
    process.exit(0);
  } catch (error) {
    logger.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run seeder
main();
