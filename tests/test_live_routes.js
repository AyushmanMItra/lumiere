const http = require('http');
const assert = require('assert');

// Spawn server or import app
process.env.PORT = '8920';
process.env.HTTPS_PORT = '8921';

// We can require server.js which will start on 8920
require('../server.js');

function fetchUrl(path, options = {}) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:8920${path}`, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function run() {
  console.log('Testing live server routes on port 8920...');
  // Wait 1.5s for server to start
  await new Promise(r => setTimeout(r, 1500));

  // 1. Root /
  const root = await fetchUrl('/');
  assert.strictEqual(root.status, 200, 'Root must return 200');
  assert(root.body.includes('Lumière — Frame-Accurate Private Cinema & Watch Party'), 'Root must contain branded title');
  console.log('  ✓ GET / returns 200 OK with branded HTML');

  // 2. /about
  const about = await fetchUrl('/about');
  assert.strictEqual(about.status, 200, 'About must return 200');
  assert(about.body.includes('About the Maker & Technology — Lumière Cinema'), 'About must serve about.html');
  console.log('  ✓ GET /about returns 200 OK with custom about.html');

  // 3. /room/:roomId and /r/:roomId
  const room = await fetchUrl('/room/ALPHA99');
  assert.strictEqual(room.status, 200, '/room/:id must return 200');
  assert(room.body.includes('Lumière'), '/room/:id must serve index.html');
  console.log('  ✓ GET /room/ALPHA99 returns 200 OK');

  const shortRoom = await fetchUrl('/r/BETA88');
  assert.strictEqual(shortRoom.status, 200, '/r/:id must return 200');
  console.log('  ✓ GET /r/BETA88 returns 200 OK');

  // 4. /robots.txt
  const robots = await fetchUrl('/robots.txt');
  assert.strictEqual(robots.status, 200, '/robots.txt must return 200');
  assert(robots.headers['content-type'].includes('text/plain'), 'robots.txt must be text/plain');
  assert(robots.body.includes('Sitemap: https://lumiere.live/sitemap.xml'), 'robots.txt must include Sitemap');
  console.log('  ✓ GET /robots.txt returns 200 OK text/plain');

  // 5. /sitemap.xml
  const sitemap = await fetchUrl('/sitemap.xml');
  assert.strictEqual(sitemap.status, 200, '/sitemap.xml must return 200');
  assert(sitemap.headers['content-type'].includes('xml'), 'sitemap.xml must be xml');
  assert(sitemap.body.includes('<urlset'), 'sitemap.xml must have urlset');
  console.log('  ✓ GET /sitemap.xml returns 200 OK application/xml');

  // 6. /llms.txt
  const llms = await fetchUrl('/llms.txt');
  assert.strictEqual(llms.status, 200, '/llms.txt must return 200');
  assert(llms.headers['content-type'].includes('text/plain'), 'llms.txt must be text/plain');
  assert(llms.body.includes('# Lumière Cinema'), 'llms.txt must have title');
  console.log('  ✓ GET /llms.txt returns 200 OK text/plain');

  // 7. /favicon.ico
  const favicon = await fetchUrl('/favicon.ico');
  assert.strictEqual(favicon.status, 200, '/favicon.ico must return 200');
  assert(favicon.headers['content-type'].includes('image'), 'favicon.ico must be image content-type');
  console.log('  ✓ GET /favicon.ico returns 200 OK image/x-icon');

  // 8. /download and /apk
  const dl = await fetchUrl('/download');
  assert.strictEqual(dl.status, 302, '/download must redirect 302');
  assert.strictEqual(dl.headers.location, '/lumiere.apk', '/download must point to /lumiere.apk');
  console.log('  ✓ GET /download returns 302 redirecting to /lumiere.apk');

  const apk = await fetchUrl('/apk');
  assert.strictEqual(apk.status, 302, '/apk must redirect 302');
  assert.strictEqual(apk.headers.location, '/lumiere.apk', '/apk must point to /lumiere.apk');
  console.log('  ✓ GET /apk returns 302 redirecting to /lumiere.apk');

  // 9. Custom 404 page for unknown URLs
  const notFound = await fetchUrl('/this-room-does-not-exist-xyz-987');
  assert.strictEqual(notFound.status, 404, 'Unknown route must return 404 status');
  assert(notFound.body.includes('404 — Screen Not Found | Lumière Cinema'), 'Unknown route must serve custom 404.html');
  assert(notFound.body.includes('Screen Not Found'), '404 page body must have Screen Not Found heading');
  console.log('  ✓ GET /unknown-route returns HTTP 404 with custom 404.html');

  console.log('\nALL 9 LIVE HTTP ENDPOINT TESTS PASSED PERFECTLY!\n');
  process.exit(0);
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
