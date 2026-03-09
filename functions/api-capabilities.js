// Netlify Function: CAPDAG Capabilities API
// Handles GET /api/capabilities - lists all capabilities

const { getStore } = require('@netlify/blobs');

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

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Get the capabilities store
        const store = getConfiguredStore();
        
        // List all capabilities
        const capabilityList = await store.list();
        
        const capabilities = [];
        
        // Fetch each capability's data
        for (const { key } of capabilityList.blobs) {
            try {
                const capabilityData = await store.get(key);
                if (capabilityData) {
                    const parsed = JSON.parse(capabilityData);
                    capabilities.push(parsed);
                }
            } catch (parseError) {
                console.warn(`Skipping invalid capability data for key: ${key}`, parseError);
                // Continue processing other capabilities
            }
        }

        // Include standard protocol-level capabilities (identity, discard)
        const { getStandardCaps } = require('./lib/standard-caps.js');
        const storedUrns = new Set(capabilities.map(c => formatCapUrn(c.urn)));
        for (const sc of getStandardCaps()) {
            if (!storedUrns.has(sc.urn)) {
                capabilities.push(sc);
            }
        }

        // Sort capabilities by CAPURN string for consistent ordering
        capabilities.sort((a, b) => {
            const urnA = formatCapUrn(a.urn);
            const urnB = formatCapUrn(b.urn);
            return urnA.localeCompare(urnB);
        });

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(capabilities)
        };

    } catch (error) {
        console.error('List capabilities error:', error);
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

// Import the strict Cap URN implementation
const { CapUrn } = require('capdag');

// Helper function to format CapUrn as string using strict implementation
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
            // Convert tags object to CapUrn and get canonical string
            const capUrnObj = CapUrn.fromTags(capUrn.tags);
            return capUrnObj.toString();
        } catch (error) {
            console.warn(`Invalid Cap URN tags:`, capUrn.tags, error);
            return 'cap:unknown';
        }
    }
    
    return 'cap:unknown';
}