const mongoose = require('mongoose');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/MONGODB_URL=([^\n\r]+)/);
let uri = match[1].trim();

mongoose.connect(uri).then(async () => {
  const Cnp = (await import('./src/modules/cnp/cnp.model.js')).default;
  const Lead = (await import('./src/modules/lead/lead.model.js')).default;
  
  const records = await Cnp.find({ title: { $regex: 'Kuldeep chauhan', $options: 'i' } }).populate('lead', 'name phone department').lean();
  console.log('Found:', records.length);
  records.forEach(r => {
    console.log(`Title: ${r.title}`);
    console.log(`Item Dept: ${r.department}`);
    console.log(`Lead Dept: ${r.lead?.department}`);
  });
  
  mongoose.disconnect();
}).catch(console.error);
