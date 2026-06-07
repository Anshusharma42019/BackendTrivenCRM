const mongoose = require('mongoose');

async function checkLeads() {
  await mongoose.connect('mongodb+srv://AnshuSharma:Anshu92530@cluster0.r2qszni.mongodb.net/Triven-Data?appName=Cluster0');
  
  const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
  const User = mongoose.model('User', new mongoose.Schema({ name: String }));
  
  const leads = await Lead.find({ problem: { $regex: 'Interakt Message' } })
    .sort({ createdAt: -1 })
    .limit(10);
    
  console.log('--- RECENT WHATSAPP LEADS ---');
  for (const lead of leads) {
    let assignedName = 'UNASSIGNED (null)';
    if (lead.assignedTo) {
      const user = await User.findById(lead.assignedTo);
      assignedName = user ? user.name : `Unknown User (${lead.assignedTo})`;
    }
    
    console.log(`Phone: ${lead.phone} | Dept: ${lead.department || 'None'} | Assigned To: ${assignedName} | Date: ${lead.createdAt.toISOString()}`);
  }
  
  process.exit(0);
}

checkLeads().catch(console.error);
