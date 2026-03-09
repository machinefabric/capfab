// Netlify Function: CAPDAG Capability Lookup
// Handles GET requests for capability lookup by CAPURN

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
        // Extract CAPURN from path
        const path = event.path;
        const capurnMatch = path.match(/^\/cap:(.+)$/);
        
        if (!capurnMatch) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Invalid CAPURN format. Must be in format /cap:key=value;key=value' 
                })
            };
        }

        const capurnString = `cap:${decodeURIComponent(capurnMatch[1])}`;
        console.log('Looking up CAPURN:', capurnString);

        // Normalize the CAPURN for lookup
        const normalizedCapurn = normalizeCapUrn(capurnString);
        console.log('Normalized CAPURN:', normalizedCapurn);

        // Check standard protocol-level capabilities first (identity, discard)
        const { getStandardCap } = require('./lib/standard-caps.js');
        const standardCap = getStandardCap(normalizedCapurn);
        if (standardCap) {
            return {
                statusCode: 200,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(standardCap)
            };
        }

        // Get the capabilities store
        const store = getConfiguredStore();
        
        // Try to find the capability using normalized CAPURN
        const capability = await store.get(normalizedCapurn);
        
        if (!capability) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ 
                    error: 'Capability not found',
                    originalCapurn: capurnString,
                    normalizedCapurn: normalizedCapurn
                })
            };
        }

        // Parse the stored JSON
        let parsedCapability;
        try {
            parsedCapability = JSON.parse(capability);
        } catch (parseError) {
            console.error('Error parsing stored capability:', parseError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Internal server error - invalid stored data'
                })
            };
        }

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(parsedCapability)
        };

    } catch (error) {
        console.error('CAPDAG lookup error:', error);
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
const { CapUrn, CapUrnError } = require('capdag');

// Helper function to normalize CapUrn for consistent lookup using strict implementation
function normalizeCapUrn(capurnString) {
    try {
        return CapUrn.fromString(capurnString).toString();
    } catch (error) {
        if (error instanceof CapUrnError) {
            console.warn(`Invalid Cap URN format: ${capurnString}`, error.message);
            throw error; // Re-throw to let caller handle
        }
        console.error(`Unexpected error normalizing Cap URN: ${capurnString}`, error);
        throw new Error(`Failed to normalize Cap URN: ${error.message}`);
    }
}