// Netlify Function: Reset Registry to Standard Capabilities
// Handles POST /api/admin/reset

const jwt = require('jsonwebtoken');
const { getStore } = require('@netlify/blobs');
const { CapUrn } = require('capdag');

// Initialize the store
function getConfiguredStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_TOKEN;
  
  if (!siteID || !token) {
    throw new Error('NETLIFY_SITE_ID and NETLIFY_TOKEN environment variables are required for rate limiting storage');
  }
  
  return getStore({
    name: 'caps',
    siteID: siteID,
    token: token
  });
}

// Standard capabilities will be loaded from the generated files

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
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
        console.log('Starting registry reset...');
        
        // Configure blob store with site context
        const store = getConfiguredStore();
        
        // Clear all existing capabilities
        const existingCapabilities = await store.list();
        let deletedCount = 0;
        
        for (const { key } of existingCapabilities.blobs) {
            try {
                await store.delete(key);
                deletedCount++;
                console.log(`Deleted capability: ${key}`);
            } catch (error) {
                console.warn(`Failed to delete capability ${key}:`, error.message);
            }
        }
        
        // Load standard capabilities from generated files
        let addedCount = 0;
        const addedCapabilities = [];
        
        try {
            const standardCapabilities = require('../standard/generated/all-capabilities.json');
            
            for (const capability of standardCapabilities) {
                const capurnString = formatCapUrn(capability.urn);
                
                try {
                    await store.set(capurnString, JSON.stringify(capability));
                    addedCount++;
                    addedCapabilities.push(capurnString);
                    console.log(`Added standard capability: ${capurnString}`);
                } catch (error) {
                    console.error(`Failed to add capability ${capurnString}:`, error.message);
                }
            }
        } catch (loadError) {
            console.error('Failed to load standard capabilities:', loadError.message);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Failed to load standard capabilities',
                    message: 'Make sure standard capabilities have been generated with load-standards.js'
                })
            };
        }
        
        console.log(`Registry reset complete: ${deletedCount} deleted, ${addedCount} added`);
        
        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Registry reset to standard capabilities successfully',
                deleted_count: deletedCount,
                added_count: addedCount,
                standard_capabilities: addedCapabilities
            })
        };
        
    } catch (error) {
        console.error('Registry reset error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Failed to reset registry',
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

// Helper function to format CapUrn as string
// Uses CapUrn class for proper quoted value handling
function formatCapUrn(capUrn) {
    if (typeof capUrn === 'string') {
        try {
            return CapUrn.fromString(capUrn).toString();
        } catch (error) {
            console.warn(`Invalid Cap URN string: ${capUrn}`, error);
            return 'cap:unknown';
        }
    }

    if (capUrn && capUrn.tags) {
        try {
            // Convert tags object to CapUrn and get canonical string with smart quoting
            const capUrnObj = CapUrn.fromTags(capUrn.tags);
            return capUrnObj.toString();
        } catch (error) {
            console.warn(`Invalid Cap URN tags:`, capUrn.tags, error);
            return 'cap:unknown';
        }
    }

    return 'cap:unknown';
}