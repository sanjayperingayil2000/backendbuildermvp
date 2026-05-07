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
// GET /api/output-files
// Lists all saved output flow files
// Response: { flows: [{ id, name, savedAt, key }] }
// ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'outputfiles/',
    });

    const response = await s3Client.send(command);
    const files = (response.Contents || []).filter((obj) =>
      obj.Key.endsWith('.json')
    );

    const flows = files.map((obj) => ({
      key: obj.Key,
      id: obj.Key.replace('outputfiles/', '').replace('.json', ''),
      savedAt: obj.LastModified,
      size: obj.Size,
    }));

    res.json({ flows });
  } catch (error) {
    console.error('Error listing output files:', error);
    res.status(500).json({ error: 'Failed to list output files' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/output-files/:flowId
// Fetches one saved output flow by ID
// Response: the full saved JSON object
// ──────────────────────────────────────────────────────────────
router.get('/:flowId', async (req, res) => {
  const { flowId } = req.params;

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `outputfiles/${flowId}.json`,
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
// POST /api/output-files/:flowId
// Saves (or overwrites) an output flow
// Body: the full output JSON object
// Query: ?serviceName=DIDI (optional) to save to clients folder
// This is called from Next.js when the user clicks Save or Publish
// ──────────────────────────────────────────────────────────────
router.post('/:flowId', async (req, res) => {
  const { flowId } = req.params;
  const { serviceName } = req.query;
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
        ...(serviceName ? { serviceName } : {}),
        savedAt: new Date().toISOString(),
        savedBy: 'antigravity-ui',
      },
    };

    const key = serviceName 
      ? `clients/companion/${serviceName.toLowerCase()}/outputfiles/${flowId}.json`
      : `outputfiles/${flowId}.json`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(dataToSave, null, 2),
      ContentType: 'application/json',
    });

    await s3Client.send(command);

    res.json({
      success: true,
      flowId,
      key,
      savedAt: dataToSave._meta.savedAt,
    });
  } catch (error) {
    console.error(`Error saving flow ${flowId}:`, error);
    res.status(500).json({ error: 'Failed to save flow' });
  }
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/output-files/:flowId
// Deletes a saved output flow
// ──────────────────────────────────────────────────────────────
router.delete('/:flowId', async (req, res) => {
  const { flowId } = req.params;

  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `outputfiles/${flowId}.json`,
    });

    await s3Client.send(command);

    res.json({ success: true, flowId });
  } catch (error) {
    console.error(`Error deleting flow ${flowId}:`, error);
    res.status(500).json({ error: 'Failed to delete flow' });
  }
});

module.exports = router;