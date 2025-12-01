/**
 * Simplified Multi-Event Seeder
 * Seeds only event managers and events (no registrations/volunteers for now)
 */

import bcryptjs from 'bcryptjs';
import { query } from '../config/db.js';

console.log('🌱 Seeding Event Managers and Events...\n');

// Event Managers
const eventManagers = [
  {
    email: 'tech.lead@sgtu.edu',
    password: 'TechLead@123',
    full_name: 'Dr. Rajesh Kumar',
    phone: '9876543210',
    organization: 'Computer Science Department',
    is_approved_by_admin: true,
  },
  {
    email: 'cultural.head@sgtu.edu',
    password: 'Culture@123',
    full_name: 'Prof. Priya Sharma',
    phone: '9876543211',
    organization: 'Cultural Committee',
    is_approved_by_admin: true,
  },
  {
    email: 'external.organizer@events.com',
    password: 'External@123',
    full_name: 'Amit Patel',
    phone: '9876543212',
    organization: 'TechEvents India Pvt Ltd',
    is_approved_by_admin: false,
  },
];

console.log('👤 Creating Event Managers...');
let managerCount = 0;
const managerIds = [];

for (const manager of eventManagers) {
  try {
    const hashedPassword = await bcryptjs.hash(manager.password, 10);
    const result = await query(`
      INSERT INTO event_managers (
        email, password_hash, full_name, phone, organization, is_approved_by_admin, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      manager.email,
      hashedPassword,
      manager.full_name,
      manager.phone,
      manager.organization,
      manager.is_approved_by_admin,
      true,
    ]);
    
    managerIds.push(result[0].id);
    managerCount++;
    console.log(`   ✓ ${manager.full_name} (${manager.email})`);
  } catch (error) {
    if (!error.message.includes('unique')) {
      console.log(`   ⏭  Skipped: ${manager.full_name} (already exists)`);
    }
  }
}

console.log(`✅ Event Managers: ${managerCount} created\n`);

// Events
const events = [
  {
    event_name: 'AI & Machine Learning Workshop',
    event_code: 'AI-WORKSHOP-2025',
    description: 'Hands-on workshop covering fundamentals of AI, ML algorithms, and practical applications using Python and TensorFlow.',
    event_type: 'FREE',
    price: 0.00,
    event_category: 'Workshop',
    tags: ['AI', 'Machine Learning', 'Python', 'TensorFlow', 'Workshop'],
    venue: 'Seminar Hall A, Block 3',
    start_date: '2025-02-15 10:00:00',
    end_date: '2025-02-15 16:00:00',
    registration_start_date: '2025-01-20 00:00:00',
    registration_end_date: '2025-02-14 23:59:59',
    max_capacity: 100,
    waitlist_enabled: true,
    status: 'APPROVED',
    is_visible: true,
    manager_index: 0,
  },
  {
    event_name: 'Cultural Fest 2025 - Sangeet Night',
    event_code: 'SANGEET-2025',
    description: 'Annual music festival featuring classical, folk, and contemporary performances.',
    event_type: 'FREE',
    price: 0.00,
    event_category: 'Cultural',
    tags: ['Music', 'Cultural', 'Performance', 'Festival'],
    venue: 'University Auditorium',
    start_date: '2025-03-20 18:00:00',
    end_date: '2025-03-20 22:00:00',
    registration_start_date: '2025-02-01 00:00:00',
    registration_end_date: '2025-03-19 23:59:59',
    max_capacity: 500,
    waitlist_enabled: false,
    status: 'APPROVED',
    is_visible: true,
    manager_index: 1,
  },
  {
    event_name: 'Career Counseling Session',
    event_code: 'CAREER-GUIDE-2025',
    description: 'One-on-one career counseling and resume building workshop.',
    event_type: 'FREE',
    price: 0.00,
    event_category: 'Career',
    tags: ['Career', 'Counseling', 'Jobs', 'Guidance'],
    venue: 'Placement Cell',
    start_date: '2025-02-28 14:00:00',
    end_date: '2025-02-28 17:00:00',
    registration_start_date: '2025-02-10 00:00:00',
    registration_end_date: '2025-02-27 23:59:59',
    max_capacity: 50,
    waitlist_enabled: true,
    status: 'APPROVED',
    is_visible: true,
    manager_index: 0,
  },
  {
    event_name: 'National Coding Championship',
    event_code: 'CODE-CHAMP-2025',
    description: 'Competitive coding event with prizes worth ₹1 Lakh.',
    event_type: 'PAID',
    price: 299.00,
    event_category: 'Competition',
    tags: ['Coding', 'Competition', 'Programming', 'Contest'],
    venue: 'Computer Lab 1 & 2',
    start_date: '2025-03-15 09:00:00',
    end_date: '2025-03-15 18:00:00',
    registration_start_date: '2025-02-01 00:00:00',
    registration_end_date: '2025-03-14 23:59:59',
    max_capacity: 200,
    waitlist_enabled: true,
    status: 'APPROVED',
    is_visible: true,
    manager_index: 0,
  },
  {
    event_name: 'Advanced Web Development Bootcamp',
    event_code: 'WEB-BOOTCAMP-2025',
    description: '5-day intensive bootcamp on React, Node.js, and MongoDB.',
    event_type: 'PAID',
    price: 2499.00,
    event_category: 'Workshop',
    tags: ['Web Development', 'React', 'Node.js', 'MongoDB', 'Bootcamp'],
    venue: 'IT Lab Block C',
    start_date: '2025-04-01 10:00:00',
    end_date: '2025-04-05 17:00:00',
    registration_start_date: '2025-03-01 00:00:00',
    registration_end_date: '2025-03-31 23:59:59',
    max_capacity: 50,
    waitlist_enabled: true,
    status: 'APPROVED',
    is_visible: true,
    manager_index: 1,
  },
];

console.log('🎉 Creating Events...');
let eventCount = 0;

for (const event of events) {
  if (event.manager_index >= managerIds.length) continue;
  
  try {
    await query(`
      INSERT INTO events (
        created_by_manager_id, event_name, event_code, description,
        event_type, price, event_category, tags, venue,
        start_date, end_date,
        registration_start_date, registration_end_date,
        max_capacity, waitlist_enabled, status, is_visible
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `, [
      managerIds[event.manager_index],
      event.event_name,
      event.event_code,
      event.description,
      event.event_type,
      event.price,
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
      event.is_visible,
    ]);
    
    eventCount++;
    console.log(`   ✓ ${event.event_name} (${event.event_type})`);
  } catch (error) {
    if (!error.message.includes('unique')) {
      console.log(`   ⏭  Skipped: ${event.event_name} (already exists)`);
    }
  }
}

console.log(`✅ Events: ${eventCount} created\n`);

// ============================================================
// VOLUNTEERS (After Events)
// ============================================================

import VolunteerModel from '../models/Volunteer.model.js';

const volunteers = [
  {
    email: 'volunteer1@sgtu.ac.in',
    full_name: 'Rajesh Kumar',
    phone: '9876543301',
    assigned_location: 'Main Entrance Gate',
    event_name: 'AI & Machine Learning Workshop'
  },
  {
    email: 'volunteer2@sgtu.ac.in',
    full_name: 'Priya Sharma',
    phone: '9876543302',
    assigned_location: 'Block A - Ground Floor',
    event_name: 'Cultural Fest 2025 - Sangeet Night'
  },
  {
    email: 'volunteer3@sgtu.ac.in',
    full_name: 'Amit Singh',
    phone: '9876543303',
    assigned_location: 'Block B - Ground Floor',
    event_name: 'Career Counseling Session'
  },
  {
    email: 'volunteer4@sgtu.ac.in',
    full_name: 'Sneha Gupta',
    phone: '9876543304',
    assigned_location: 'Block A - First Floor',
    event_name: 'National Coding Championship'
  },
  {
    email: 'volunteer5@sgtu.ac.in',
    full_name: 'Vikram Patel',
    phone: '9876543305',
    assigned_location: 'Block B - Second Floor',
    event_name: 'Advanced Web Development Bootcamp'
  },
  {
    email: 'volunteer.test@sgtu.ac.in',
    full_name: 'Test Volunteer',
    phone: '9999999998',
    assigned_location: 'Test Location',
    event_name: 'AI & Machine Learning Workshop'
  }
];

console.log('🎫 Creating Volunteers...');
let volunteerCount = 0;

for (const volunteer of volunteers) {
  try {
    // Get event_id and event_code
    const eventResult = await query(
      'SELECT id, event_code FROM events WHERE event_name = $1 LIMIT 1',
      [volunteer.event_name]
    );

    if (eventResult.length === 0) {
      console.log(`   ⏭  Skipped: ${volunteer.full_name} - Event "${volunteer.event_name}" not found`);
      continue;
    }

    const event_id = eventResult[0].id;
    const event_code = eventResult[0].event_code;

    // Generate default password
    const defaultPassword = VolunteerModel.generateDefaultPassword({
      full_name: volunteer.full_name,
      event_code
    });
    const hashedPassword = await bcryptjs.hash(defaultPassword, 12);
    
    await query(`
      INSERT INTO volunteers (
        email, password_hash, full_name, phone, assigned_location, 
        event_id, password_reset_required, is_active, total_scans_performed
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, true, 0)
      ON CONFLICT (email) DO NOTHING
    `, [
      volunteer.email,
      hashedPassword,
      volunteer.full_name,
      volunteer.phone,
      volunteer.assigned_location,
      event_id
    ]);
    
    volunteerCount++;
    console.log(`   ✓ ${volunteer.full_name} → ${volunteer.event_name}`);
    console.log(`      Password: ${defaultPassword}`);
  } catch (error) {
    if (!error.message.includes('unique')) {
      console.log(`   ⏭  Skipped: ${volunteer.email} (already exists)`);
    }
  }
}

console.log(`✅ Volunteers: ${volunteerCount} created\n`);

console.log('═══════════════════════════════════════');
console.log('✅ SEEDING COMPLETED');
console.log('═══════════════════════════════════════');
console.log('\n🔐 Event Manager Credentials:');
console.log('   tech.lead@sgtu.edu / TechLead@123');
console.log('   cultural.head@sgtu.edu / Culture@123');
console.log('\n🔐 Volunteer Credentials (firstname@eventcode format):');
console.log('   volunteer1@sgtu.ac.in / rajesh@AI-WORKSHOP-2025');
console.log('   volunteer2@sgtu.ac.in / priya@SANGEET-2025');
console.log('   volunteer3@sgtu.ac.in / amit@CAREER-GUIDE-2025');
console.log('   volunteer4@sgtu.ac.in / sneha@CODE-CHAMP-2025');
console.log('   volunteer5@sgtu.ac.in / vikram@WEB-BOOTCAMP-2025\n');

process.exit(0);
