const mongoose = require('mongoose');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/MONGODB_URL=([^\n\r]+)/);
let uri = match[1].trim();

mongoose.connect(uri).then(async () => {
  const Cnp = (await import('./src/modules/cnp/cnp.model.js')).default;
  const Lead = (await import('./src/modules/lead/lead.model.js')).default;
  
  const cnp = await Cnp.findOne({ title: /Kuldeep chauhan/i });
  if (cnp) {
    console.log('Found CNP! Setting department to migraine');
    cnp.department = 'migraine';
    await cnp.save();
    
    if (cnp.lead) {
      const lead = await Lead.findById(cnp.lead);
      if (lead) {
        lead.department = 'migraine';
        await lead.save();
        console.log('Set lead department to migraine');
      }
    }
  } else {
    console.log('CNP not found');
  }
  
  // Also set for "hospital mei h"
  const cnp2 = await Cnp.findOne({ title: /hospital mei/i });
  if (cnp2) {
    cnp2.department = 'piles';
    await cnp2.save();
    if(cnp2.lead) {
      const lead2 = await Lead.findById(cnp2.lead);
      if(lead2) {
        lead2.department = 'piles';
        await lead2.save();
      }
    }
    console.log('Set hospital mei to piles');
  }

  mongoose.disconnect();
}).catch(console.error);
