// Netlify Function: Admin Authentication
// Handles POST /api/admin/auth

const jwt = require('jsonwebtoken');

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
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

    try {
        const body = JSON.parse(event.body || '{}');
        const { key } = body;

        if (!key) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Admin key is required' })
            };
        }

        // Check against environment variable
        const adminKey = process.env.CAPDAG_ADMIN_KEY || process.env.ADMIN_PASSWORD;
        if (!adminKey) {
            console.error('CAPDAG_ADMIN_KEY or ADMIN_PASSWORD not set');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }

        if (key !== adminKey) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Invalid admin key' })
            };
        }

        // Generate JWT token
        const secret = process.env.JWT_SECRET || 'capdag-secret-key';
        const token = jwt.sign(
            { 
                admin: true,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
            },
            secret
        );

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                token: token,
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            })
        };

    } catch (error) {
        console.error('Admin auth error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Authentication failed',
                message: error.message
            })
        };
    }
};