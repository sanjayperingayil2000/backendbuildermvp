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
      Prefix: 'clients/companion/',
      Delimiter: '/',   // only get immediate sub-folders
    });

    const response = await s3Client.send(command);

    // CommonPrefixes gives us the sub-folders
    const services = (response.CommonPrefixes || []).map((prefix) => {
      // "clients/companion/didi/" → "didi"
      return prefix.Prefix.replace('clients/companion/', '').replace('/', '');
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
    // Step 1: List all files in clients/companion/{serviceName}/inputfiles/
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: `clients/companion/${serviceName}/inputfiles/`,
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
    const pages = files.flatMap((file) => {
            // Check if this file uses the new Manifest format (has a 'pages' array at the root)
            if (file.data && Array.isArray(file.data.pages)) {
                return file.data.pages; // Extract all the pages from inside the manifest
            }
            // Fallback for the old format: the file itself is the page
            return [file.data]; 
        });
        
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