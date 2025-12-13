import { query } from '../src/config/db.js';

/**
 * Truncate students table - removes all student data
 */

async function truncateStudents() {
  try {
    console.log('🗑️  Truncating students table...');
    
    // Truncate with CASCADE to handle foreign key constraints
    await query('TRUNCATE TABLE students CASCADE');
    
    console.log('✅ Students table truncated successfully!');
    console.log('📊 All student records have been removed.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error truncating students:', error.message);
    process.exit(1);
  }
}

truncateStudents();
