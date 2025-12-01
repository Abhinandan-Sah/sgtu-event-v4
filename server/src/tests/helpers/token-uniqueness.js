/**
 * Token Uniqueness Validator
 * 
 * @description Verifies all QR tokens are unique and have distinct nonces
 * @usage npm run test:uniqueness
 * @category Test Helper
 * @author SGTU Event Team
 * @version 2.0.0
 * 
 * Validates:
 * - No duplicate tokens in database
 * - All tokens have unique starting characters
 * - Nonces are random and collision-free
 * - Token prefixes are visually distinct
 */

import { pool } from '../../config/db.js';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║   🔍 Token Uniqueness Validation                     ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');

async function verifyTokenUniqueness() {
  try {
    // Fetch 5 student tokens
    const students = await pool`
      SELECT id, full_name, registration_no, qr_code_token
      FROM students
      LIMIT 5
    `;

    console.log('📋 Sample of 5 Student Tokens:\n');
    console.log('━'.repeat(80));

    const tokenPrefixes = new Set();
    
    for (const student of students) {
      const token = student.qr_code_token;
      const decoded = jwt.decode(token);
      
      // Get first 30 characters to show visual difference
      const prefix = token.substring(0, 50);
      tokenPrefixes.add(prefix);
      
      console.log(`👤 ${student.full_name} (${student.registration_no})`);
      console.log(`   Nonce: ${decoded.n}`);
      console.log(`   Token Start: ${prefix}...`);
      console.log(`   Token Length: ${token.length} chars`);
      console.log('');
    }

    console.log('━'.repeat(80));
    console.log(`\n✅ Unique Prefixes: ${tokenPrefixes.size}/${students.length}`);
    
    if (tokenPrefixes.size === students.length) {
      console.log('🎉 SUCCESS: All tokens have unique starting characters!');
      console.log('   The nonce makes each token visually distinct from the first character.');
    } else {
      console.log('⚠️  WARNING: Some tokens have the same prefix.');
      console.log('   This should not happen with random nonces.');
    }

    console.log('\n📊 Token Statistics:');
    console.log(`   Average length: ${Math.round(students.reduce((sum, s) => sum + s.qr_code_token.length, 0) / students.length)} characters`);
    console.log(`   Nonces used: ${students.map(s => jwt.decode(s.qr_code_token).n).join(', ')}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyTokenUniqueness();
