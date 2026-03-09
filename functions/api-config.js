// Netlify Function: Public Configuration Endpoint
// Returns authentication configuration for frontend initialization

const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY;

exports.handler = async () => {
    if (!TURNSTILE_SITE_KEY) {
        console.error('TURNSTILE_SITE_KEY environment variable is not set');
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Server configuration error',
                message: 'TURNSTILE_SITE_KEY is not configured'
            })
        };
    }

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            authType: 'native',
            authEndpoint: '/api/auth',
            turnstileSiteKey: TURNSTILE_SITE_KEY
        })
    };
};
