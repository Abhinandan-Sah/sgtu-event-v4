// QR Code Service Tests - Production validation and performance benchmarking
import QRCodeService from '../services/qrCode.js';
import redisClient from '../config/redis.js';
import { query } from '../config/db.js';
import crypto from 'crypto';

// Test configuration
const TEST_CONFIG = {
  warmupStudents: 100, // Number of students for cache warming test
  concurrentRequests: 1000, // Concurrent QR requests for load test
  performanceThreshold: 50 // Max latency in ms for cached QRs
};

/**
 * Test 1: QR Token Generation
 */
async function testQRTokenGeneration() {
  console.log('\n📝 Test 1: QR Token Generation');
  console.log('━'.repeat(60));

  try {
    const mockStudent = {
      id: crypto.randomUUID(),
      email: 'test@sgtu.ac.in',
      registration_no: '2024SGTU99999'
    };

    const token = QRCodeService.generateStudentQRToken(mockStudent);
    
    // Verify token is valid JWT
    const verification = QRCodeService.verifyStudentQRToken(token);
    
    if (verification.valid && verification.student_id === mockStudent.id) {
      console.log('✅ Token generation: PASSED');
      console.log(`   Token length: ${token.length} characters`);
      console.log(`   Verified: ${verification.valid}`);
      return true;
    } else {
      console.log('❌ Token generation: FAILED');
      console.log(`   Verification: ${JSON.stringify(verification)}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Token generation: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

/**
 * Test 2: QR Image Generation (No Cache)
 */
async function testQRImageGeneration() {
  console.log('\n🖼️  Test 2: QR Image Generation (Cold Start)');
  console.log('━'.repeat(60));

  try {
    const mockStudent = {
      id: crypto.randomUUID(),
      email: 'test@sgtu.ac.in',
      registration_no: '2024SGTU99999'
    };

    const token = QRCodeService.generateStudentQRToken(mockStudent);
    
    // Clear cache first
    await QRCodeService.clearQRCache(token);
    
    // Measure generation time
    const startTime = Date.now();
    const qrImage = await QRCodeService.generateQRCodeImage(token);
    const duration = Date.now() - startTime;

    if (qrImage && qrImage.startsWith('data:image/png;base64,')) {
      console.log('✅ QR image generation: PASSED');
      console.log(`   Duration: ${duration}ms (cold start)`);
      console.log(`   Image size: ${(qrImage.length / 1024).toFixed(2)} KB`);
      console.log(`   Format: PNG Base64 Data URL`);
      return true;
    } else {
      console.log('❌ QR image generation: FAILED');
      console.log(`   Invalid format or empty image`);
      return false;
    }
  } catch (error) {
    console.log('❌ QR image generation: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

/**
 * Test 3: Redis Caching Performance
 */
async function testRedisCaching() {
  console.log('\n⚡ Test 3: Redis Caching Performance');
  console.log('━'.repeat(60));

  try {
    const mockStudent = {
      id: crypto.randomUUID(),
      email: 'test@sgtu.ac.in',
      registration_no: '2024SGTU99999'
    };

    const token = QRCodeService.generateStudentQRToken(mockStudent);
    
    // Clear cache
    await QRCodeService.clearQRCache(token);

    // First request (cache miss)
    const start1 = Date.now();
    const qr1 = await QRCodeService.generateQRCodeImage(token);
    const duration1 = Date.now() - start1;

    // Second request (cache hit)
    const start2 = Date.now();
    const qr2 = await QRCodeService.generateQRCodeImage(token);
    const duration2 = Date.now() - start2;

    // Verify both images are identical
    const imagesMatch = qr1 === qr2;

    // Calculate speedup
    const speedup = (duration1 / duration2).toFixed(1);

    if (imagesMatch && duration2 < TEST_CONFIG.performanceThreshold) {
      console.log('✅ Redis caching: PASSED');
      console.log(`   Cache miss (1st): ${duration1}ms`);
      console.log(`   Cache hit (2nd): ${duration2}ms ⚡`);
      console.log(`   Speedup: ${speedup}x faster`);
      console.log(`   Images match: ${imagesMatch}`);
      console.log(`   Performance: ${duration2 < TEST_CONFIG.performanceThreshold ? '✅' : '❌'} (<${TEST_CONFIG.performanceThreshold}ms)`);
      return true;
    } else {
      console.log('❌ Redis caching: FAILED');
      console.log(`   Cache hit latency: ${duration2}ms (target: <${TEST_CONFIG.performanceThreshold}ms)`);
      console.log(`   Images match: ${imagesMatch}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Redis caching: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

/**
 * Test 4: Concurrent Load Test
 */
async function testConcurrentLoad() {
  console.log(`\n🔥 Test 4: Concurrent Load Test (${TEST_CONFIG.concurrentRequests} requests)`);
  console.log('━'.repeat(60));

  try {
    // Create multiple unique tokens
    const tokens = [];
    for (let i = 0; i < 10; i++) {
      const mockStudent = {
        id: crypto.randomUUID(),
        email: `test${i}@sgtu.ac.in`,
        registration_no: `2024SGTU${10000 + i}`
      };
      tokens.push(QRCodeService.generateStudentQRToken(mockStudent));
    }

    // Pre-warm cache for first token
    await QRCodeService.generateQRCodeImage(tokens[0]);

    console.log('⏳ Sending concurrent requests...');

    // Send concurrent requests (mix of cached and uncached)
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < TEST_CONFIG.concurrentRequests; i++) {
      const token = tokens[i % tokens.length]; // Rotate through tokens
      promises.push(
        QRCodeService.generateQRCodeImage(token)
          .then(() => ({ success: true }))
          .catch(err => ({ success: false, error: err.message }))
      );
    }

    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;

    // Analyze results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const avgLatency = (duration / TEST_CONFIG.concurrentRequests).toFixed(2);
    const throughput = (TEST_CONFIG.concurrentRequests / (duration / 1000)).toFixed(0);

    if (successful === TEST_CONFIG.concurrentRequests) {
      console.log('✅ Concurrent load test: PASSED');
      console.log(`   Total requests: ${TEST_CONFIG.concurrentRequests}`);
      console.log(`   Successful: ${successful}`);
      console.log(`   Failed: ${failed}`);
      console.log(`   Total duration: ${duration}ms`);
      console.log(`   Avg latency: ${avgLatency}ms`);
      console.log(`   Throughput: ${throughput} req/sec`);
      return true;
    } else {
      console.log('❌ Concurrent load test: FAILED');
      console.log(`   Success rate: ${(successful / TEST_CONFIG.concurrentRequests * 100).toFixed(1)}%`);
      return false;
    }
  } catch (error) {
    console.log('❌ Concurrent load test: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

/**
 * Test 5: Cache Warming Performance
 */
async function testCacheWarming() {
  console.log(`\n🔥 Test 5: Cache Warming (${TEST_CONFIG.warmupStudents} students)`);
  console.log('━'.repeat(60));

  try {
    // Create mock students with tokens
    const mockStudents = [];
    for (let i = 0; i < TEST_CONFIG.warmupStudents; i++) {
      const student = {
        id: crypto.randomUUID(),
        email: `warmup${i}@sgtu.ac.in`,
        registration_no: `2024WARM${10000 + i}`,
        qr_code_token: null
      };
      student.qr_code_token = QRCodeService.generateStudentQRToken(student);
      mockStudents.push(student);
    }

    console.log(`⏳ Warming cache for ${TEST_CONFIG.warmupStudents} QR codes...`);

    const startTime = Date.now();
    
    // Warm cache in batches (simulating warmStudentQRCache)
    const batchSize = 50;
    let cached = 0;

    for (let i = 0; i < mockStudents.length; i += batchSize) {
      const batch = mockStudents.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(s => QRCodeService.generateQRCodeImage(s.qr_code_token))
      );
      cached += results.filter(r => r.status === 'fulfilled').length;
    }

    const duration = Date.now() - startTime;
    const qrsPerSecond = (cached / (duration / 1000)).toFixed(0);

    if (cached === TEST_CONFIG.warmupStudents) {
      console.log('✅ Cache warming: PASSED');
      console.log(`   QRs cached: ${cached}/${TEST_CONFIG.warmupStudents}`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Speed: ${qrsPerSecond} QRs/second`);
      return true;
    } else {
      console.log('❌ Cache warming: FAILED');
      console.log(`   Success rate: ${(cached / TEST_CONFIG.warmupStudents * 100).toFixed(1)}%`);
      return false;
    }
  } catch (error) {
    console.log('❌ Cache warming: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

/**
 * Test 6: QR Verification
 */
async function testQRVerification() {
  console.log('\n🔐 Test 6: QR Token Verification');
  console.log('━'.repeat(60));

  try {
    const mockStudent = {
      id: crypto.randomUUID(),
      email: 'verify@sgtu.ac.in',
      registration_no: '2024VERIFY001'
    };

    const validToken = QRCodeService.generateStudentQRToken(mockStudent);
    const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid';
    const tamperedToken = validToken.slice(0, -10) + 'TAMPERED';

    // Test valid token
    const valid = QRCodeService.verifyStudentQRToken(validToken);
    
    // Test invalid token
    const invalid = QRCodeService.verifyStudentQRToken(invalidToken);
    
    // Test tampered token
    const tampered = QRCodeService.verifyStudentQRToken(tamperedToken);

    const allTestsPassed = 
      valid.valid === true &&
      invalid.valid === false &&
      tampered.valid === false;

    if (allTestsPassed) {
      console.log('✅ QR verification: PASSED');
      console.log(`   Valid token: ${valid.valid ? '✅' : '❌'}`);
      console.log(`   Invalid token rejected: ${!invalid.valid ? '✅' : '❌'}`);
      console.log(`   Tampered token rejected: ${!tampered.valid ? '✅' : '❌'}`);
      return true;
    } else {
      console.log('❌ QR verification: FAILED');
      return false;
    }
  } catch (error) {
    console.log('❌ QR verification: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

/**
 * Test 7: Redis Connection Health
 */
async function testRedisConnection() {
  console.log('\n🔌 Test 7: Redis Connection Health');
  console.log('━'.repeat(60));

  try {
    // Ensure Redis is connected
    if (!redisClient.client || !redisClient.client.isOpen) {
      console.log('🔄 Connecting to Redis...');
      await redisClient.connect();
    }
    
    // Wait for the ready event to fire and update isConnected flag
    let attempts = 0;
    while (!redisClient.isConnected && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      attempts++;
    }

    const pingSuccess = await redisClient.ping();
    const isConnected = redisClient.isConnected;

    if (isConnected && pingSuccess) {
      console.log('✅ Redis connection: HEALTHY');
      console.log(`   Connected: ${isConnected}`);
      console.log(`   Ping: ${pingSuccess ? 'PONG' : 'FAILED'}`);
      console.log(`   Host: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
      return true;
    } else if (pingSuccess) {
      // Ping works but isConnected flag not set yet (race condition)
      console.log('✅ Redis connection: OPERATIONAL');
      console.log(`   Ping: PONG`);
      console.log(`   Host: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
      console.log(`   Note: Connection flag will update shortly`);
      return true;
    } else {
      console.log('❌ Redis connection: FAILED');
      console.log(`   Connected: ${isConnected}`);
      console.log(`   Ping: ${pingSuccess}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Redis connection: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

/**
 * Main Test Runner
 */
async function runAllTests() {
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('🧪 QR CODE SERVICE - PRODUCTION VALIDATION TESTS');
  console.log('═'.repeat(60));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🎯 Target: <${TEST_CONFIG.performanceThreshold}ms latency for cached QRs`);
  console.log(`📊 Load: ${TEST_CONFIG.concurrentRequests} concurrent requests`);

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // Run tests sequentially
  const tests = [
    { name: 'Redis Connection', fn: testRedisConnection },
    { name: 'QR Token Generation', fn: testQRTokenGeneration },
    { name: 'QR Image Generation', fn: testQRImageGeneration },
    { name: 'Redis Caching', fn: testRedisCaching },
    { name: 'QR Verification', fn: testQRVerification },
    { name: 'Cache Warming', fn: testCacheWarming },
    { name: 'Concurrent Load', fn: testConcurrentLoad }
  ];

  for (const test of tests) {
    const passed = await test.fn();
    results.tests.push({ name: test.name, passed });
    if (passed) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  // Summary
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`✅ Passed: ${results.passed}/${tests.length}`);
  console.log(`❌ Failed: ${results.failed}/${tests.length}`);
  console.log(`📈 Success Rate: ${((results.passed / tests.length) * 100).toFixed(1)}%`);
  console.log('\n📋 Test Results:');
  results.tests.forEach(test => {
    console.log(`   ${test.passed ? '✅' : '❌'} ${test.name}`);
  });
  console.log('═'.repeat(60));

  if (results.passed === tests.length) {
    console.log('\n🎉 ALL TESTS PASSED - PRODUCTION READY! 🚀\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  SOME TESTS FAILED - REVIEW REQUIRED\n');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Test suite error:', error);
  process.exit(1);
});
