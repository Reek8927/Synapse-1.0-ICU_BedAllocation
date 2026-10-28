import '../config/env.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

async function main() {
  const { MONGODB_URI, PLATFORM_ADMIN_NAME, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD } = process.env;
  if (!MONGODB_URI) throw new Error('MONGODB_URI is required');
  if (!PLATFORM_ADMIN_NAME || !PLATFORM_ADMIN_EMAIL) throw new Error('PLATFORM_ADMIN_NAME and PLATFORM_ADMIN_EMAIL are required');
  if (!PLATFORM_ADMIN_PASSWORD || PLATFORM_ADMIN_PASSWORD.length < 14 || PLATFORM_ADMIN_PASSWORD.length > 128 || PLATFORM_ADMIN_PASSWORD.startsWith('replace_with_')) {
    throw new Error('PLATFORM_ADMIN_PASSWORD must be a private, non-placeholder password of 14 to 128 characters');
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const existingCount = await User.countDocuments();
  if (existingCount > 0) {
    throw new Error('The database already contains users. Initial platform-admin seeding is only allowed on an empty user collection.');
  }

  const passwordHash = await bcrypt.hash(PLATFORM_ADMIN_PASSWORD, 12);
  const user = await User.create({
    name: PLATFORM_ADMIN_NAME.trim(),
    email: PLATFORM_ADMIN_EMAIL.trim().toLowerCase(),
    passwordHash,
    role: 'platform_admin',
    tenantId: null
  });
  console.log(`Created initial platform administrator: ${user.email}`);
  console.log('Next: sign in without a hospital workspace and create the first hospital tenant.');
}

main()
  .catch((error) => {
    console.error(`Platform-admin seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
