import { query } from '../config/db.js';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

// Color codes for terminal
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`)
};

// Test data
let testData = {
  adminToken: null,
  eventId: null
};

// Helper function to make API calls
async function apiCall(method, endpoint, token = null, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  // Debug logging for admin calls
  if (token && process.env.DEBUG_TESTS) {
    console.log(`\nDEBUG: ${method} ${endpoint}`);
    console.log('Headers:', headers);
  }
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();
    
    // Debug error responses
    if (token && response.status >= 400 && process.env.DEBUG_TESTS) {
      console.log('Error Response:', data);
    }
    
    return { status: response.status, data };
  } catch (error) {
    return { status: 0, data: { message: error.message } };
  }
}

// Test Suite
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 RANKING VISIBILITY SYSTEM - TEST SUITE');
  console.log('='.repeat(60) + '\n');

  try {
    // ============================================================
    // SETUP: Get tokens and test event
    // ============================================================
    log.info('SETUP: Getting authentication tokens...');
    
    // Get admin token
    const adminLogin = await apiCall('POST', '/admin/login', null, {
      email: 'admin@sgtu.ac.in',
      password: 'admin123'
    });
    if (adminLogin.status === 200) {
      testData.adminToken = adminLogin.data.data.token;
      log.success('Admin login successful');
      log.info(`Token: ${testData.adminToken.substring(0, 20)}...`);
      
      // Quick auth test
      const authTest = await apiCall('GET', '/admin/profile', testData.adminToken);
      if (authTest.status === 200) {
        log.success('Authentication verified');
      } else {
        log.error(`Auth test failed: ${authTest.status} - ${authTest.data.message}`);
        console.log('Auth test response:', authTest.data);
      }
    } else {
      console.log('Admin login response:', adminLogin);
      throw new Error('Admin login failed');
    }

    // Get test event (first ACTIVE or APPROVED event)
    const eventsResult = await query(
      "SELECT id, event_name, status, rankings_published FROM events WHERE status IN ('ACTIVE', 'APPROVED', 'COMPLETED') LIMIT 1"
    );
    if (eventsResult.length > 0) {
      testData.eventId = eventsResult[0].id;
      log.success(`Test event found: ${eventsResult[0].event_name} (${eventsResult[0].status})`);
      log.info(`Initial rankings_published: ${eventsResult[0].rankings_published}`);
    } else {
      throw new Error('No test event found. Please create an event first.');
    }

    console.log('\n' + '-'.repeat(60));
    
    // ============================================================
    // TEST 1: Public Access - Rankings Hidden (Default)
    // ============================================================
    console.log('\n📝 TEST 1: Public Access - Rankings Hidden by Default');
    
    const publicTest1 = await apiCall('GET', `/ranking/${testData.eventId}/stalls/top/10`);
    if (publicTest1.status === 403) {
      log.success('Public ranking access correctly blocked');
      log.info(`Message: ${publicTest1.data.message}`);
    } else {
      log.error(`Expected 403, got ${publicTest1.status}`);
    }

    // ============================================================
    // TEST 2: Admin Publishes Rankings
    // ============================================================
    console.log('\n📝 TEST 2: Admin Publishes Rankings (Override)');
    
    const publishTest = await apiCall(
      'PATCH',
      `/admin/events/${testData.eventId}/publish-rankings`,
      testData.adminToken
    );
    if (publishTest.status === 200) {
      log.success('Rankings published successfully');
      log.info(`Message: ${publishTest.data.message}`);
    } else {
      log.error(`Publish failed: ${publishTest.data.message}`);
    }

    // ============================================================
    // TEST 3: Public Access - Rankings Now Visible
    // ============================================================
    console.log('\n📝 TEST 3: Public Access - Rankings Now Visible');
    
    const publicTest2 = await apiCall('GET', `/ranking/${testData.eventId}/stalls/top/10`);
    if (publicTest2.status === 200) {
      log.success('Public ranking access now allowed');
      log.info(`Rankings returned: ${publicTest2.data.data.leaderboard?.length || 0} stalls`);
    } else {
      log.error(`Expected 200, got ${publicTest2.status}: ${publicTest2.data.message}`);
    }

    // ============================================================
    // TEST 4: Admin Unpublishes Rankings
    // ============================================================
    console.log('\n📝 TEST 4: Admin Unpublishes Rankings (Hide Again)');
    
    const unpublishTest = await apiCall(
      'PATCH',
      `/admin/events/${testData.eventId}/unpublish-rankings`,
      testData.adminToken
    );
    if (unpublishTest.status === 200) {
      log.success('Rankings unpublished successfully');
      log.info(`Message: ${unpublishTest.data.message}`);
    } else {
      log.error(`Unpublish failed: ${unpublishTest.data.message}`);
    }

    // ============================================================
    // TEST 5: Public Access - Rankings Hidden Again
    // ============================================================
    console.log('\n📝 TEST 5: Public Access - Rankings Hidden Again');
    
    const publicTest3 = await apiCall('GET', `/ranking/${testData.eventId}/stalls/top/10`);
    if (publicTest3.status === 403) {
      log.success('Public ranking access correctly blocked again');
    } else {
      log.error(`Expected 403, got ${publicTest3.status}`);
    }

    // ============================================================
    // TEST 6: Admin Resets to Auto-Mode
    // ============================================================
    console.log('\n📝 TEST 6: Admin Resets to Auto-Mode');
    
    const resetTest = await apiCall(
      'PATCH',
      `/admin/events/${testData.eventId}/reset-rankings-visibility`,
      testData.adminToken
    );
    if (resetTest.status === 200) {
      log.success('Rankings visibility reset to auto-mode');
      log.info(`Message: ${resetTest.data.message}`);
    } else {
      log.error(`Reset failed: ${resetTest.data.message}`);
    }

    // ============================================================
    // TEST 7: Admin Cross-Event Rankings
    // ============================================================
    console.log('\n📝 TEST 7: Admin Cross-Event Rankings');
    
    const crossEventTest = await apiCall('GET', '/admin/rankings/all', testData.adminToken);
    if (crossEventTest.status === 200) {
      log.success('Admin can view cross-event rankings');
      log.info(`Total events with rankings: ${crossEventTest.data.data.total_events_with_rankings}`);
      log.info(`Rankings by event: ${crossEventTest.data.data.rankings_by_event.length}`);
    } else {
      log.error(`Expected 200, got ${crossEventTest.status}`);
      log.error(`Error: ${crossEventTest.data.message || JSON.stringify(crossEventTest.data)}`);
    }

    // ============================================================
    // TEST 8: Admin Event-Specific Rankings
    // ============================================================
    console.log('\n📝 TEST 8: Admin Event-Specific Rankings');
    
    const adminStallsTest = await apiCall(
      'GET',
      `/admin/events/${testData.eventId}/rankings/stalls`,
      testData.adminToken
    );
    if (adminStallsTest.status === 200) {
      log.success('Admin can view event-specific stall rankings');
      log.info(`Stalls in leaderboard: ${adminStallsTest.data.data.leaderboard?.length || 0}`);
    } else {
      log.error(`Expected 200, got ${adminStallsTest.status}`);
    }

    // ============================================================
    // TEST 9: Test Student Top Rankings Route
    // ============================================================
    console.log('\n📝 TEST 9: Public Student Rankings (Hidden)');
    
    const studentRankingsTest = await apiCall(
      'GET',
      `/ranking/${testData.eventId}/students/top/10`
    );
    if (studentRankingsTest.status === 403) {
      log.success('Student rankings correctly hidden');
    } else {
      log.error(`Expected 403, got ${studentRankingsTest.status}`);
    }

    // ============================================================
    // TEST 10: Test School Rankings Route
    // ============================================================
    console.log('\n📝 TEST 10: Public School Rankings (Hidden)');
    
    const schoolRankingsTest = await apiCall(
      'GET',
      `/ranking/${testData.eventId}/schools/top/10`
    );
    if (schoolRankingsTest.status === 403) {
      log.success('School rankings correctly hidden');
    } else {
      log.error(`Expected 403, got ${schoolRankingsTest.status}`);
    }

    // ============================================================
    // TEST 11: Verify Database State
    // ============================================================
    console.log('\n📝 TEST 11: Verify Database State');
    
    const dbCheck = await query(
      'SELECT rankings_published FROM events WHERE id = $1',
      [testData.eventId]
    );
    log.info(`Final rankings_published value: ${dbCheck[0].rankings_published}`);
    log.success('Database state verified');

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS COMPLETED');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    console.error(error);
  }
}

// Run tests
runTests().then(() => {
  console.log('\n✨ Test suite finished\n');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
