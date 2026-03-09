// Identity Authentication Module
// Verifies access tokens and provides common utilities

const { verifyRequestAuth } = require('./auth.js');
const { getStore } = require('@netlify/blobs');

// Get configured Netlify Blobs store
function getConfiguredStore(storeName) {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_TOKEN;

    if (!siteID) {
        throw new Error('NETLIFY_SITE_ID environment variable is required');
    }
    if (!token) {
        throw new Error('NETLIFY_TOKEN environment variable is required');
    }

    return getStore({
        name: storeName,
        siteID: siteID,
        token: token
    });
}

// Get the users store
function getUsersStore() {
    return getConfiguredStore('users');
}

// Get the usernames store (for uniqueness check)
function getUsernamesStore() {
    return getConfiguredStore('usernames');
}

// Get the caps store
function getCapsStore() {
    return getConfiguredStore('caps');
}

// Get the media store
function getMediaStore() {
    return getConfiguredStore('media');
}

// Username validation
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
const RESERVED_USERNAMES = [
    'admin', 'api', 'capdag', 'root', 'system', 'user', 'browse',
    'dashboard', 'login', 'logout', 'signup', 'register', 'settings',
    'profile', 'account', 'help', 'support', 'about', 'contact',
    'terms', 'privacy', 'docs', 'schema', 'cap', 'caps', 'standard'
];

function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required' };
    }

    const trimmed = username.trim();

    if (trimmed.length < 3) {
        return { valid: false, error: 'Username must be at least 3 characters' };
    }

    if (trimmed.length > 20) {
        return { valid: false, error: 'Username must be at most 20 characters' };
    }

    if (!USERNAME_REGEX.test(trimmed)) {
        return { valid: false, error: 'Username must start with a letter and contain only letters, numbers, and underscores' };
    }

    if (RESERVED_USERNAMES.includes(trimmed.toLowerCase())) {
        return { valid: false, error: 'This username is reserved' };
    }

    return { valid: true, username: trimmed };
}

// Standard CORS headers
function getCorsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
}

// Create JSON response
function jsonResponse(statusCode, body, headers = {}) {
    return {
        statusCode,
        headers: {
            ...getCorsHeaders(),
            'Content-Type': 'application/json',
            ...headers
        },
        body: JSON.stringify(body)
    };
}

// Handle OPTIONS preflight
function handlePreflight() {
    return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: ''
    };
}

module.exports = {
    verifyRequestAuth,
    getConfiguredStore,
    getUsersStore,
    getUsernamesStore,
    getCapsStore,
    getMediaStore,
    validateUsername,
    getCorsHeaders,
    jsonResponse,
    handlePreflight,
    USERNAME_REGEX,
    RESERVED_USERNAMES
};
