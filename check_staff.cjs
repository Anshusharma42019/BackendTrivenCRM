const mongoose = require('mongoose');

async function check() {
  await mongoose.connect('mongodb+srv://AnshuSharma:Anshu92530@cluster0.r2qszni.mongodb.net/Triven-Data?appName=Cluster0');
  const db = mongoose.connection.db;
  
  const lead = await db.collection('leads').findOne({phone: "8053358989"});
  if(lead && lead.assignedTo) {
    const user = await db.collection('users').findOne({_id: lead.assignedTo});
    console.log("Assigned To Name:", user.name);
  } else {
    console.log("Lead or assignedTo not found");
  }
  process.exit(0);
}

check().catch(console.error);
