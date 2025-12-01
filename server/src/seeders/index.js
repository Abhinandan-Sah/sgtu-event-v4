// Main Seeder Orchestrator - Runs all seeders in correct order
import seedSchools from './schoolSeeder.js';
import seedAdmins from './adminSeeder.js';
// import seedVolunteers from './volunteerSeeder.js'; // Moved to simpleMultiEventSeeder.js (needs event_id)
import seedStudents from './studentSeeder.js';
import seedStalls from './stallSeeder.js';
import seedCheckInOuts from './checkInOutSeeder.js';
import seedFeedbacks from './feedbackSeeder.js';
import seedRankings from './rankingSeeder.js';

async function seedDatabase() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🌱 BASE DATA SEEDER');
    console.log('═══════════════════════════════════════════════════════\n');

    const startTime = Date.now();

    // Run seeders in dependency order
    // 1. Schools (no dependencies)
    const schools = await seedSchools();
    
    // 2. Users (depend on schools for students)
    await seedAdmins();
    // await seedVolunteers(); // Moved to simpleMultiEventSeeder.js
    await seedStudents(schools);
    
    // 3. Stalls (depend on schools)
    await seedStalls(schools);
    
    // 4. Activity data (depend on students, volunteers, stalls)
    await seedCheckInOuts();
    await seedFeedbacks();
    await seedRankings();

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ BASE DATA SEEDING COMPLETED');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`⏱️  Total time: ${duration}s`);
    console.log('\n📝 Note: Run simpleMultiEventSeeder.js next for events and volunteers');
    console.log('\n📝 Default Credentials:');
    console.log('   Admin: admin@sgtu.ac.in / admin123');
    console.log('   Student: test@sgtu.ac.in / student123');
    console.log('   Note: Volunteers will be created in simpleMultiEventSeeder.js\n');

  } catch (error) {
    console.error('\n❌ SEEDING FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run seeder
seedDatabase()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
