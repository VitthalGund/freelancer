
import mongoose from 'mongoose';
import User from './models/User';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Please define the MONGODB_URI environment variable inside .env.local');
  process.exit(1);
}

async function checkUsers() {
  try {
    await mongoose.connect(MONGODB_URI as string);
    console.log('Connected to MongoDB');

    const users = await User.find({});
    console.log(`Found ${users.length} users`);

    users.forEach(user => {
      console.log(`User: ${user.name} (${user.email})`);
      console.log(`  ID: ${user.userId}`);
      console.log(`  Credibility Score: ${user.credibilityScore}`);
      console.log(`  Skills: ${user.skills?.length || 0}`);
      console.log(`  Experience: ${user.experienceYears}`);
      console.log(`  Bank Connected: ${user.isBankConnected}`);
      console.log('---');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkUsers();
