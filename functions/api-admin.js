// Netlify Function: Admin API
// Handles administrative operations like data wipe

const { getStore } = require('@netlify/blobs');

const ADMIN_KEY = process.env.CAPDAG_ADMIN_KEY || process.env.ADMIN_PASSWORD;
const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;

if (!ADMIN_KEY) {
    throw new Error('CAPDAG_ADMIN_KEY or ADMIN_PASSWORD environment variable is required');
}
if (!NETLIFY_SITE_ID) {
    throw new Error('NETLIFY_SITE_ID environment variable is required');
}
if (!NETLIFY_TOKEN) {
    throw new Error('NETLIFY_TOKEN environment variable is required');
}

function getConfiguredStore(storeName) {
    return getStore({
        name: storeName,
        siteID: NETLIFY_SITE_ID,
        token: NETLIFY_TOKEN
    });
}

function jsonResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    };
}

function verifyAdminAuth(event) {
    const authHeader = event.headers.authorization || event.headers.Authorization;

    if (!authHeader) {
        return { error: 'Missing authorization header', status: 401 };
    }

    if (!authHeader.startsWith('Bearer ')) {
        return { error: 'Invalid authorization format', status: 401 };
    }

    const token = authHeader.substring(7);

    if (token !== ADMIN_KEY) {
        return { error: 'Invalid admin key', status: 403 };
    }

    return { success: true };
}

async function wipeStore(storeName) {
    const store = getConfiguredStore(storeName);
    const items = await store.list();
    let count = 0;

    for await (const item of items.blobs) {
        await store.delete(item.key);
        count++;
    }

    return count;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    // Verify admin authentication
    const authResult = verifyAdminAuth(event);
    if (authResult.error) {
        return jsonResponse(authResult.status, { error: authResult.error });
    }

    // Parse action from path
    const path = event.path
        .replace(/^\/\.netlify\/functions\/api-admin\/?/, '')
        .replace(/^\/api\/admin\/?/, '');

    try {
        switch (path) {
            case 'wipe-all':
                return await handleWipeAll(event);
            default:
                return jsonResponse(404, { error: 'Unknown admin action' });
        }
    } catch (error) {
        console.error('Admin error:', error);
        return jsonResponse(500, {
            error: 'Internal server error',
            message: error.message
        });
    }
};

async function handleWipeAll(event) {
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return jsonResponse(400, { error: 'Invalid JSON' });
    }

    // Require explicit confirmation
    if (body.confirm !== 'DELETE_ALL_DATA') {
        return jsonResponse(400, {
            error: 'Confirmation required',
            message: 'Set confirm to "DELETE_ALL_DATA" to proceed'
        });
    }

    console.log('ADMIN: Starting full data wipe...');

    const stores = [
        'credentials',
        'users',
        'usernames',
        'caps',
        'refresh_tokens',
        'verification_tokens',
        'password_reset_tokens',
        'challenges'
    ];

    const results = {};
    let totalDeleted = 0;

    for (const storeName of stores) {
        try {
            const count = await wipeStore(storeName);
            results[storeName] = count;
            totalDeleted += count;
            console.log(`ADMIN: Wiped ${count} items from ${storeName}`);
        } catch (error) {
            console.error(`ADMIN: Error wiping ${storeName}:`, error.message);
            results[storeName] = { error: error.message };
        }
    }

    console.log(`ADMIN: Full data wipe complete. Total items deleted: ${totalDeleted}`);

    return jsonResponse(200, {
        message: 'All data wiped successfully',
        totalDeleted,
        stores: results
    });
}
