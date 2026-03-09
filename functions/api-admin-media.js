// Netlify Function: Admin Media Specs Management
// Handles POST, DELETE for media spec management
// Includes clear operation

const jwt = require('jsonwebtoken');
const { getStore } = require('@netlify/blobs');
const { TaggedUrn } = require('tagged-urn');

// Initialize the media store
function getMediaStore() {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_TOKEN;

    if (!siteID || !token) {
        throw new Error('NETLIFY_SITE_ID and NETLIFY_TOKEN environment variables are required');
    }

    return getStore({
        name: 'media',
        siteID: siteID,
        token: token
    });
}

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Authenticate
    const authResult = authenticateAdmin(event);
    if (authResult.error) {
        return {
            statusCode: authResult.status,
            headers,
            body: JSON.stringify({ error: authResult.error })
        };
    }

    try {
        // Check for operations in path
        const path = event.path;

        if (event.httpMethod === 'POST') {
            if (path.endsWith('/clear')) {
                return await handleClearAll(event, headers);
            } else if (path.endsWith('/bulk')) {
                return await handleBulkCreateMediaSpecs(event, headers);
            } else {
                return await handleCreateMediaSpec(event, headers);
            }
        } else if (event.httpMethod === 'DELETE') {
            return await handleDeleteMediaSpec(event, headers);
        } else {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }
    } catch (error) {
        console.error('Admin media error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};

function authenticateAdmin(event) {
    const authHeader = event.headers.authorization || event.headers.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: 'Missing or invalid authorization header', status: 401 };
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    try {
        const secret = process.env.JWT_SECRET || 'capdag-secret-key';
        const payload = jwt.verify(token, secret);

        if (!payload.admin) {
            return { error: 'Invalid token', status: 401 };
        }

        return { success: true, payload };
    } catch (error) {
        console.error('Token verification failed:', error);
        return { error: 'Invalid or expired token', status: 401 };
    }
}

// Helper to retry Netlify Blobs operations with exponential backoff
async function retryBlobOperation(operation, maxRetries = 3) {
    for (let retry = 0; retry < maxRetries; retry++) {
        try {
            return await operation();
        } catch (err) {
            const errStr = String(err?.message || err);
            const isRateLimited = errStr.includes('401') || errStr.includes('429') ||
                                   errStr.includes('internal error') || errStr.includes('rate') ||
                                   errStr.includes('too many') || errStr.includes('throttl');
            console.log(`Blob operation failed (attempt ${retry + 1}/${maxRetries}): ${errStr.substring(0, 100)}`);
            if (isRateLimited && retry < maxRetries - 1) {
                const backoffMs = Math.pow(2, retry) * 1000 + Math.random() * 1000;
                console.log(`Retrying in ${Math.round(backoffMs)}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            } else {
                throw err;
            }
        }
    }
}

async function handleBulkCreateMediaSpecs(event, headers) {
    const body = JSON.parse(event.body || '{}');
    const specs = body.specs;
    // Optional delay between items to avoid rate limiting (in ms)
    const itemDelayMs = parseInt(body.item_delay_ms || '50', 10);

    if (!Array.isArray(specs) || specs.length === 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'specs array is required' }) };
    }

    const store = getMediaStore();
    const results = { created: [], conflicts: [], errors: [] };

    for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        try {
            const validation = validateMediaSpec(spec);
            if (!validation.valid) {
                results.errors.push({ urn: spec && spec.urn, error: validation.error });
                continue;
            }
            const normalizedUrn = normalizeMediaUrn(spec.urn);
            const existing = await retryBlobOperation(() => store.get(normalizedUrn));
            if (existing) {
                results.conflicts.push(normalizedUrn);
                continue;
            }
            const mediaSpecToStore = {
                urn: normalizedUrn,
                media_type: spec.media_type,
                title: spec.title,
                profile_uri: spec.profile_uri || null,
                schema: spec.schema || null,
                description: spec.description || null,
                validation: spec.validation || null,
                metadata: spec.metadata || null,
                created_at: new Date().toISOString()
            };
            await retryBlobOperation(() => store.set(normalizedUrn, JSON.stringify(mediaSpecToStore)));
            results.created.push(normalizedUrn);

            // Small delay between items to avoid rate limiting
            if (itemDelayMs > 0 && i < specs.length - 1) {
                await new Promise(resolve => setTimeout(resolve, itemDelayMs));
            }
        } catch (error) {
            results.errors.push({ urn: spec && spec.urn, error: error.message });
        }
    }

    return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: 'Bulk media spec import completed',
            created_count: results.created.length,
            conflict_count: results.conflicts.length,
            error_count: results.errors.length,
            results
        })
    };
}

// Normalize a media URN for consistent storage
function normalizeMediaUrn(mediaUrn) {
    try {
        const parsed = TaggedUrn.fromString(mediaUrn);
        if (parsed.getPrefix() !== 'media') {
            throw new Error(`Invalid prefix: expected 'media', got '${parsed.getPrefix()}'`);
        }
        return parsed.toString();
    } catch (error) {
        throw new Error(`Failed to normalize Media URN: ${error.message}`);
    }
}

// Validate a media spec definition
function validateMediaSpec(body) {
    if (!body.urn) {
        return { valid: false, error: 'Missing required field: urn' };
    }

    if (!body.urn.startsWith('media:')) {
        return { valid: false, error: 'URN must start with "media:"' };
    }

    if (!body.media_type) {
        return { valid: false, error: 'Missing required field: media_type' };
    }

    if (!body.title) {
        return { valid: false, error: 'Missing required field: title' };
    }

    // Validate media_type format (should contain '/')
    if (!body.media_type.includes('/')) {
        return { valid: false, error: 'media_type must be a valid MIME type (e.g., "text/plain")' };
    }

    return { valid: true };
}

async function handleCreateMediaSpec(event, headers) {
    const body = JSON.parse(event.body || '{}');

    // Validate required fields
    const validation = validateMediaSpec(body);
    if (!validation.valid) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: validation.error })
        };
    }

    // Normalize the URN
    let normalizedUrn;
    try {
        normalizedUrn = normalizeMediaUrn(body.urn);
    } catch (error) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }

    // Get store
    const store = getMediaStore();

    // Check if media spec already exists
    const existing = await store.get(normalizedUrn);
    if (existing) {
        return {
            statusCode: 409,
            headers,
            body: JSON.stringify({
                error: 'Media spec already exists',
                urn: normalizedUrn
            })
        };
    }

    // Build media spec to store
    const mediaSpecToStore = {
        urn: normalizedUrn,
        media_type: body.media_type,
        title: body.title,
        profile_uri: body.profile_uri || null,
        schema: body.schema || null,
        description: body.description || null,
        validation: body.validation || null,
        metadata: body.metadata || null,
        created_at: new Date().toISOString()
    };

    // Store the media spec
    await store.set(normalizedUrn, JSON.stringify(mediaSpecToStore));

    console.log('Created media spec:', normalizedUrn);

    return {
        statusCode: 201,
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: 'Media spec created successfully',
            urn: normalizedUrn,
            media_spec: mediaSpecToStore
        })
    };
}

async function handleDeleteMediaSpec(event, headers) {
    // Extract Media URN from path
    const pathParts = event.path.split('/');
    const urnEncoded = pathParts[pathParts.length - 1];

    if (!urnEncoded) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Media URN is required in path' })
        };
    }

    const urnString = decodeURIComponent(urnEncoded);

    if (!urnString.startsWith('media:')) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid Media URN format' })
        };
    }

    // Normalize the URN
    let normalizedUrn;
    try {
        normalizedUrn = normalizeMediaUrn(urnString);
    } catch (error) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }

    // Get store
    const store = getMediaStore();

    // Check if media spec exists
    const existing = await store.get(normalizedUrn);
    if (!existing) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                error: 'Media spec not found',
                urn: normalizedUrn
            })
        };
    }

    // Delete the media spec
    await store.delete(normalizedUrn);

    console.log('Deleted media spec:', normalizedUrn);

    return {
        statusCode: 200,
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: 'Media spec deleted successfully',
            urn: normalizedUrn
        })
    };
}

async function handleClearAll(event, headers) {
    const store = getMediaStore();

    // List all items in the store
    const { blobs } = await store.list();

    let deletedCount = 0;
    let errorCount = 0;

    for (const blob of blobs) {
        try {
            await store.delete(blob.key);
            deletedCount++;
        } catch (error) {
            console.error(`Failed to delete media spec ${blob.key}:`, error);
            errorCount++;
        }
    }

    console.log(`Cleared ${deletedCount} media specs, ${errorCount} errors`);

    return {
        statusCode: 200,
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: 'Media specs cleared',
            deleted_count: deletedCount,
            error_count: errorCount
        })
    };
}
