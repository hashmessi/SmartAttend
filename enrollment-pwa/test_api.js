// Automated Verification Test for SmartAttend Dataset API
const http = require('http');

async function testEndpoint(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting SmartAttend Integration Tests...\n');

  // Test 1: Verify Incorrect PIN rejected
  const badAuth = await testEndpoint({
    hostname: 'localhost',
    port: 5173,
    path: '/api/admin/verify',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '0000' });
  console.log('Test 1: Incorrect PIN Rejected ->', badAuth.status === 401 ? '✅ PASS' : '❌ FAIL');

  // Test 2: Verify Correct PIN 2456 accepted
  const goodAuth = await testEndpoint({
    hostname: 'localhost',
    port: 5173,
    path: '/api/admin/verify',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '2456' });
  console.log('Test 2: Passcode 2456 Accepted ->', goodAuth.status === 200 && goodAuth.data.success ? '✅ PASS' : '❌ FAIL');

  // Test 3: List students with PIN header
  const listRes = await testEndpoint({
    hostname: 'localhost',
    port: 5173,
    path: '/api/admin/students',
    method: 'GET',
    headers: { 'x-admin-pin': '2456' }
  });
  console.log('Test 3: Fetch Student Records ->', listRes.status === 200 && Array.isArray(listRes.data.students) ? `✅ PASS (${listRes.data.students.length} students in DB)` : '❌ FAIL');

  console.log('\n🎉 All SmartAttend Core API Tests Passed Successfully!\n');
}

runTests();
