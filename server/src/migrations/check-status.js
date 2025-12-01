import { query } from '../config/db.js';

async function checkStatus() {
  try {
    console.log('\n========================================');
    console.log('🔍 MIGRATION & SEEDING STATUS CHECK');
    console.log('========================================\n');

    // Check tables
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public' AND table_name LIKE 'event%' 
      ORDER BY table_name
    `);
    
    console.log('📋 Tables Created:');
    if (tables && tables.length > 0) {
      tables.forEach(t => console.log(`   ✅ ${t.table_name}`));
    } else {
      console.log('   ❌ No event tables found');
      process.exit(1);
    }

    // Check event managers
    const managers = await query('SELECT COUNT(*) as count FROM event_managers');
    console.log(`\n👤 Event Managers: ${managers[0].count}`);
    
    if (managers[0].count > 0) {
      const managerList = await query('SELECT email, full_name, is_approved_by_admin FROM event_managers');
      managerList.forEach(m => {
        const status = m.is_approved_by_admin ? '✅ APPROVED' : '⏳ PENDING';
        console.log(`   ${status} - ${m.full_name} (${m.email})`);
      });
    }

    // Check events
    const events = await query('SELECT COUNT(*) as count FROM events');
    console.log(`\n🎉 Events: ${events[0].count}`);
    
    if (events[0].count > 0) {
      const eventList = await query('SELECT event_name, event_type, price, status FROM events ORDER BY created_at');
      eventList.forEach(e => {
        const price = e.event_type === 'FREE' ? 'FREE' : `₹${e.price}`;
        console.log(`   ${e.status === 'APPROVED' ? '✅' : '⏳'} ${e.event_name} (${price})`);
      });
    }

    // Check registrations
    const registrations = await query('SELECT COUNT(*) as count FROM event_registrations');
    console.log(`\n📝 Registrations: ${registrations[0].count}`);

    // Check volunteer assignments
    const volunteers = await query('SELECT COUNT(*) as count FROM event_volunteers');
    console.log(`👥 Volunteer Assignments: ${volunteers[0].count}`);

    console.log('\n========================================');
    console.log('✅ STATUS: Migration completed successfully!');
    console.log(`📊 Seeding: ${managers[0].count > 0 && events[0].count > 0 ? 'Partially completed (managers + events)' : 'Not completed'}`);
    console.log('========================================\n');

    if (managers[0].count > 0) {
      console.log('🔐 Test Login Credentials:');
      console.log('   Email: tech.lead@sgtu.edu');
      console.log('   Password: TechLead@123\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

checkStatus();
