const fs = require('fs');

const be = JSON.parse(fs.readFileSync('./be-licenses-clean.json', 'utf8'));
const fe = JSON.parse(fs.readFileSync('./fe-licenses-clean.json', 'utf8'));

const all = { ...be, ...fe };
const licenses = {};

Object.entries(all).forEach(([k, v]) => {
  if (v.licenses && !k.startsWith('@siak/')) {
    licenses[v.licenses] = (licenses[v.licenses] || 0) + 1;
  }
});

console.log('LICENSE SUMMARY (production deps only):');
Object.entries(licenses).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(k + ': ' + v));

// Check for any non-permissive licenses
const permissive = ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'CC0-1.0', 'Unlicense', 'Zlib', 'MPL-2.0', 'BlueOak-1.0.0', 'MIT-0', '0BSD', '(MIT AND Zlib)', 'MIT*'];
const documentedExceptions = ['buffers@0.1.1', 'jszip@3.10.1', 'chainsaw@0.1.0', 'chownr@3.0.0', 'minipass@7.1.3', 'nodemailer@9.0.4', 'pako@1.0.11', 'png-js@1.1.0', 'tar@7.5.22', 'traverse@0.3.9', 'tslib@2.8.1', 'yallist@5.0.0'];
const nonPermissive = [];
Object.entries(all).forEach(([k, v]) => {
  if (v.licenses && !k.startsWith('@siak/') && !permissive.includes(v.licenses) && !documentedExceptions.includes(k)) {
    nonPermissive.push({ pkg: k, license: v.licenses });
  }
});

if (nonPermissive.length > 0) {
  console.log('\n⚠️  NON-PERMISSIVE LICENSES FOUND (undocumented):');
  nonPermissive.forEach(n => console.log('  ' + n.pkg + ': ' + n.license));
} else {
  console.log('\n✅ All production dependencies have permissive licenses (documented exceptions allowed).');
}