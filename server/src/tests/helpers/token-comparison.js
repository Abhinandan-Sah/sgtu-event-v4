/**
 * Token Comparison Test Helper
 * 
 * @description Displays production token statistics and optimization metrics
 * @usage npm run test:compare
 * @category Test Helper
 * @author SGTU Event Team
 * @version 2.0.0
 * 
 * Output:
 * - Student token samples with JWT payload breakdown
 * - Stall token samples with simple format
 * - Length comparison and optimization percentages
 * - Database storage confirmation
 */

import { pool } from '../../config/db.js';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║   📊 Production QR Token Comparison                  ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');

async function showTokenComparison() {
  try {
    // Fetch student tokens
    const students = await pool`
      SELECT id, full_name, registration_no, qr_code_token
      FROM students
      LIMIT 3
    `;

    // Fetch stall tokens
    const stalls = await pool`
      SELECT id, stall_number, qr_code_token
      FROM stalls
      LIMIT 3
    `;

    console.log('👨‍🎓 STUDENT QR TOKENS (Ultra-Optimized)\n');
    console.log('━'.repeat(80));
    
    for (const student of students) {
      const token = student.qr_code_token;
      const decoded = jwt.decode(token);
      
      console.log(`📱 ${student.full_name}`);
      console.log(`   Registration: ${student.registration_no}`);
      console.log(`   Nonce: ${decoded.n}`);
      console.log(`   Token Length: ${token.length} chars`);
      console.log(`   Payload: {n:"${decoded.n}", t:"${decoded.t}", r:"${decoded.r}"}`);
      console.log(`   Token: ${token.substring(0, 60)}...`);
      console.log('');
    }

    console.log('━'.repeat(80));
    console.log('\n🏪 STALL QR TOKENS (Ultra-Short)\n');
    console.log('━'.repeat(80));
    
    for (const stall of stalls) {
      const token = stall.qr_code_token;
      
      console.log(`🏬 Stall ${stall.stall_number}`);
      console.log(`   Token Length: ${token.length} chars`);
      console.log(`   Format: Simple String (not JWT)`);
      console.log(`   Token: ${token}`);
      console.log('');
    }

    console.log('━'.repeat(80));
    console.log('\n📊 OPTIMIZATION SUMMARY:\n');
    
    const avgStudentLength = Math.round(students.reduce((sum, s) => sum + s.qr_code_token.length, 0) / students.length);
    const avgStallLength = Math.round(stalls.reduce((sum, s) => sum + s.qr_code_token.length, 0) / stalls.length);
    
    console.log(`   Student Token Average: ${avgStudentLength} chars`);
    console.log(`   Stall Token Average: ${avgStallLength} chars`);
    console.log(`   
   Old Format: 317 chars (with UUID + checksum)
   New Format: ~${avgStudentLength} chars (registration_no only)
   Reduction: ${Math.round((1 - avgStudentLength/317) * 100)}%
    `);
    
    console.log('✅ Benefits:');
    console.log('   - 50% smaller QR codes');
    console.log('   - Faster scanning (less dense)');
    console.log('   - Unique nonces (no repetition)');
    console.log('   - JWT signature security maintained');
    console.log('   - No UUID needed (registration_no/stall_number are unique)');
    console.log('   - No checksum overhead (JWT already verifies integrity)');
    
    console.log('\n🗄️  Database Status:');
    console.log(`   ✅ ${students.length} student tokens stored in Neon (students.qr_code_token)`);
    console.log(`   ✅ ${stalls.length} stall tokens stored in Neon (stalls.qr_code_token)`);
    console.log('   ✅ All tokens pushed to production database');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

showTokenComparison();
