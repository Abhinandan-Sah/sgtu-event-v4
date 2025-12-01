/**
 * QR Scan Validator
 * 
 * @description Validates QR token content and provides scanning troubleshooting
 * @usage npm run test:scan
 * @category Test Helper
 * @author SGTU Event Team
 * @version 2.0.0
 * 
 * Provides:
 * - Expected QR scan results
 * - Token verification status
 * - Scanner app recommendations
 * - Troubleshooting for numeric mode issues
 */

import QRCodeService from '../../services/qrCode.js';
import { query } from '../../config/db.js';

async function testQRScanning() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   📱 QR Scan Validation & Troubleshooting            ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  try {
    // Get a sample student
    const students = await query(`
      SELECT id, full_name, email, registration_no, qr_code_token 
      FROM students 
      LIMIT 1
    `);

    if (students.length === 0) {
      console.log('❌ No students found in database');
      return;
    }

    const student = students[0];
    console.log('📋 Testing with student:');
    console.log(`   Name: ${student.full_name}`);
    console.log(`   Email: ${student.email}`);
    console.log(`   Registration: ${student.registration_no}\n`);

    // Generate or get token
    let token = student.qr_code_token;
    if (!token) {
      console.log('🔧 Generating new QR token...');
      token = QRCodeService.generateStudentQRToken(student);
      await query(
        'UPDATE students SET qr_code_token = $1 WHERE id = $2',
        [token, student.id]
      );
    }

    console.log('🎯 JWT Token (this is what QR should contain):');
    console.log('━'.repeat(60));
    console.log(token);
    console.log('━'.repeat(60));
    console.log(`\n📏 Token Length: ${token.length} characters\n`);

    // Decode and show payload
    const verification = QRCodeService.verifyStudentQRToken(token);
    console.log('✅ Token Verification Result:');
    console.log(JSON.stringify(verification, null, 2));
    
    // Show what the QR scanner should read
    console.log('\n📱 When you scan the QR code, you should see:');
    console.log('━'.repeat(60));
    console.log('FIRST SCAN (if working correctly):');
    console.log(token);
    console.log('\n❌ If you see a number like "31579117":');
    console.log('   - Your phone camera is reading in NUMERIC mode');
    console.log('   - The QR library encoded it correctly (alphanumeric)');
    console.log('   - Try a different QR scanner app');
    console.log('\n📱 Recommended scanner apps:');
    console.log('   - iPhone: Built-in Camera app (iOS 11+)');
    console.log('   - Android: Google Lens, QR Code Reader by Scan');
    console.log('   - Universal: QR Scanner by Gamma Play');
    console.log('━'.repeat(60));

    console.log('\n✅ Test complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testQRScanning();
