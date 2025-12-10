/**
 * Test Suite: Deregistration and Refund System
 * Tests all deregistration flows, refund calculations, and waitlist promotion
 */

import { query } from '../../config/db.js';
import { calculateRefund } from '../../utils/refundCalculator.js';
import { promoteFromWaitlist } from '../../services/waitlist.service.js';

// Test utilities
const logger = {
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  section: (msg) => console.log(`\n${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}`)
};

// Test data
let testEventId, testStudentId, testRegistrationId;

/**
 * Test 1: Refund Calculator - Various scenarios
 */
async function testRefundCalculator() {
  logger.section('TEST 1: Refund Calculator');

  const baseEvent = {
    event_type: 'PAID',
    price: 1000,
    start_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
    refund_enabled: true,
    cancellation_deadline_hours: 24,
    refund_tiers: [
      { days_before: 7, percent: 100 },
      { days_before: 3, percent: 50 },
      { days_before: 0, percent: 0 }
    ]
  };

  // Test 1.1: Full refund (10 days before)
  const result1 = calculateRefund(baseEvent, new Date());
  if (result1.eligible && result1.percent === 100 && result1.amount === 1000) {
    logger.success('1.1: Full refund (10 days before) - PASSED');
  } else {
    logger.error('1.1: Full refund - FAILED', result1);
  }

  // Test 1.2: 50% refund (5 days before)
  const event2 = {
    ...baseEvent,
    start_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
  };
  const result2 = calculateRefund(event2, new Date());
  if (result2.eligible && result2.percent === 50 && result2.amount === 500) {
    logger.success('1.2: 50% refund (5 days before) - PASSED');
  } else {
    logger.error('1.2: 50% refund - FAILED', result2);
  }

  // Test 1.3: No refund (1 day before)
  const event3 = {
    ...baseEvent,
    start_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
  };
  const result3 = calculateRefund(event3, new Date());
  if (!result3.eligible && result3.percent === 0) {
    logger.success('1.3: No refund (1 day before) - PASSED');
  } else {
    logger.error('1.3: No refund - FAILED', result3);
  }

  // Test 1.4: Past cancellation deadline (12 hours before)
  const event4 = {
    ...baseEvent,
    start_date: new Date(Date.now() + 12 * 60 * 60 * 1000),
    cancellation_deadline_hours: 24
  };
  const result4 = calculateRefund(event4, new Date());
  if (!result4.eligible && result4.reason.includes('deadline')) {
    logger.success('1.4: Past cancellation deadline - PASSED');
  } else {
    logger.error('1.4: Deadline check - FAILED', result4);
  }

  // Test 1.5: Refunds disabled
  const event5 = {
    ...baseEvent,
    refund_enabled: false
  };
  const result5 = calculateRefund(event5, new Date());
  if (!result5.eligible && result5.reason.includes('not enabled')) {
    logger.success('1.5: Refunds disabled - PASSED');
  } else {
    logger.error('1.5: Refunds disabled check - FAILED', result5);
  }

  // Test 1.6: Free event (no refund needed)
  const event6 = {
    ...baseEvent,
    event_type: 'FREE'
  };
  const result6 = calculateRefund(event6, new Date());
  if (!result6.eligible && result6.reason.includes('Free events')) {
    logger.success('1.6: Free event - PASSED');
  } else {
    logger.error('1.6: Free event check - FAILED', result6);
  }

  // Test 1.7: Event already passed
  const event7 = {
    ...baseEvent,
    start_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
  };
  const result7 = calculateRefund(event7, new Date());
  if (!result7.eligible && result7.reason.includes('already occurred')) {
    logger.success('1.7: Event already passed - PASSED');
  } else {
    logger.error('1.7: Past event check - FAILED', result7);
  }
}

/**
 * Test 2: Database Integration - Create test event and registration
 */
async function setupTestData() {
  logger.section('TEST 2: Setting up test data');

  try {
    // Get a school ID
    const schoolResult = await query('SELECT id FROM schools LIMIT 1');
    if (schoolResult.length === 0) {
      throw new Error('No schools found. Run db:setup first.');
    }
    const schoolId = schoolResult[0].id;

    // Create test student
    const studentResult = await query(`
      INSERT INTO students (
        registration_no, full_name, email, phone, school_id,
        date_of_birth, pincode, program_name, batch, password_hash, role
      )
      VALUES (
        'TEST-REG-' || floor(random() * 10000),
        'Test Student',
        'test-' || floor(random() * 10000) || '@test.com',
        '9999999999',
        $1,
        '2000-01-01',
        '123456',
        'B.Tech',
        '2024',
        '$2a$10$abcdefghijklmnopqrstuv',
        'STUDENT'
      )
      RETURNING id
    `, [schoolId]);
    testStudentId = studentResult[0].id;
    logger.success(`Test student created: ${testStudentId}`);

    // Create test event
    const eventResult = await query(`
      INSERT INTO events (
        event_name, event_code, description, event_type, price,
        start_date, end_date, registration_start_date, registration_end_date,
        created_by_manager_id, status, refund_enabled, cancellation_deadline_hours,
        refund_tiers, max_capacity, waitlist_enabled
      )
      SELECT 
        'Test Refund Event',
        'TEST-EVENT-' || floor(random() * 10000),
        'Test event for refund functionality',
        'PAID',
        500.00,
        NOW() + INTERVAL '10 days',
        NOW() + INTERVAL '11 days',
        NOW() - INTERVAL '1 day',
        NOW() + INTERVAL '9 days',
        id,
        'APPROVED',
        true,
        24,
        '[{"days_before": 7, "percent": 100}, {"days_before": 3, "percent": 50}]'::jsonb,
        5,
        true
      FROM event_managers LIMIT 1
      RETURNING id
    `);
    testEventId = eventResult[0].id;
    logger.success(`Test event created: ${testEventId}`);

    // Create test registration
    const regResult = await query(`
      INSERT INTO event_registrations (
        event_id, student_id, registration_type, payment_status,
        registration_status, payment_amount, payment_currency
      )
      VALUES (
        $1, $2, 'PAID', 'COMPLETED', 'CONFIRMED', 500.00, 'INR'
      )
      RETURNING id
    `, [testEventId, testStudentId]);
    testRegistrationId = regResult[0].id;
    logger.success(`Test registration created: ${testRegistrationId}`);

    return true;
  } catch (error) {
    logger.error('Setup failed: ' + error.message);
    return false;
  }
}

/**
 * Test 3: Waitlist Promotion
 */
async function testWaitlistPromotion() {
  logger.section('TEST 3: Waitlist Promotion');

  try {
    // Create waitlisted students
    const student1 = await query(`
      INSERT INTO students (
        registration_no, full_name, email, phone, school_id,
        date_of_birth, pincode, program_name, batch, password_hash, role
      )
      SELECT
        'TEST-WAIT-1-' || floor(random() * 10000),
        'Waitlist Student 1',
        'waitlist1-' || floor(random() * 10000) || '@test.com',
        '9999999991',
        id,
        '2000-01-01',
        '123456',
        'B.Tech',
        '2024',
        '$2a$10$abcdefghijklmnopqrstuv',
        'STUDENT'
      FROM schools LIMIT 1
      RETURNING id
    `);

    const student2 = await query(`
      INSERT INTO students (
        registration_no, full_name, email, phone, school_id,
        date_of_birth, pincode, program_name, batch, password_hash, role
      )
      SELECT
        'TEST-WAIT-2-' || floor(random() * 10000),
        'Waitlist Student 2',
        'waitlist2-' || floor(random() * 10000) || '@test.com',
        '9999999992',
        id,
        '2000-01-01',
        '123456',
        'B.Tech',
        '2024',
        '$2a$10$abcdefghijklmnopqrstuv',
        'STUDENT'
      FROM schools LIMIT 1
      RETURNING id
    `);

    // Add to waitlist
    await query(`
      INSERT INTO event_registrations (
        event_id, student_id, registration_type, payment_status,
        registration_status, registered_at
      )
      VALUES 
        ($1, $2, 'WAITLIST', 'NOT_REQUIRED', 'WAITLISTED', NOW()),
        ($1, $3, 'WAITLIST', 'NOT_REQUIRED', 'WAITLISTED', NOW() + INTERVAL '1 second')
    `, [testEventId, student1[0].id, student2[0].id]);

    logger.info('2 students added to waitlist');

    // Test promotion
    const result = await promoteFromWaitlist(testEventId, 2);

    if (result.promoted_count === 2 && result.promoted_students.length === 2) {
      logger.success('3.1: Promoted 2 students from waitlist - PASSED');
    } else {
      logger.error('3.1: Waitlist promotion - FAILED', result);
    }

    // Verify promotion in database
    const promoted = await query(`
      SELECT COUNT(*) as count
      FROM event_registrations
      WHERE event_id = $1 
        AND student_id IN ($2, $3)
        AND registration_status = 'CONFIRMED'
    `, [testEventId, student1[0].id, student2[0].id]);

    if (promoted[0].count === '2') {
      logger.success('3.2: Database verification - PASSED');
    } else {
      logger.error('3.2: Database verification - FAILED');
    }

  } catch (error) {
    logger.error('Waitlist test failed: ' + error.message);
  }
}

/**
 * Test 4: API Endpoint Tests (Manual validation required)
 */
function displayAPITests() {
  logger.section('TEST 4: API Endpoint Tests (Manual)');

  console.log(`
📝 Manual API Test Cases:

1. Student Deregistration (Free Event):
   POST /api/student/events/:eventId/deregister
   Expected: 200, registration cancelled, waitlist promoted

2. Student Deregistration (Paid Event with Refund):
   POST /api/student/events/:eventId/deregister
   Expected: 200, registration cancelled, refund processed

3. Student Deregistration (Past Deadline):
   POST /api/student/events/:eventId/deregister
   Expected: 400, "Cancellation deadline passed"

4. Admin Cancel Registration (Force):
   POST /api/admin/registrations/:registrationId/cancel
   Body: { "force": true, "custom_refund_amount": 750, "reason": "Special case" }
   Expected: 200, full refund processed

5. Admin Cancel Event (Cascade):
   DELETE /api/admin/events/:eventId
   Body: { "reason": "Venue unavailable" }
   Expected: 200, all registrations cancelled, refunds processed

Test Data:
- Event ID: ${testEventId || 'Run setup first'}
- Student ID: ${testStudentId || 'Run setup first'}
- Registration ID: ${testRegistrationId || 'Run setup first'}

Use these IDs to test the API endpoints with Postman/Insomnia.
  `);
}

/**
 * Test 5: Cleanup
 */
async function cleanup() {
  logger.section('TEST 5: Cleanup');

  try {
    if (testEventId) {
      await query('DELETE FROM event_registrations WHERE event_id = $1', [testEventId]);
      await query('DELETE FROM events WHERE id = $1', [testEventId]);
      logger.success('Test event and registrations deleted');
    }

    if (testStudentId) {
      await query('DELETE FROM students WHERE id = $1', [testStudentId]);
      logger.success('Test student deleted');
    }

    // Cleanup waitlist test students
    await query(`DELETE FROM students WHERE registration_no LIKE 'TEST-WAIT-%'`);
    logger.success('Waitlist test students deleted');

  } catch (error) {
    logger.error('Cleanup failed: ' + error.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('\n🚀 Starting Deregistration & Refund System Tests\n');

  try {
    // Test 1: Refund calculator (no DB required)
    await testRefundCalculator();

    // Test 2: Setup test data
    const setupSuccess = await setupTestData();
    if (!setupSuccess) {
      console.log('\n❌ Test setup failed. Skipping database tests.');
      process.exit(1);
    }

    // Test 3: Waitlist promotion
    await testWaitlistPromotion();

    // Test 4: Display API test instructions
    displayAPITests();

    // Test 5: Cleanup
    await cleanup();

    console.log('\n✅ All automated tests completed!\n');
    console.log('📋 Next Steps:');
    console.log('   1. Test API endpoints manually using the IDs above');
    console.log('   2. Verify refund processing in Razorpay dashboard');
    console.log('   3. Check database for proper status updates\n');

  } catch (error) {
    logger.error('Test suite failed: ' + error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

// Run tests
runAllTests();
