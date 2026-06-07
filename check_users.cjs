const mongoose = require('mongoose');

async function check() {
  await mongoose.connect('mongodb+srv://AnshuSharma:Anshu92530@cluster0.r2qszni.mongodb.net/Triven-Data?appName=Cluster0');
  const db = mongoose.connection.db;
  
  const attendances = await db.collection('attendances').find({checkIn: {$ne: null}, checkOut: null, isDeleted: false}).toArray();
  const userIds = attendances.map(a => a.user);
  
  const users = await db.collection('users').find({_id: {$in: userIds}}).toArray();
  
  console.log("=== ACTIVE CHECKED-IN USERS ===");
  users.forEach(u => {
    console.log(`- ${u.name} | Role: ${u.role} | Departments: ${JSON.stringify(u.departments)}`);
  });
  
  console.log("\n=== ALL SALES USERS ===");
  const salesUsers = await db.collection('users').find({role: 'sales', isDeleted: false}).toArray();
  salesUsers.forEach(u => {
    console.log(`- ${u.name} | Departments: ${JSON.stringify(u.departments)}`);
  });

  process.exit(0);
}

check().catch(console.error);
