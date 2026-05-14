const { app } = require('@azure/functions');
const { TableClient, TableServiceClient } = require('@azure/data-tables');
const { DefaultAzureCredential } = require('@azure/identity');

const TABLE_NAME = 'PurviewFeedback';
const STORAGE_ACCOUNT_URL = process.env.TABLE_STORAGE_URL || 'https://purviewfeedbackstore.table.core.windows.net';
const MAX_BODY_SIZE = 10000; // 10KB max per submission

const credential = new DefaultAzureCredential();

function getTableClient() {
  return new TableClient(STORAGE_ACCOUNT_URL, TABLE_NAME, credential);
}

async function ensureTable() {
  const serviceClient = new TableServiceClient(STORAGE_ACCOUNT_URL, credential);
  try {
    await serviceClient.createTable(TABLE_NAME);
  } catch (e) {
    if (e.statusCode !== 409) throw e; // 409 = already exists
  }
}

function parseClientPrincipal(req) {
  const header = req.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf8');
    const principal = JSON.parse(decoded);
    return {
      userId: principal.userId || 'unknown',
      userDetails: principal.userDetails || 'anonymous',
      identityProvider: principal.identityProvider || 'unknown',
      userRoles: principal.userRoles || []
    };
  } catch {
    return null;
  }
}

function validateFeedback(body) {
  const errors = [];
  if (!body.category || typeof body.category !== 'string') errors.push('category is required');
  if (!body.description || typeof body.description !== 'string') errors.push('description is required');
  if (body.description && body.description.length > 5000) errors.push('description too long (max 5000 chars)');
  if (body.diagnosticName && body.diagnosticName.length > 200) errors.push('diagnosticName too long');
  if (body.severity && !['low', 'medium', 'high', 'critical'].includes(body.severity)) errors.push('invalid severity');
  return errors;
}

// GET /api/feedback - retrieve all feedback
app.http('getFeedback', {
  methods: ['GET'],
  authLevel: 'anonymous', // SWA handles auth via staticwebapp.config.json
  route: 'feedback',
  handler: async (req, context) => {
    const principal = parseClientPrincipal(req);
    if (!principal) {
      return { status: 401, jsonBody: { error: 'Authentication required' } };
    }

    try {
      const client = getTableClient();
      const entries = [];
      const queryOptions = { select: ['partitionKey', 'rowKey', 'category', 'description', 'diagnosticName', 'severity', 'area', 'submittedBy', 'submittedByEmail', 'createdAt', 'rating', 'testResult', 'notes'] };

      for await (const entity of client.listEntities(queryOptions)) {
        entries.push({
          id: entity.rowKey,
          category: entity.category,
          description: entity.description,
          diagnosticName: entity.diagnosticName || '',
          severity: entity.severity || 'medium',
          area: entity.area || '',
          submittedBy: entity.submittedBy || 'anonymous',
          submittedByEmail: entity.submittedByEmail || '',
          createdAt: entity.createdAt || '',
          rating: entity.rating || 0,
          testResult: entity.testResult || '',
          notes: entity.notes || ''
        });
      }

      // Sort by creation time, newest first
      entries.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      return { status: 200, jsonBody: entries };
    } catch (e) {
      context.log('Error fetching feedback:', e.message);
      return { status: 500, jsonBody: { error: 'Failed to retrieve feedback' } };
    }
  }
});

// POST /api/feedback - submit new feedback
app.http('postFeedback', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'feedback',
  handler: async (req, context) => {
    const principal = parseClientPrincipal(req);
    if (!principal) {
      return { status: 401, jsonBody: { error: 'Authentication required' } };
    }

    // Size check
    const bodyText = await req.text();
    if (bodyText.length > MAX_BODY_SIZE) {
      return { status: 413, jsonBody: { error: 'Request body too large' } };
    }

    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return { status: 400, jsonBody: { error: 'Invalid JSON' } };
    }

    const errors = validateFeedback(body);
    if (errors.length > 0) {
      return { status: 400, jsonBody: { error: 'Validation failed', details: errors } };
    }

    try {
      await ensureTable();
      const client = getTableClient();
      const now = new Date();
      const partitionKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const rowKey = crypto.randomUUID();

      const entity = {
        partitionKey,
        rowKey,
        category: body.category,
        description: body.description.substring(0, 5000),
        diagnosticName: (body.diagnosticName || '').substring(0, 200),
        severity: body.severity || 'medium',
        area: (body.area || '').substring(0, 100),
        submittedBy: principal.userDetails,
        submittedByEmail: principal.userDetails,
        createdAt: now.toISOString(),
        rating: body.rating || 0,
        testResult: (body.testResult || '').substring(0, 50),
        notes: (body.notes || '').substring(0, 2000)
      };

      await client.createEntity(entity);

      return {
        status: 201,
        jsonBody: { success: true, id: rowKey, createdAt: entity.createdAt }
      };
    } catch (e) {
      context.log('Error saving feedback:', e.message);
      return { status: 500, jsonBody: { error: 'Failed to save feedback' } };
    }
  }
});
