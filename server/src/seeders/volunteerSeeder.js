// Volunteer Seeder - Seeds volunteer staff
import { query } from '../config/db.js';
import bcrypt from 'bcryptjs';
import VolunteerModel from '../models/Volunteer.model.js';

const volunteers = [
  {
    email: 'volunteer1@sgtu.ac.in',
    full_name: 'Rajesh Kumar',
    phone: '9876543301',
    assigned_location: 'Main Entrance Gate',
    event_name: 'AI & Machine Learning Workshop' // Will get event_id from this
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

export async function seedVolunteers() {
  console.log('🎫 Seeding volunteers...');
  
  let created = 0;
  let skipped = 0;

  for (const volunteer of volunteers) {
    try {
      // Get event_id and event_code from event_name
      const eventResult = await query(
        'SELECT id, event_code FROM events WHERE event_name = $1 LIMIT 1',
        [volunteer.event_name]
      );

      if (eventResult.length === 0) {
        console.error(`   ✗ Failed: ${volunteer.email} - Event "${volunteer.event_name}" not found`);
        continue;
      }

      const event_id = eventResult[0].id;
      const event_code = eventResult[0].event_code;

      // Generate default password: firstname@eventcode
      const defaultPassword = VolunteerModel.generateDefaultPassword({
        full_name: volunteer.full_name,
        event_code
      });
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);
      
      const insertQuery = `
        INSERT INTO volunteers (
          email, password_hash, full_name, phone, assigned_location, 
          event_id, password_reset_required, is_active, total_scans_performed
        )
        VALUES ($1, $2, $3, $4, $5, $6, true, true, 0)
        ON CONFLICT (email) DO NOTHING
        RETURNING id, email, full_name, assigned_location
      `;
      
      const result = await query(insertQuery, [
        volunteer.email,
        hashedPassword,
        volunteer.full_name,
        volunteer.phone,
        volunteer.assigned_location,
        event_id
      ]);
      
      if (result.length > 0) {
        console.log(`   ✓ Created: ${volunteer.full_name} at ${volunteer.assigned_location} (${volunteer.event_name})`);
        console.log(`      Default password: ${defaultPassword}`);
        created++;
      } else {
        skipped++;
        console.log(`   ⏭  Skipped: ${volunteer.email} (already exists)`);
      }
    } catch (error) {
      console.error(`   ✗ Failed: ${volunteer.email} - ${error.message}`);
    }
  }

  console.log(`   ✅ Volunteers: ${created} created, ${skipped} skipped\n`);
}

export default seedVolunteers;
