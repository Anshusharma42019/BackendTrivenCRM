const mongoose = require('mongoose');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/MONGODB_URI=([^\n\r]+)/);
if (!match) {
  console.log('No MONGODB_URI found');
  process.exit(1);
}
let uri = match[1].trim();
if (uri.startsWith('"') && uri.endsWith('"')) uri = uri.slice(1, -1);
if (uri.startsWith("'") && uri.endsWith("'")) uri = uri.slice(1, -1);

mongoose.connect(uri).then(async () => {
  const Cnp = (await import('./src/modules/cnp/cnp.model.js')).default;
  const Lead = (await import('./src/modules/lead/lead.model.js')).default;
  
  const records = await Cnp.find().populate('lead', 'name phone department').limit(10).lean();
  console.log("=== First 10 CNP Records ===");
  records.forEach(r => {
    console.log(`Title/Name: ${r.title || r.lead?.name}`);
    console.log(`  -> item.department: ${r.department}`);
    console.log(`  -> lead.department: ${r.lead?.department}`);
  });
  
  mongoose.disconnect();
}).catch(console.error);
