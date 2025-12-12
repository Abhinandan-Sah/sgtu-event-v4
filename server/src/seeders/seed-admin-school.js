import seedSchools from './schoolSeeder.js';
import seedAdmins from './adminSeeder.js';

async function seedAdminAndSchool() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🌱 SEEDING SCHOOLS AND ADMINS');
    console.log('═══════════════════════════════════════════════════════\n');

    const startTime = Date.now();

    // 1. Seed Schools (no dependencies)
    await seedSchools();

    // 2. Seed Admins (no dependencies)
    await seedAdmins();

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ SEEDING COMPLETED');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`⏱️  Total time: ${duration}s`);
    console.log('\n📝 Default Admin Credentials:');
    console.log('   Email: admin@sgtu.ac.in');
    console.log('   Password: admin123\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ SEEDING FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

seedAdminAndSchool();
