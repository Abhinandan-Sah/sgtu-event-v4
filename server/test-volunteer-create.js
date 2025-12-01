/**
 * Test Volunteer Creation API
 * Run: node test-volunteer-create.js
 */

import { query } from './src/config/db.js';

async function testVolunteerCreation() {
  console.log('🧪 Testing Volunteer Creation API\n');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Step 1: Get an event_id
    console.log('📋 Step 1: Fetching available events...');
    const events = await query('SELECT id, event_name, event_code FROM events LIMIT 3');
    
    if (events.length === 0) {
      console.log('❌ No events found. Run npm run db:setup first.');
      process.exit(1);
    }

    console.log('\n✅ Available Events:');
    events.forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.event_name} (${event.event_code})`);
      console.log(`      Event ID: ${event.id}`);
    });

    // Step 2: Get admin token (you'll need to login first)
    console.log('\n📋 Step 2: To test volunteer creation, you need an ADMIN or EVENT_MANAGER token');
    console.log('\n💡 Login as admin first:');
    console.log('   POST http://localhost:5000/api/admin/login');
    console.log('   Body: { "email": "admin@sgtu.ac.in", "password": "admin123" }');
    
    console.log('\n📋 Step 3: Sample API Request for Volunteer Creation:');
    console.log('\n🔹 Endpoint: POST http://localhost:5000/api/volunteer');
    console.log('🔹 Headers:');
    console.log('   Content-Type: application/json');
    console.log('   Authorization: Bearer <YOUR_ADMIN_TOKEN>');
    
    console.log('\n🔹 Sample Request Body (Auto-generated Password):');
    console.log(JSON.stringify({
      email: 'neha.verma@sgtu.ac.in',
      full_name: 'Neha Verma',
      phone: '9876543210',
      assigned_location: 'Registration Desk',
      event_id: events[0].id
    }, null, 2));

    console.log(`\n📝 Expected Auto-generated Password: neha@${events[0].event_code}`);

    console.log('\n🔹 Sample Request Body (Custom Password):');
    console.log(JSON.stringify({
      email: 'rohit.kumar@sgtu.ac.in',
      password: 'CustomPass@123',
      full_name: 'Rohit Kumar',
      phone: '9876543211',
      assigned_location: 'Main Gate',
      event_id: events[0].id
    }, null, 2));

    console.log('\n🔹 Sample Request Body (Different Event):');
    if (events.length > 1) {
      console.log(JSON.stringify({
        email: 'ananya.singh@sgtu.ac.in',
        full_name: 'Ananya Singh',
        phone: '9876543212',
        assigned_location: 'Computer Lab Entrance',
        event_id: events[1].id
      }, null, 2));
      console.log(`\n📝 Expected Auto-generated Password: ananya@${events[1].event_code}`);
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Test Data Generated Successfully!');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📝 Testing Steps:');
    console.log('   1. Start server: npm start');
    console.log('   2. Login as admin to get token');
    console.log('   3. Use Postman/Thunder Client/curl to test POST /api/volunteer');
    console.log('   4. Check response for generated_password field');
    console.log('   5. Verify volunteer can login with default password');
    console.log('   6. Test verification flow with event_code + phone\n');

    // Display existing volunteers
    console.log('📋 Current Volunteers in Database:');
    const volunteers = await query(`
      SELECT v.email, v.full_name, v.phone, v.assigned_location, 
             e.event_name, e.event_code, v.password_reset_required
      FROM volunteers v
      LEFT JOIN events e ON v.event_id = e.id
      ORDER BY v.created_at DESC
    `);
    
    console.log(`\n✅ Total Volunteers: ${volunteers.length}\n`);
    volunteers.forEach((vol, index) => {
      console.log(`   ${index + 1}. ${vol.full_name} (${vol.email})`);
      console.log(`      Phone: ${vol.phone}`);
      console.log(`      Location: ${vol.assigned_location}`);
      console.log(`      Event: ${vol.event_name}`);
      console.log(`      Default Password: ${vol.full_name.split(' ')[0].toLowerCase()}@${vol.event_code}`);
      console.log(`      Password Reset Required: ${vol.password_reset_required}`);
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

testVolunteerCreation();
