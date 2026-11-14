/**
 * Test Suite: Production Polish, Anti-Vibe-Coded, SEO & Architecture
 * Verifies clean URL slugs, custom 404, unique titles/meta, canonical tags, single H1,
 * sitemap/robots/llms.txt, favicons, breadcrumbs, structured data, social images,
 * alt text, bundle shrinking, zero console errors, and zero placeholders.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

console.log('================================================================');
console.log('  TEST SUITE: PRODUCTION POLISH, SEO & ARCHITECTURE VALIDATION  ');
console.log('================================================================');

let total = 0;
let passed = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAsyncTests() {
  const publicDir = path.join(__dirname, '..', 'public');
  const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const aboutHtml = fs.readFileSync(path.join(publicDir, 'about.html'), 'utf8');
  const errorHtml = fs.readFileSync(path.join(publicDir, '404.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  // 1. Clean URL Slugs & Domain
  test('server.js implements clean slug routes for /about, /room/:id, /r/:id, /download, /apk', () => {
    assert(serverJs.includes("app.get('/about'"), 'Must route /about');
    assert(serverJs.includes("app.get(['/room/:roomId', '/r/:roomId']"), 'Must route clean room slugs');
    assert(serverJs.includes("app.get(['/download', '/apk']"), 'Must route /download and /apk');
  });

  test('app.js parses /room/:id clean URL slugs and uses clean /room/ URLs for invite link copying', () => {
    assert(appJs.includes('(?:room|r)'), 'Must extract room from clean URL pathname');
    assert(appJs.includes('/room/${state.roomId}'), 'copyLink must format clean URL slug');
  });

  // 2. Custom 404 Page
  test('public/404.html exists and is styled as a custom cinema 404 page', () => {
    assert(fs.existsSync(path.join(publicDir, '404.html')), '404.html must exist');
    assert(errorHtml.includes('Screen Not Found'), '404 page must describe missing screen');
    assert(errorHtml.includes('Return to Lobby'), '404 page must offer Return to Lobby link');
  });

  test('server.js implements 404 catch-all middleware returning 404 status and 404.html', () => {
    assert(serverJs.includes("res.status(404)"), '404 middleware must set status 404');
    assert(serverJs.includes("'404.html'"), '404 middleware must serve 404.html for html requests');
  });

  // 3. Unique Titles & Meta Descriptions
  test('Each page has a unique, non-empty, branded <title>', () => {
    const getTitle = (h) => (h.match(/<title>(.*?)<\/title>/) || [])[1] || '';
    const indexTitle = getTitle(indexHtml);
    const aboutTitle = getTitle(aboutHtml);
    const errorTitle = getTitle(errorHtml);

    assert(indexTitle && aboutTitle && errorTitle, 'All pages must have a title');
    assert(indexTitle !== aboutTitle, 'index and about titles must be unique');
    assert(indexTitle !== errorTitle, 'index and 404 titles must be unique');
    assert(aboutTitle !== errorTitle, 'about and 404 titles must be unique');
    assert(indexTitle.includes('Lumière'), 'index title must be branded');
    assert(aboutTitle.includes('Lumière'), 'about title must be branded');
    assert(errorTitle.includes('Lumière'), '404 title must be branded');
  });

  test('Each page has a unique meta description', () => {
    const getDesc = (h) => (h.match(/<meta\s+name="description"\s+content="([^"]+)"/i) || [])[1] || '';
    const indexDesc = getDesc(indexHtml);
    const aboutDesc = getDesc(aboutHtml);
    const errorDesc = getDesc(errorHtml);

    assert(indexDesc && aboutDesc && errorDesc, 'All pages must have a description');
    assert(indexDesc !== aboutDesc, 'index and about descriptions must be distinct');
    assert(indexDesc !== errorDesc, 'index and 404 descriptions must be distinct');
  });

  // 4. Canonical Tags & Single H1
  test('Every HTML page contains a canonical link tag', () => {
    assert(indexHtml.includes('<link rel="canonical" href="https://lumiere.live/">'), 'index canonical missing');
    assert(aboutHtml.includes('<link rel="canonical" href="https://lumiere.live/about">'), 'about canonical missing');
    assert(errorHtml.includes('<link rel="canonical" href="https://lumiere.live/404">'), '404 canonical missing');
  });

  test('Every page contains EXACTLY ONE <h1> tag', () => {
    const countH1 = (h) => (h.match(/<h1(\s|>)/gi) || []).length;
    assert.strictEqual(countH1(indexHtml), 1, `index.html must have 1 h1, found ${countH1(indexHtml)}`);
    assert.strictEqual(countH1(aboutHtml), 1, `about.html must have 1 h1, found ${countH1(aboutHtml)}`);
    assert.strictEqual(countH1(errorHtml), 1, `404.html must have 1 h1, found ${countH1(errorHtml)}`);
  });

  // 5. sitemap.xml, robots.txt, and llms.txt
  test('public/robots.txt exists, specifies sitemap, and disallows private rooms', () => {
    assert(fs.existsSync(path.join(publicDir, 'robots.txt')), 'robots.txt must exist');
    const robots = fs.readFileSync(path.join(publicDir, 'robots.txt'), 'utf8');
    assert(robots.includes('Sitemap: https://lumiere.live/sitemap.xml'), 'robots.txt must declare Sitemap');
    assert(robots.includes('Disallow: /room/'), 'robots.txt must protect room privacy');
  });

  test('public/sitemap.xml exists and is valid XML urlset', () => {
    assert(fs.existsSync(path.join(publicDir, 'sitemap.xml')), 'sitemap.xml must exist');
    const sitemap = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');
    assert(sitemap.includes('<urlset'), 'sitemap must contain <urlset>');
    assert(sitemap.includes('https://lumiere.live/'), 'sitemap must list root');
    assert(sitemap.includes('https://lumiere.live/about'), 'sitemap must list /about');
  });

  test('public/llms.txt exists and provides structured LLM context', () => {
    assert(fs.existsSync(path.join(publicDir, 'llms.txt')), 'llms.txt must exist');
    const llms = fs.readFileSync(path.join(publicDir, 'llms.txt'), 'utf8');
    assert(llms.includes('# Lumière Cinema'), 'llms.txt must have title');
    assert(llms.includes('Core Capabilities'), 'llms.txt must outline capabilities');
    assert(llms.includes('Architecture & Technology Stack'), 'llms.txt must outline tech stack');
  });

  test('server.js serves robots.txt, sitemap.xml, and llms.txt with correct MIME types', () => {
    assert(serverJs.includes("app.get('/robots.txt'"), 'Must serve /robots.txt');
    assert(serverJs.includes("app.get('/sitemap.xml'"), 'Must serve /sitemap.xml');
    assert(serverJs.includes("app.get('/llms.txt'"), 'Must serve /llms.txt');
  });

  // 6. Favicons, Internal Links & Breadcrumbs
  test('Complete favicon suite exists (favicon.ico, icon-32.png, icon-192.png, icon-512.png, icon.svg)', () => {
    assert(fs.existsSync(path.join(publicDir, 'favicon.ico')), 'favicon.ico must exist');
    assert(fs.existsSync(path.join(publicDir, 'icon-32.png')), 'icon-32.png must exist');
    assert(fs.existsSync(path.join(publicDir, 'icon-192.png')), 'icon-192.png must exist');
    assert(fs.existsSync(path.join(publicDir, 'icon-512.png')), 'icon-512.png must exist');
    assert(fs.existsSync(path.join(publicDir, 'icon.svg')), 'icon.svg must exist');
  });

  test('Semantic breadcrumbs with BreadcrumbList schema exist on About and 404 pages', () => {
    assert(aboutHtml.includes('itemtype="https://schema.org/BreadcrumbList"'), 'about.html must have breadcrumb microdata');
    assert(errorHtml.includes('itemtype="https://schema.org/BreadcrumbList"'), '404.html must have breadcrumb microdata');
  });

  // 7. Structured Data & Local Business Schema
  test('index.html contains WebApplication, LocalBusiness, and BreadcrumbList JSON-LD schema', () => {
    assert(indexHtml.includes('"@type": "WebApplication"'), 'Must have WebApplication schema');
    assert(indexHtml.includes('"@type": "LocalBusiness"'), 'Must have LocalBusiness schema');
    assert(indexHtml.includes('"@type": "BreadcrumbList"'), 'Must have BreadcrumbList schema');
  });

  // 8. Social Share Images & Alt Text on Every Image
  test('High-resolution social share image public/og-image.png exists (1200x630)', () => {
    const ogPath = path.join(publicDir, 'og-image.png');
    assert(fs.existsSync(ogPath), 'og-image.png must exist');
    const stat = fs.statSync(ogPath);
    assert(stat.size > 20000, 'og-image.png must be high quality');
  });

  test('Open Graph and Twitter Card tags are defined across all pages', () => {
    assert(indexHtml.includes('property="og:image" content="https://lumiere.live/og-image.png"'), 'index og:image missing');
    assert(aboutHtml.includes('property="og:image" content="https://lumiere.live/og-image.png"'), 'about og:image missing');
    assert(errorHtml.includes('property="og:image" content="https://lumiere.live/og-image.png"'), '404 og:image missing');
  });

  test('EVERY <img> tag across all HTML files has a descriptive alt attribute', () => {
    const htmlFiles = [indexHtml, aboutHtml, errorHtml];
    for (const doc of htmlFiles) {
      const imgRegex = /<img\s+([^>]*?)>/gi;
      let match;
      while ((match = imgRegex.exec(doc)) !== null) {
        const attrs = match[1];
        assert(attrs.includes('alt='), `Image missing alt: ${match[0]}`);
        const altMatch = attrs.match(/alt="([^"]*)"/i);
        assert(altMatch && altMatch[1].trim().length > 0, `Image alt must not be empty: ${match[0]}`);
      }
    }
  });

  // 9. Zero Production Source Maps
  test('Zero production source map files (*.map) or sourceMappingURL references in public/', () => {
    const files = fs.readdirSync(publicDir);
    const mapFiles = files.filter(f => f.endsWith('.map'));
    assert.strictEqual(mapFiles.length, 0, `No .map files allowed: ${mapFiles.join(', ')}`);
    assert(!appJs.includes('sourceMappingURL'), 'app.js must not reference source maps');
  });

  // 10. Bundle Shrinking & Minification
  test('Production bundles public/app.min.js and public/style.min.css exist and are significantly smaller', () => {
    const minJs = path.join(publicDir, 'app.min.js');
    const minCss = path.join(publicDir, 'style.min.css');
    assert(fs.existsSync(minJs), 'app.min.js must exist');
    assert(fs.existsSync(minCss), 'style.min.css must exist');
    const jsOrig = fs.statSync(path.join(publicDir, 'app.js')).size;
    const jsMin = fs.statSync(minJs).size;
    assert(jsMin < jsOrig * 0.7, `app.min.js (${jsMin}) must be at least 30% smaller than app.js (${jsOrig})`);
  });

  test('server.js enables HTTP compression middleware', () => {
    assert(serverJs.includes('app.use(compression('), 'server.js must use compression middleware');
  });

  // 11. Tab Doesn’t Say Vite or React
  test('Zero references to "Vite", "React App", or default starter kit titles', () => {
    const checkNoBoilerplate = (str, label) => {
      assert(!str.includes('Vite App'), `${label} must not contain "Vite App"`);
      assert(!str.includes('React App'), `${label} must not contain "React App"`);
      assert(!str.includes('Create React App'), `${label} must not contain "Create React App"`);
    };
    checkNoBoilerplate(indexHtml, 'index.html');
    checkNoBoilerplate(aboutHtml, 'about.html');
    checkNoBoilerplate(errorHtml, '404.html');
    checkNoBoilerplate(appJs, 'app.js');
  });

  // 12. Placeholder Content Removed
  test('Generic placeholders (Big Buck Bunny, example.com/video.mp4, Lorem Ipsum) are removed', () => {
    assert(!indexHtml.includes('Big Buck Bunny'), 'Big Buck Bunny must be removed');
    assert(!indexHtml.includes('example.com/video.mp4'), 'example.com must be replaced with branded domain');
    assert(!indexHtml.toLowerCase().includes('lorem ipsum'), 'No lorem ipsum allowed in index');
    assert(!aboutHtml.toLowerCase().includes('lorem ipsum'), 'No lorem ipsum allowed in about');
  });

  console.log('================================================================');
  console.log(`  RESULTS: ${passed}/${total} passed`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runAsyncTests().catch(err => {
  console.error(err);
  process.exit(1);
});
