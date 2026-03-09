// Netlify Function: Media URN Lookup
// Handles GET requests for media spec lookup by Media URN

const { getStore } = require('@netlify/blobs');

// Initialize the store
function getConfiguredStore() {
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
        // Extract Media URN from path
        const path = event.path;
        const mediaUrnMatch = path.match(/^\/media:(.+)$/);

        if (!mediaUrnMatch) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Invalid Media URN format. Must be in format /media:xxx'
                })
            };
        }

        const mediaUrnString = `media:${decodeURIComponent(mediaUrnMatch[1])}`;
        console.log('Looking up Media URN:', mediaUrnString);

        // Normalize the Media URN for lookup
        const normalizedMediaUrn = normalizeMediaUrn(mediaUrnString);
        console.log('Normalized Media URN:', normalizedMediaUrn);

        // Get the media specs store
        const store = getConfiguredStore();

        // Try to find the media spec using normalized URN
        const mediaSpec = await store.get(normalizedMediaUrn);

        if (!mediaSpec) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({
                    error: 'Media spec not found',
                    originalMediaUrn: mediaUrnString,
                    normalizedMediaUrn: normalizedMediaUrn
                })
            };
        }

        // Parse the stored JSON
        let parsedMediaSpec;
        try {
            parsedMediaSpec = JSON.parse(mediaSpec);
        } catch (parseError) {
            console.error('Error parsing stored media spec:', parseError);
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
            body: JSON.stringify(parsedMediaSpec)
        };

    } catch (error) {
        console.error('Media URN lookup error:', error);
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

// Import TaggedUrn for parsing
const { TaggedUrn } = require('tagged-urn');

// Helper function to normalize Media URN for consistent lookup
function normalizeMediaUrn(mediaUrnString) {
    try {
        // Parse using TaggedUrn and return canonical form
        const parsed = TaggedUrn.fromString(mediaUrnString);
        if (parsed.getPrefix() !== 'media') {
            throw new Error(`Invalid prefix: expected 'media', got '${parsed.getPrefix()}'`);
        }
        return parsed.toString();
    } catch (error) {
        console.warn(`Invalid Media URN format: ${mediaUrnString}`, error.message);
        throw new Error(`Failed to normalize Media URN: ${error.message}`);
    }
}
