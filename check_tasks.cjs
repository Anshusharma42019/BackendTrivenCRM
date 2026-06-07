const mongoose = require('mongoose');

async function check() {
  await mongoose.connect('mongodb+srv://AnshuSharma:Anshu92530@cluster0.r2qszni.mongodb.net/Triven-Data?appName=Cluster0');
  const db = mongoose.connection.db;
  
  const tasks = await db.collection('tasks').find({title: /vikashmithi/i}).toArray();
  console.log(JSON.stringify(tasks, null, 2));

  process.exit(0);
}

check().catch(console.error);
