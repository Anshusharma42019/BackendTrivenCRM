import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/triven_crm';

async function test() {
  await mongoose.connect(uri);
  console.log("Connected to DB");
  
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const StaffTarget = mongoose.model('StaffTarget', new mongoose.Schema({}, { strict: false }));
  
  const users = await User.find({ role: 'sales' });
  for (let u of users) {
    const target = await StaffTarget.findOne({ user: u._id, date: new Date().toISOString().slice(0, 10) });
    console.log(`User: ${u.name}, Target: ${target ? target.target : 'None'}`);
  }
  
  process.exit(0);
}
test();
