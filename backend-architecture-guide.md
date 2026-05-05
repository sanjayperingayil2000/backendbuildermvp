# Backend Architecture — Complete Setup Guide
### From Zero to Running Stack (Beginner Friendly)

---

## What You Are Building

```
Config App  ──────────────────────────────────────────────────►  S3 / LocalStack
                                                                        │
                                                                        │
Next.js + React Flow  ◄──────────  Node.js API  ◄───────────────────────
        │                               ▲
        │  (save output)                │
        └───────────────────────────────┘
```

Two types of files live in S3:

| Folder | What it contains | Who writes it | Who reads it |
|--------|-----------------|---------------|--------------|
| `design-files/` | Raw page JSON files (one per page) grouped by service | Config app | Node.js API → Next.js |
| `output-flows/` | Final merged output JSON after React Flow session | Node.js API (on save) | Next.js listing page |

---

## S3 Folder Structure (Your Exact Model)

```
my-bucket/
│
├── output-flows/
│   ├── didi_output.json
│   └── corresponsalias_output.json
│
└── design-files/
    ├── didi/
    │   ├── account_page.json
    │   ├── amount_page.json
    │   └── service_selection_page.json
    │
    └── corresponsalias/
        ├── account_page.json
        └── confirm_page.json
```

---

## Step 1 — Install Prerequisites

Install these on your machine in order.

### 1.1 Install Node.js
Go to https://nodejs.org and download the LTS version (v20+).
Verify:
```bash
node --version   # should print v20.x.x
npm --version    # should print 10.x.x
```

### 1.2 Install Docker Desktop
Go to https://www.docker.com/products/docker-desktop
Download for your OS (Mac / Windows / Linux), install, and open it.
Verify:
```bash
docker --version         # Docker version 24.x.x
docker compose version   # Docker Compose version v2.x.x
```

### 1.3 Install AWS CLI (needed to talk to LocalStack)
Go to https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
Install for your OS.
Verify:
```bash
aws --version   # aws-cli/2.x.x
```

---

## Step 2 — Project Folder Structure

Create this exact folder structure on your machine:

```
antigravity-backend/
│
├── docker-compose.yml          ← runs LocalStack + Node.js together
├── .env                        ← environment variables
│
├── api/                        ← your Node.js server lives here
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── index.js            ← server entry point
│   │   ├── config/
│   │   │   └── s3.js           ← S3 client setup
│   │   ├── routes/
│   │   │   ├── designFiles.js  ← GET design files routes
│   │   │   └── outputFlows.js  ← GET + POST output flows routes
│   │   └── scripts/
│   │       └── seedBucket.js   ← creates bucket + uploads test files
│
└── seed-data/                  ← test JSON files to upload on startup
    ├── design-files/
    │   ├── didi/
    │   │   ├── account_page.json
    │   │   └── amount_page.json
    │   └── corresponsalias/
    │       └── account_page.json
    └── output-flows/
        └── (empty for now)
```

Run these commands to create it:
```bash
mkdir antigravity-backend
cd antigravity-backend
mkdir -p api/src/config api/src/routes api/src/scripts
mkdir -p seed-data/design-files/didi
mkdir -p seed-data/design-files/corresponsalias
mkdir -p seed-data/output-flows
```

---

## Step 3 — Environment Variables

Create `.env` in the root `antigravity-backend/` folder:

```env
# .env

# LocalStack
LOCALSTACK_ENDPOINT=http://localstack:4566
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# S3
S3_BUCKET_NAME=antigravity-bucket

# API
PORT=3001
NODE_ENV=development
```

> NOTE: The AWS key/secret values can literally be "test" for LocalStack — it doesn't validate them.

---

## Step 4 — docker-compose.yml

Create `docker-compose.yml` in the root folder:

```yaml
# docker-compose.yml

version: '3.8'

services:

  # ── LocalStack: fake AWS S3 running on your machine ──
  localstack:
    image: localstack/localstack:3.0
    container_name: localstack
    ports:
      - "4566:4566"       # all LocalStack services run on this port
    environment:
      - SERVICES=s3       # we only need S3 for now
      - DEBUG=1
      - AWS_DEFAULT_REGION=us-east-1
    volumes:
      - localstack-data:/var/lib/localstack   # persist data between restarts
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4566/_localstack/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── Node.js API server ──
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: antigravity-api
    ports:
      - "3001:3001"
    environment:
      - LOCALSTACK_ENDPOINT=http://localstack:4566
      - AWS_REGION=us-east-1
      - AWS_ACCESS_KEY_ID=test
      - AWS_SECRET_ACCESS_KEY=test
      - S3_BUCKET_NAME=antigravity-bucket
      - PORT=3001
      - NODE_ENV=development
    volumes:
      - ./api/src:/app/src          # live reload — changes reflect instantly
      - ./seed-data:/app/seed-data  # seed files accessible inside container
    depends_on:
      localstack:
        condition: service_healthy  # wait for LocalStack to be ready
    command: npm run dev

volumes:
  localstack-data:
```

---

## Step 5 — Node.js API: package.json and Dockerfile

### 5.1 api/package.json

```json
{
  "name": "antigravity-api",
  "version": "1.0.0",
  "description": "Backend API for Antigravity React Flow app",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "seed": "node src/scripts/seedBucket.js"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/lib-storage": "^3.600.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```

### 5.2 api/Dockerfile

```dockerfile
# api/Dockerfile

FROM node:20-alpine

WORKDIR /app

# Copy package files first (Docker caches this layer)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the source code
COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
```

---

## Step 6 — S3 Client Configuration

### api/src/config/s3.js

```javascript
// api/src/config/s3.js
// This file sets up the S3 client.
// In development it points to LocalStack.
// In production you remove the endpoint and it points to real AWS.

const { S3Client } = require('@aws-sdk/client-s3');

const isLocal = process.env.NODE_ENV === 'development';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',

  // Only set custom endpoint in development (LocalStack)
  ...(isLocal && {
    endpoint: process.env.LOCALSTACK_ENDPOINT,
    forcePathStyle: true,   // REQUIRED for LocalStack — do not remove
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    },
  }),
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'antigravity-bucket';

module.exports = { s3Client, BUCKET_NAME };
```

---

## Step 7 — Seed Script (Creates Bucket + Uploads Test Files)

This script runs once on startup to create the bucket and upload your test files.

### api/src/scripts/seedBucket.js

```javascript
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
  const designFilesPath = path.join(seedDataPath, 'clients');

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
```

---

## Step 8 — API Routes

### 8.1 Design Files Routes — api/src/routes/designFiles.js

```javascript
// api/src/routes/designFiles.js
// Routes for reading the raw design files (the pages your Config app uploads)

const express = require('express');
const router = express.Router();
const {
  ListObjectsV2Command,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { s3Client, BUCKET_NAME } = require('../config/s3');

// ── Helper: convert S3 stream to string ──
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// ──────────────────────────────────────────────────────────────
// GET /api/design-files
// Lists all available services (top-level folders inside design-files/)
// Response: { services: ["didi", "corresponsalias"] }
// ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'design-files/',
      Delimiter: '/',   // only get immediate sub-folders
    });

    const response = await s3Client.send(command);

    // CommonPrefixes gives us the sub-folders
    const services = (response.CommonPrefixes || []).map((prefix) => {
      // "design-files/didi/" → "didi"
      return prefix.Prefix.replace('design-files/', '').replace('/', '');
    });

    res.json({ services });
  } catch (error) {
    console.error('Error listing services:', error);
    res.status(500).json({ error: 'Failed to list services' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/design-files/:serviceName
// Fetches ALL page JSON files for a given service and merges them
// This is what your React Flow canvas calls on load
// Response: { serviceName: "didi", pages: [...], rawFiles: {...} }
// ──────────────────────────────────────────────────────────────
router.get('/:serviceName', async (req, res) => {
  const { serviceName } = req.params;

  try {
    // Step 1: List all files in design-files/{serviceName}/
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: `design-files/${serviceName}/`,
    });

    const listResponse = await s3Client.send(listCommand);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return res.status(404).json({
        error: `No files found for service: ${serviceName}`,
      });
    }

    // Step 2: Fetch each file in parallel
    const filePromises = listResponse.Contents
      .filter((obj) => obj.Key.endsWith('.json'))
      .map(async (obj) => {
        const getCommand = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key,
        });
        const response = await s3Client.send(getCommand);
        const content = await streamToString(response.Body);
        const fileName = obj.Key.split('/').pop(); // "account_page.json"
        return {
          key: obj.Key,
          fileName,
          data: JSON.parse(content),
        };
      });

    const files = await Promise.all(filePromises);

    // Step 3: Merge all page files into one structure for React Flow
    // Each file represents one page — combine them into a pages array
    const pages = files.map((file) => file.data);

    res.json({
      serviceName,
      pageCount: pages.length,
      pages,
      rawFiles: files.reduce((acc, file) => {
        acc[file.fileName] = file.data;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error(`Error fetching design files for ${serviceName}:`, error);
    res.status(500).json({ error: 'Failed to fetch design files' });
  }
});

module.exports = router;
```

### 8.2 Output Flows Routes — api/src/routes/outputFlows.js

```javascript
// api/src/routes/outputFlows.js
// Routes for saving and reading the output JSON files
// (the result of a React Flow session — what shows on the listing page)

const express = require('express');
const router = express.Router();
const {
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { s3Client, BUCKET_NAME } = require('../config/s3');

// ── Helper: convert S3 stream to string ──
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// ──────────────────────────────────────────────────────────────
// GET /api/output-flows
// Lists all saved output flow files
// Response: { flows: [{ id, name, savedAt, key }] }
// ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'output-flows/',
    });

    const response = await s3Client.send(command);
    const files = (response.Contents || []).filter((obj) =>
      obj.Key.endsWith('.json')
    );

    const flows = files.map((obj) => ({
      key: obj.Key,
      id: obj.Key.replace('output-flows/', '').replace('.json', ''),
      savedAt: obj.LastModified,
      size: obj.Size,
    }));

    res.json({ flows });
  } catch (error) {
    console.error('Error listing output flows:', error);
    res.status(500).json({ error: 'Failed to list output flows' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/output-flows/:flowId
// Fetches one saved output flow by ID
// Response: the full saved JSON object
// ──────────────────────────────────────────────────────────────
router.get('/:flowId', async (req, res) => {
  const { flowId } = req.params;

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `output-flows/${flowId}.json`,
    });

    const response = await s3Client.send(command);
    const content = await streamToString(response.Body);

    res.json(JSON.parse(content));
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return res.status(404).json({ error: `Flow not found: ${flowId}` });
    }
    console.error(`Error fetching flow ${flowId}:`, error);
    res.status(500).json({ error: 'Failed to fetch flow' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/output-flows/:flowId
// Saves (or overwrites) an output flow
// Body: the full output JSON object
// This is called from Next.js when the user clicks Save
// ──────────────────────────────────────────────────────────────
router.post('/:flowId', async (req, res) => {
  const { flowId } = req.params;
  const flowData = req.body;

  if (!flowData || typeof flowData !== 'object') {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }

  try {
    // Add metadata before saving
    const dataToSave = {
      ...flowData,
      _meta: {
        flowId,
        savedAt: new Date().toISOString(),
        savedBy: 'antigravity-ui',
      },
    };

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `output-flows/${flowId}.json`,
      Body: JSON.stringify(dataToSave, null, 2),
      ContentType: 'application/json',
    });

    await s3Client.send(command);

    res.json({
      success: true,
      flowId,
      key: `output-flows/${flowId}.json`,
      savedAt: dataToSave._meta.savedAt,
    });
  } catch (error) {
    console.error(`Error saving flow ${flowId}:`, error);
    res.status(500).json({ error: 'Failed to save flow' });
  }
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/output-flows/:flowId
// Deletes a saved output flow
// ──────────────────────────────────────────────────────────────
router.delete('/:flowId', async (req, res) => {
  const { flowId } = req.params;

  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `output-flows/${flowId}.json`,
    });

    await s3Client.send(command);

    res.json({ success: true, flowId });
  } catch (error) {
    console.error(`Error deleting flow ${flowId}:`, error);
    res.status(500).json({ error: 'Failed to delete flow' });
  }
});

module.exports = router;
```

---

## Step 9 — Server Entry Point

### api/src/index.js

```javascript
// api/src/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { execSync } = require('child_process');

const designFilesRouter = require('./routes/designFiles');
const outputFlowsRouter = require('./routes/outputFlows');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──
app.use(cors({
  origin: [
    'http://localhost:3000',   // Next.js dev server
    'http://localhost:3002',   // alternate Next.js port
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));   // allow large JSON payloads

// ── Health check ──
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

// ── Routes ──
app.use('/api/design-files', designFilesRouter);
app.use('/api/output-flows', outputFlowsRouter);

// ── 404 handler ──
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server + seed bucket ──
app.listen(PORT, async () => {
  console.log(`\n🚀  API server running on http://localhost:${PORT}`);
  console.log(`📋  Health check: http://localhost:${PORT}/health\n`);

  // Run seed script on startup in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🌱  Running bucket seed...');
    try {
      require('./scripts/seedBucket');
    } catch (err) {
      console.warn('⚠️  Seed failed (bucket may already exist):', err.message);
    }
  }
});
```

---

## Step 10 — Seed Data (Test JSON Files)

### seed-data/design-files/didi/account_page.json

```json
{
  "id": "account_page",
  "uuid": "10d5e43b-92bd-4f8a-a866-10fab5563509",
  "name": "AccountPage",
  "route": "/account",
  "section": "Account Page",
  "widgets": [
    {
      "uuid": "d742b7be-7e36-406f-aa2f-567046f55275",
      "id": "btn_siguiente",
      "type": "PrimaryButton",
      "props": {
        "label": "Siguiente",
        "buttonState": "disabled"
      }
    }
  ]
}
```

### seed-data/design-files/didi/amount_page.json

```json
{
  "id": "amount_page",
  "uuid": "530ebaec-efc0-4fb8-8dda-c0fc3862c9e6",
  "name": "AmountPage",
  "route": "/amount",
  "section": "Amount Page",
  "widgets": [
    {
      "uuid": "d742b7be-7e36-406f-aa2f-567046f55276",
      "id": "btn_pay",
      "type": "PrimaryButton",
      "props": {
        "label": "Pagar",
        "buttonState": "disabled"
      }
    }
  ]
}
```

### seed-data/design-files/corresponsalias/account_page.json

```json
{
  "id": "account_page",
  "uuid": "aa11bb22-ccdd-4f8a-a866-10fab5563509",
  "name": "AccountPage",
  "route": "/account",
  "section": "Account Page",
  "widgets": [
    {
      "uuid": "ff998877-7e36-406f-aa2f-567046f55275",
      "id": "btn_next",
      "type": "PrimaryButton",
      "props": {
        "label": "Next",
        "buttonState": "idle"
      }
    }
  ]
}
```

---

## Step 11 — How to Call the API from Next.js

Create this file in your Next.js project:

### (Next.js) lib/api.js

```javascript
// lib/api.js — API client for your Next.js app

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ── Fetch all available services (folder names in design-files/) ──
export async function fetchServices() {
  const res = await fetch(`${API_BASE}/api/design-files`);
  if (!res.ok) throw new Error('Failed to fetch services');
  return res.json();  // { services: ["didi", "corresponsalias"] }
}

// ── Fetch all page files for one service ──
// This is what you call when loading a project into React Flow
export async function fetchDesignFiles(serviceName) {
  const res = await fetch(`${API_BASE}/api/design-files/${serviceName}`);
  if (!res.ok) throw new Error(`Failed to fetch files for ${serviceName}`);
  return res.json();
  // Returns: { serviceName, pageCount, pages: [...], rawFiles: {...} }
}

// ── List all saved output flows (for the project listing page) ──
export async function fetchOutputFlows() {
  const res = await fetch(`${API_BASE}/api/output-flows`);
  if (!res.ok) throw new Error('Failed to fetch output flows');
  return res.json();  // { flows: [{ id, key, savedAt, size }] }
}

// ── Fetch one saved output flow ──
export async function fetchOutputFlow(flowId) {
  const res = await fetch(`${API_BASE}/api/output-flows/${flowId}`);
  if (!res.ok) throw new Error(`Flow not found: ${flowId}`);
  return res.json();
}

// ── Save the output of a React Flow session to S3 ──
// Call this when user clicks Save on the canvas
export async function saveOutputFlow(flowId, outputData) {
  const res = await fetch(`${API_BASE}/api/output-flows/${flowId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(outputData),
  });
  if (!res.ok) throw new Error('Failed to save flow');
  return res.json();  // { success: true, flowId, savedAt }
}

// ── Delete an output flow ──
export async function deleteOutputFlow(flowId) {
  const res = await fetch(`${API_BASE}/api/output-flows/${flowId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete flow');
  return res.json();
}
```

---

## Step 12 — Running Everything

### 12.1 First time setup

```bash
# 1. Go to your project root
cd antigravity-backend

# 2. Install Node.js dependencies
cd api && npm install && cd ..

# 3. Start everything with Docker Compose
docker compose up --build
```

You will see logs like:
```
localstack   | Ready.
api          | 🚀  API server running on http://localhost:3001
api          | 🌱  Running bucket seed...
api          |   ✓ Created bucket: antigravity-bucket
api          |   ✓ Uploaded: design-files/didi/account_page.json
api          |   ✓ Uploaded: design-files/didi/amount_page.json
api          |   ✓ Uploaded: design-files/corresponsalias/account_page.json
api          | ✅  Seed complete!
```

### 12.2 Verify it works — open your browser or use curl

```bash
# Check server health
curl http://localhost:3001/health

# List all services
curl http://localhost:3001/api/design-files

# Fetch didi's design files
curl http://localhost:3001/api/design-files/didi

# List saved output flows (empty at first)
curl http://localhost:3001/api/output-flows

# Save a test output flow
curl -X POST http://localhost:3001/api/output-flows/didi_output \
  -H "Content-Type: application/json" \
  -d '{"schema":{"version":"1.0"},"pages":[]}'

# Verify it was saved
curl http://localhost:3001/api/output-flows/didi_output
```

### 12.3 Daily development commands

```bash
# Start the stack
docker compose up

# Stop the stack
docker compose down

# Restart only the API (after code changes if hot reload isn't working)
docker compose restart api

# View live logs
docker compose logs -f api

# Wipe everything and start fresh (including S3 data)
docker compose down -v && docker compose up --build
```

---

## Step 13 — Next.js Environment Variable

Add this to your Next.js project's `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## Step 14 — What to Build Next (Recommended Order)

| Step | What | Why |
|------|------|-----|
| ✅ Done | LocalStack + Node.js + S3 routes | Foundation |
| Next | Wire `fetchDesignFiles()` to your import screen | Load real files into React Flow |
| Next | Wire `saveOutputFlow()` to your Save button | Persist sessions to S3 |
| Next | Wire `fetchOutputFlows()` to your listing page | Show saved projects from S3 |
| Later | Replace LocalStack endpoint with real AWS S3 | Production deployment |
| Later | Add Kubernetes deployment YAML files | Scale in production |
| Later | Add authentication (JWT) to the API routes | Secure the API |

---

## Quick Reference — All API Endpoints

| Method | Endpoint | What it does |
|--------|----------|--------------|
| GET | `/health` | Check if server is running |
| GET | `/api/design-files` | List all service names |
| GET | `/api/design-files/:serviceName` | Get all page files for a service |
| GET | `/api/output-flows` | List all saved output flows |
| GET | `/api/output-flows/:flowId` | Get one saved output flow |
| POST | `/api/output-flows/:flowId` | Save/overwrite an output flow |
| DELETE | `/api/output-flows/:flowId` | Delete an output flow |
