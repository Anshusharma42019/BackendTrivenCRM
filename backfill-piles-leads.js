import mongoose from 'mongoose';
import connectDB from './src/config/database.js';
import Lead from './src/modules/lead/lead.model.js';
import { syncPilesLead } from './src/modules/lead/lead.service.js';

const run = async () => {
  await connectDB();

  const pilesLeads = await Lead.find({ department: 'piles', isDeleted: { $ne: true } });
  for (const lead of pilesLeads) {
    await syncPilesLead(lead);
  }

  console.log(`Backfilled ${pilesLeads.length} piles leads into pilesleads collection.`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
