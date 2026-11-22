const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');

async function run() {
  const publicDir = path.join(__dirname, 'public');
  
  // 1. Minify JavaScript
  const jsPath = path.join(publicDir, 'app.js');
  const jsOutPath = path.join(publicDir, 'app.min.js');
  const jsCode = fs.readFileSync(jsPath, 'utf8');
  console.log(`Original app.js size: ${(Buffer.byteLength(jsCode) / 1024).toFixed(1)} KB`);

  const minifiedJs = await minify(jsCode, {
    compress: {
      drop_console: false,
      passes: 2
    },
    mangle: {
      reserved: ['io', 'Hls', 'windowManager']
    },
    format: {
      comments: false
    }
  });

  if (minifiedJs.error) {
    console.error('JS Minify Error:', minifiedJs.error);
    process.exit(1);
  }

  fs.writeFileSync(jsOutPath, minifiedJs.code, 'utf8');
  console.log(`Minified app.min.js size: ${(Buffer.byteLength(minifiedJs.code) / 1024).toFixed(1)} KB`);

  // 2. Minify CSS
  const cssPath = path.join(publicDir, 'style.css');
  const cssOutPath = path.join(publicDir, 'style.min.css');
  const cssCode = fs.readFileSync(cssPath, 'utf8');
  console.log(`Original style.css size: ${(Buffer.byteLength(cssCode) / 1024).toFixed(1)} KB`);

  const minifiedCss = new CleanCSS({ level: 2 }).minify(cssCode);
  if (minifiedCss.errors.length > 0) {
    console.error('CSS Minify Errors:', minifiedCss.errors);
  }

  fs.writeFileSync(cssOutPath, minifiedCss.styles, 'utf8');
  console.log(`Minified style.min.css size: ${(Buffer.byteLength(minifiedCss.styles) / 1024).toFixed(1)} KB`);

  // 3. Synchronize to test_website/public
  const testWebsitePublic = path.join(__dirname, 'test_website', 'public');
  if (fs.existsSync(testWebsitePublic)) {
    fs.copyFileSync(jsPath, path.join(testWebsitePublic, 'app.js'));
    fs.copyFileSync(jsOutPath, path.join(testWebsitePublic, 'app.min.js'));
    fs.copyFileSync(cssPath, path.join(testWebsitePublic, 'style.css'));
    fs.copyFileSync(cssOutPath, path.join(testWebsitePublic, 'style.min.css'));
    console.log('Synchronized production bundles to test_website/public/');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
