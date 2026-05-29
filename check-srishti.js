import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const uri = process.env.MONGODB_URL;

async function test() {
  try {
    await mongoose.connect(uri);
    console.log("Connected to DB");
    
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const Verification = mongoose.model('Verification', new mongoose.Schema({}, { strict: false }));
    const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
    const StaffTarget = mongoose.model('StaffTarget', new mongoose.Schema({}, { strict: false }));
    
    const srishti = await User.findOne({ name: { $regex: /srishti/i } });
    const uid = srishti._id;
    
    const target = new Date();
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const startOfDay = new Date(Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - IST_OFFSET);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
    
    const staffLeadsPeriod = await Lead.find({ 
      assignedTo: uid, 
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      isDeleted: { $ne: true } 
    }).distinct('_id');
    
    const verifUpdatedToday = await Verification.countDocuments({ assignedTo: uid, updatedAt: { $gte: startOfDay, $lte: endOfDay }, status: 'verified' });
    const verifLeadPeriod = await Verification.countDocuments({ lead: { $in: staffLeadsPeriod }, status: 'verified' });
    
    const verifiedCount = await Verification.countDocuments({ 
        $or: [
          { assignedTo: uid, updatedAt: { $gte: startOfDay, $lte: endOfDay } },
          { lead: { $in: staffLeadsPeriod } }
        ], 
        status: 'verified'
    });
    
    const targetDoc = await StaffTarget.find({ user: uid, date: { $gte: target.toISOString().slice(0, 10), $lte: target.toISOString().slice(0, 10) } }).lean();
    const todayTarget = Array.isArray(targetDoc) ? targetDoc.reduce((sum, t) => sum + (t.target || 0), 0) : 0;
    
    const assigned = await Verification.countDocuments({ 
        $or: [
          { assignedTo: uid, createdAt: { $gte: startOfDay, $lte: endOfDay } },
          { lead: { $in: staffLeadsPeriod } }
        ], 
        isDeleted: { $ne: true } 
    });

    console.log(`Srishti ID: ${uid}`);
    console.log(`Leads Added: ${staffLeadsPeriod.length}`);
    console.log(`Verif Updated Today: ${verifUpdatedToday}`);
    console.log(`Verif Lead Period: ${verifLeadPeriod}`);
    console.log(`Total verifiedCount: ${verifiedCount}`);
    console.log(`Today Target: ${todayTarget}`);
    console.log(`Assigned Verifs: ${assigned}`);
    
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
test();
