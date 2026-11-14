const http = require('http');
const assert = require('assert');

// Ensure server is loaded
process.env.PORT = '8920';
process.env.HTTPS_PORT = '8921';
require('../server.js');

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:8920${urlPath}`, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

async function run() {
  await new Promise(r => setTimeout(r, 1200));

  console.log('Testing Room URL Asset Resolution & Exit Reliability:');

  // 1. Room HTML content & asset links
  const r1 = await get('/room/XRMNFV');
  assert.strictEqual(r1.status, 200, 'Room route must return 200');
  assert(r1.body.includes('<base href="/">'), 'Missing base tag in index.html');
  assert(r1.body.includes('href="/style.css?v=3.1"'), 'Missing absolute style.css path');
  assert(r1.body.includes('src="/app.js?v=2.9"'), 'Missing absolute app.js path');
  console.log('  [PASS] /room/XRMNFV returns HTML with base tag and root-relative asset URLs');

  // 2. Relative asset fallback on /room/style.css
  const r2 = await get('/room/style.css');
  assert.strictEqual(r2.status, 200, '/room/style.css must return 200');
  assert(r2.headers['content-type'].includes('css'), `Must be CSS MIME type, got: ${r2.headers['content-type']}`);
  console.log('  [PASS] /room/style.css returns static CSS asset with correct MIME type');

  // 3. Relative asset fallback on /room/app.js
  const r3 = await get('/room/app.js');
  assert.strictEqual(r3.status, 200, '/room/app.js must return 200');
  assert(r3.headers['content-type'].includes('javascript'), `Must be JS MIME type, got: ${r3.headers['content-type']}`);
  console.log('  [PASS] /room/app.js returns static JS asset with correct MIME type');

  // 4. Short room route /r/TEST99
  const r4 = await get('/r/TEST99');
  assert.strictEqual(r4.status, 200, '/r/TEST99 must return 200');
  console.log('  [PASS] /r/TEST99 returns 200 HTML');

  console.log('\n[ALL ROOM ASSET RESOLUTION TESTS PASSED PERFECTLY]');
  process.exit(0);
}

run().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
