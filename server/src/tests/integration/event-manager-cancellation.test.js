/**
 * Test Suite: Event Manager Cancellation Routes
 * Tests event manager's ability to cancel registrations (single and bulk)
 */

import { query } from '../../config/db.js';

// Test utilities
const logger = {
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  section: (msg) => console.log(`\n${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}`)
};

// Test data
let testEventId, testManagerId, testSchoolId;
let testRegistrations = [];

/**
 * Setup test data
 */
async function setupTestData() {
  logger.section('SETUP: Creating Test Data');

  try {
    // 1. Get or create test school
    const schools = await query('SELECT id FROM schools LIMIT 1');
    if (schools.length === 0) {
      const newSchool = await query(
        `INSERT INTO schools (school_name, description)
         VALUES ($1, $2) RETURNING id`,
        ['Test School for Cancellation', 'Test school for event manager cancellation tests']
      );
      testSchoolId = newSchool[0].id;
    } else {
      testSchoolId = schools[0].id;
    }
    logger.success(`School ID: ${testSchoolId}`);

    // 2. Create test event manager
    const existingManager = await query(
      'SELECT id FROM event_managers WHERE email = $1',
      ['test.manager@test.com']
    );

    if (existingManager.length > 0) {
      testManagerId = existingManager[0].id;
      logger.info('Using existing event manager');
    } else {
      const newManager = await query(
        `INSERT INTO event_managers (full_name, email, password_hash, phone, organization)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['Test Manager', 'test.manager@test.com', 'hashed_password', '9876543210', 'Test Organization']
      );
      testManagerId = newManager[0].id;
      logger.success(`Created event manager: ${testManagerId}`);
    }

    // 3. Create test event with refund policy
    const eventData = await query(
      `INSERT INTO events (
        event_name, event_code, event_type, description, 
        start_date, end_date, venue, price, 
        max_capacity, created_by_manager_id,
        registration_start_date, registration_end_date,
        refund_enabled, cancellation_deadline_hours, refund_tiers
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
      [
        'Test Event for Cancellation',
        `TEST_CANCEL_${Date.now()}`,
        'PAID',
        'Testing event manager cancellation',
        new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
        new Date(Date.now() + 11 * 24 * 60 * 60 * 1000),
        'Test Venue',
        1000, // Price: 1000
        50, // Capacity
        testManagerId,
        new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Registration started 1 day ago
        new Date(Date.now() + 9 * 24 * 60 * 60 * 1000), // Registration ends 9 days from now
        true, // refund_enabled
        24, // cancellation_deadline_hours
        JSON.stringify([
          { days_before: 7, percent: 100 },
          { days_before: 3, percent: 50 },
          { days_before: 0, percent: 0 }
        ])
      ]
    );
    testEventId = eventData[0].id;
    logger.success(`Created test event: ${testEventId}`);

    // 4. Create test students with registrations
    const timestamp = Date.now();
    for (let i = 1; i <= 5; i++) {
      // Create student
      const student = await query(
        `INSERT INTO students (
          full_name, email, password_hash, registration_no, school_id, phone, date_of_birth, pincode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          `Student${i} Test`,
          `student${i}.cancel.${timestamp}@test.com`,
          'hashed_password',
          `EN${timestamp}${i}`,
          testSchoolId,
          `987654321${i}`,
          '2000-01-15',
          '400001'
        ]
      );

      const studentId = student[0].id;

      // Create registration
      const registration = await query(
        `INSERT INTO event_registrations (
          event_id, student_id, registration_status, 
          registration_type, payment_status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        [
          testEventId,
          studentId,
          'CONFIRMED',
          'PAID',
          'COMPLETED'
        ]
      );

      testRegistrations.push({
        registration_id: registration[0].id,
        student_id: studentId,
        registration_no: `EN${timestamp}${i}`
      });

      logger.success(`Created student ${i} with registration: ${registration[0].id}`);
    }

    // Update event capacity
    await query(
      'UPDATE events SET current_registrations = $1 WHERE id = $2',
      [5, testEventId]
    );

    logger.success('Test data setup complete');
    return true;

  } catch (error) {
    logger.error('Setup failed: ' + error.message);
    console.error(error);
    return false;
  }
}

/**
 * Test 1: Event Manager Single Cancellation
 */
async function testSingleCancellation() {
  logger.section('TEST 1: Event Manager Single Cancellation');

  try {
    const targetReg = testRegistrations[0];

    // Fetch registration before cancellation using JOIN with registration_number
    const beforeReg = await query(
      `SELECT er.* FROM event_registrations er
       INNER JOIN students s ON er.student_id = s.id
       WHERE s.registration_no = $1 AND er.event_id = $2`,
      [targetReg.registration_no, testEventId]
    );

    if (beforeReg.length === 0) {
      throw new Error('Registration not found');
    }

    logger.info(`Cancelling registration: ${targetReg.registration_no}`);

    // Fetch event and verify ownership
    const event = await query('SELECT * FROM events WHERE id = $1', [testEventId]);
    
    if (event[0].created_by_manager_id !== testManagerId) {
      throw new Error('Ownership validation failed');
    }

    // Calculate refund
    const { calculateRefund } = await import('../../utils/refundCalculator.js');
    const refundDetails = calculateRefund(event[0]);

    logger.info(`Refund eligible: ${refundDetails.eligible}, Amount: ${refundDetails.amount}, Percent: ${refundDetails.percent}%`);

    // Update registration to cancelled using correct pattern
    const registrationId = beforeReg[0].id;
    await query(
      `UPDATE event_registrations 
       SET registration_status = 'CANCELLED',
           payment_status = 'REFUNDED',
           refund_amount = $1,
           refund_initiated = TRUE,
           refund_reason = $2,
           refunded_at = NOW()
       WHERE id = $3`,
      [refundDetails.amount, 'Test cancellation', registrationId]
    );

    // Decrement capacity
    await query(
      'UPDATE events SET current_registrations = current_registrations - 1 WHERE id = $1',
      [testEventId]
    );

    // Verify cancellation
    const afterReg = await query(
      'SELECT * FROM event_registrations WHERE id = $1',
      [registrationId]
    );

    const actualRefundAmount = parseFloat(afterReg[0].refund_amount) || 0;
    const expectedRefundAmount = parseFloat(refundDetails.amount) || 0;

    if (afterReg[0].registration_status === 'CANCELLED' && 
        actualRefundAmount === expectedRefundAmount &&
        afterReg[0].refund_initiated === true) {
      logger.success('TEST 1: Single cancellation - PASSED');
      return true;
    } else {
      logger.error('TEST 1: Single cancellation - FAILED');
      return false;
    }

  } catch (error) {
    logger.error('TEST 1: Single cancellation - ERROR: ' + error.message);
    console.error(error);
    return false;
  }
}

/**
 * Test 2: Event Manager Bulk Cancellation
 */
async function testBulkCancellation() {
  logger.section('TEST 2: Event Manager Bulk Cancellation');

  try {
    // Get 3 registrations to cancel
    const regsToCancel = testRegistrations.slice(1, 4);
    const registrationNumbers = regsToCancel.map(r => r.registration_no);

    logger.info(`Cancelling ${registrationNumbers.length} registrations`);

    // Fetch event
    const event = await query('SELECT * FROM events WHERE id = $1', [testEventId]);
    const { calculateRefund } = await import('../../utils/refundCalculator.js');

    let successCount = 0;

    for (const regNo of registrationNumbers) {
      const reg = await query(
        `SELECT er.* FROM event_registrations er
         INNER JOIN students s ON er.student_id = s.id
         WHERE s.registration_no = $1 AND er.event_id = $2`,
        [regNo, testEventId]
      );

      if (reg.length === 0) {
        logger.error(`Registration ${regNo} not found`);
        continue;
      }

      if (reg[0].registration_status === 'CANCELLED') {
        logger.info(`Registration ${regNo} already cancelled`);
        continue;
      }

      // Calculate refund
      const refundDetails = calculateRefund(event[0]);

      // Cancel registration using correct schema
      await query(
        `UPDATE event_registrations 
         SET registration_status = 'CANCELLED',
             payment_status = 'REFUNDED',
             refund_amount = $1,
             refund_initiated = TRUE,
             refund_reason = $2,
             refunded_at = NOW()
         WHERE id = $3`,
        [refundDetails.amount, 'Bulk test cancellation', reg[0].id]
      );

      // Decrement capacity
      await query(
        'UPDATE events SET current_registrations = current_registrations - 1 WHERE id = $1',
        [testEventId]
      );

      successCount++;
      logger.success(`Cancelled: ${regNo} (Refund: ${refundDetails.amount})`);
    }

    if (successCount === registrationNumbers.length) {
      logger.success(`TEST 2: Bulk cancellation - PASSED (${successCount}/${registrationNumbers.length})`);
      return true;
    } else {
      logger.error(`TEST 2: Bulk cancellation - PARTIAL (${successCount}/${registrationNumbers.length})`);
      return false;
    }

  } catch (error) {
    logger.error('TEST 2: Bulk cancellation - ERROR: ' + error.message);
    console.error(error);
    return false;
  }
}

/**
 * Test 3: Ownership Validation
 */
async function testOwnershipValidation() {
  logger.section('TEST 3: Ownership Validation');

  try {
    // Check if other manager already exists, if not create
    let otherManagerId;
    const existingManager = await query(
      'SELECT id FROM event_managers WHERE email = $1',
      ['other.manager@test.com']
    );

    if (existingManager.length > 0) {
      otherManagerId = existingManager[0].id;
      logger.info('Using existing other manager');
    } else {
      const otherManager = await query(
        `INSERT INTO event_managers (full_name, email, password_hash, phone, organization)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['Other Manager', 'other.manager@test.com', 'hashed_password', '9876543211', 'Other Organization']
      );
      otherManagerId = otherManager[0].id;
      logger.info('Created other manager');
    }

    // Fetch event created by testManagerId
    const event = await query('SELECT * FROM events WHERE id = $1', [testEventId]);

    // Check ownership with wrong manager
    if (event[0].created_by_manager_id === otherManagerId) {
      logger.error('TEST 3: Ownership validation - FAILED (should not match)');
      return false;
    }

    // Check ownership with correct manager
    if (event[0].created_by_manager_id === testManagerId) {
      logger.success('TEST 3: Ownership validation - PASSED');
      return true;
    }

    logger.error('TEST 3: Ownership validation - FAILED');
    return false;

  } catch (error) {
    logger.error('TEST 3: Ownership validation - ERROR: ' + error.message);
    console.error(error);
    return false;
  }
}

/**
 * Test 4: Waitlist Promotion After Cancellation
 */
async function testWaitlistPromotion() {
  logger.section('TEST 4: Waitlist Promotion');

  try {
    // Create a student on waitlist
    const waitlistStudent = await query(
      `INSERT INTO students (
        full_name, email, password_hash, registration_no, school_id, phone, date_of_birth, pincode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        'Waitlist Student',
        `waitlist.student.${Date.now()}@test.com`,
        'hashed_password',
        `EN${Date.now()}W`,
        testSchoolId,
        '9876543216',
        '2000-01-15',
        '400001'
      ]
    );

    const waitlistStudentId = waitlistStudent[0].id;

    // Create waitlist registration (no registration_number column exists)
    await query(
      `INSERT INTO event_registrations (
        event_id, student_id, registration_status, registration_type, payment_status
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        testEventId,
        waitlistStudentId,
        'WAITLISTED',
        'FREE',
        'NOT_REQUIRED'
      ]
    );

    logger.info('Created waitlisted student');

    // Now promote from waitlist
    const { promoteFromWaitlist } = await import('../../services/waitlist.service.js');
    await promoteFromWaitlist(testEventId, 1);

    // Check if student was promoted
    const promoted = await query(
      'SELECT * FROM event_registrations WHERE student_id = $1 AND event_id = $2',
      [waitlistStudentId, testEventId]
    );

    if (promoted.length > 0 && promoted[0].registration_status === 'CONFIRMED') {
      logger.success('TEST 4: Waitlist promotion - PASSED');
      return true;
    } else {
      logger.error('TEST 4: Waitlist promotion - FAILED');
      return false;
    }

  } catch (error) {
    logger.error('TEST 4: Waitlist promotion - ERROR: ' + error.message);
    console.error(error);
    return false;
  }
}

/**
 * Cleanup test data
 */
async function cleanupTestData() {
  logger.section('CLEANUP: Removing Test Data');

  try {
    // Delete in correct order to avoid FK violations
    // 1. Delete all registrations for this event
    await query('DELETE FROM event_registrations WHERE event_id = $1', [testEventId]);
    
    // 2. Delete any other registrations for students from this school (from waitlist test)
    await query(
      `DELETE FROM event_registrations 
       WHERE student_id IN (SELECT id FROM students WHERE school_id = $1)`,
      [testSchoolId]
    );
    logger.success('Deleted test registrations');

    // 3. Delete test event
    await query('DELETE FROM events WHERE id = $1', [testEventId]);
    logger.success('Deleted test event');

    // Delete students (now safe after all registrations are deleted)
    await query('DELETE FROM students WHERE school_id = $1', [testSchoolId]);
    logger.success('Deleted test students');

    // Note: Not deleting event_managers as they may have other events in the database
    logger.info('Skipped deleting event managers (may have other events)');

    logger.success('Cleanup complete');

  } catch (error) {
    logger.error('Cleanup failed: ' + error.message);
    console.error(error);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  logger.section('EVENT MANAGER CANCELLATION TEST SUITE');
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0
  };

  try {
    // Setup
    const setupSuccess = await setupTestData();
    if (!setupSuccess) {
      logger.error('Setup failed - aborting tests');
      process.exit(1);
    }

    // Run tests
    const tests = [
      { name: 'Single Cancellation', fn: testSingleCancellation },
      { name: 'Bulk Cancellation', fn: testBulkCancellation },
      { name: 'Ownership Validation', fn: testOwnershipValidation },
      { name: 'Waitlist Promotion', fn: testWaitlistPromotion }
    ];

    for (const test of tests) {
      results.total++;
      const passed = await test.fn();
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }
    }

    // Cleanup
    await cleanupTestData();

    // Summary
    logger.section('TEST SUMMARY');
    logger.info(`Total: ${results.total}`);
    logger.success(`Passed: ${results.passed}`);
    if (results.failed > 0) {
      logger.error(`Failed: ${results.failed}`);
    }

    const successRate = ((results.passed / results.total) * 100).toFixed(1);
    logger.info(`Success Rate: ${successRate}%`);

    process.exit(results.failed > 0 ? 1 : 0);

  } catch (error) {
    logger.error('Test suite error: ' + error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runTests();
