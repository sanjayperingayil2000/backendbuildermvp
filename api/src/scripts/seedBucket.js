// api/src/scripts/seedBucket.js

const {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { s3Client, BUCKET_NAME } = require('../config/s3');

// ── Helper: upload a single file to S3 ──
async function uploadFile(localPath, s3Key) {
  const fileContent = fs.readFileSync(localPath, 'utf-8');
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: 'application/json',
    })
  );
  console.log(`  ✓ Uploaded: ${s3Key}`);
}

// ── Helper: recursively upload all files in a folder ──
async function uploadFolder(localFolderPath, s3Prefix) {
  const entries = fs.readdirSync(localFolderPath, { withFileTypes: true });

  for (const entry of entries) {
    const localEntryPath = path.join(localFolderPath, entry.name);
    const s3Key = `${s3Prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      await uploadFolder(localEntryPath, s3Key);
    } else if (entry.name.endsWith('.json')) {
      await uploadFile(localEntryPath, s3Key);
    }
  }
}

// ── Main seed function ──
async function seed() {
  console.log('\n🪣  Starting bucket seed...\n');

  // 1. Create bucket if it doesn't exist
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`  ℹ️  Bucket "${BUCKET_NAME}" already exists`);
  } catch {
    await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`  ✓ Created bucket: ${BUCKET_NAME}`);
  }

  // 2. Upload design files
  const seedDataPath = path.join(__dirname, '../../seed-data');
  const clientsPath = path.join(seedDataPath, 'clients');

  if (fs.existsSync(clientsPath)) {
    console.log('\n  📁 Uploading client files...');
    await uploadFolder(clientsPath, 'clients');
  }

  console.log('\n✅  Seed complete!\n');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});