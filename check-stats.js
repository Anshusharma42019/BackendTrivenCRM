import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function test() {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const match = envContent.match(/^MONGODB_URL=(.+)$/m);
    if (!match) {
      console.error("No MONGODB_URL found");
      return;
    }
    const uri = match[1].trim();
    console.log("Connecting to", uri.substring(0, 30) + "...");
    
    await mongoose.connect(uri);
    console.log("Connected to DB");
    
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const StaffTarget = mongoose.model('StaffTarget', new mongoose.Schema({}, { strict: false }));
    const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false }));
    const Verification = mongoose.model('Verification', new mongoose.Schema({}, { strict: false }));
    
    const srishti = await User.findOne({ name: { $regex: /srishti/i } });
    if (!srishti) return console.log("Srishti not found");
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

    console.log(`--- SRISHTI ---`);
    console.log(`Leads Added: ${staffLeadsPeriod.length}`);
    console.log(`Total verifiedCount: ${verifiedCount}`);
    console.log(`Today Target: ${todayTarget}`);
    console.log(`Assigned Verifs: ${assigned}`);
    
    // Check Ayush
    const ayush = await User.findOne({ name: { $regex: /ayush/i } });
    if (ayush) {
        const auid = ayush._id;
        const aslp = await Lead.find({ assignedTo: auid, createdAt: { $gte: startOfDay, $lte: endOfDay }, isDeleted: { $ne: true } }).distinct('_id');
        const aVerifiedCount = await Verification.countDocuments({ 
            $or: [
              { assignedTo: auid, updatedAt: { $gte: startOfDay, $lte: endOfDay } },
              { lead: { $in: aslp } }
            ], 
            status: 'verified'
        });
        const aTargetDoc = await StaffTarget.find({ user: auid, date: { $gte: target.toISOString().slice(0, 10), $lte: target.toISOString().slice(0, 10) } }).lean();
        const aTodayTarget = Array.isArray(aTargetDoc) ? aTargetDoc.reduce((sum, t) => sum + (t.target || 0), 0) : 0;
        console.log(`--- AYUSH ---`);
        console.log(`Leads Added: ${aslp.length}`);
        console.log(`Total verifiedCount: ${aVerifiedCount}`);
        console.log(`Today Target: ${aTodayTarget}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
test();
