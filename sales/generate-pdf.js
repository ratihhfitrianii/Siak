const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function generatePDF(inputPath, outputPath, options = {}) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600 });
  
  const fileUrl = 'file://' + path.resolve(inputPath).replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 60000 });
  
  // Wait for content to render
  await new Promise(r => setTimeout(r, 1500));
  
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
    ...options
  });
  
  await browser.close();
  console.log('Generated:', outputPath);
}

async function main() {
  const salesDir = path.join(__dirname);
  
  // Generate pitch deck PDF
  await generatePDF(
    path.join(salesDir, 'pitch-deck-siak.html'),
    path.join(salesDir, 'pitch-deck-siak.pdf')
  );
  
  // Generate spec sheet PDF (need to convert markdown to HTML first)
  // We'll use the pitch deck styling for markdown
  const marked = require('marked');
  
  function markdownToHTML(mdPath) {
    const md = fs.readFileSync(mdPath, 'utf-8');
    const htmlContent = marked.parse(md, { breaks: true });
    return `
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SIAK - Spec Sheet</title>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.6; color: #111; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { color: #1d4ed8; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px; }
  h2 { color: #1e3a8a; margin-top: 30px; }
  h3 { color: #3b82f6; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #1d4ed8; color: white; }
  tr:nth-child(even) td { background: #f8f9fa; }
  code { background: #f1f1f1; padding: 2px 4px; border-radius: 3px; }
  pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  .badge { display: inline-block; background: #1d4ed8; color: white; padding: 4px 12px; border-radius: 999px; font-size: 0.85rem; font-weight: 600; margin-bottom: 16px; }
  hr { border: none; border-top: 1px solid #eee; margin: 24px 0; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;
  }
  
  // Generate spec sheet PDF
  const specHTML = markdownToHTML(path.join(salesDir, 'SPEC-SHEET-SIAK.md'));
  const specHTMLPath = path.join(salesDir, 'spec-sheet-temp.html');
  fs.writeFileSync(specHTMLPath, specHTML);
  
  await generatePDF(
    specHTMLPath,
    path.join(salesDir, 'SPEC-SHEET-SIAK.pdf')
  );
  
  // Generate quotation PDF
  const quoteMD = fs.readFileSync(path.join(salesDir, 'QUOTATION-SIAK-TEMPLATE.md'), 'utf-8');
  const quoteHTML = `
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SIAK - Quotation</title>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.6; color: #111; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { color: #1d4ed8; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px; }
  h2 { color: #1e3a8a; margin-top: 30px; }
  h3 { color: #3b82f6; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #1d4ed8; color: white; }
  tr:nth-child(even) td { background: #f8f9fa; }
  .badge { display: inline-block; background: #1d4ed8; color: white; padding: 4px 12px; border-radius: 999px; font-size: 0.85rem; font-weight: 600; margin-bottom: 16px; }
  .meta-table { margin-bottom: 30px; }
  .meta-table td:first-child { font-weight: 600; width: 200px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${marked.parse(quoteMD, { breaks: true })}
</body>
</html>`;
  
  const quoteHTMLPath = path.join(salesDir, 'quotation-temp.html');
  fs.writeFileSync(quoteHTMLPath, quoteHTML);
  
  await generatePDF(
    quoteHTMLPath,
    path.join(salesDir, 'QUOTATION-SIAK-TEMPLATE.pdf')
  );
  
  // Cleanup temp files
  fs.unlinkSync(specHTMLPath);
  fs.unlinkSync(quoteHTMLPath);
  
  console.log('All PDFs generated successfully!');
}

main().catch(console.error);