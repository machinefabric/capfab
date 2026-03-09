// Netlify Function: User Media Specs
// GET /api/user/media - List media specs registered by current user

const {
    verifyRequestAuth,
    getUsersStore,
    getMediaStore,
    jsonResponse,
    handlePreflight
} = require('./lib/identity-auth.js');

exports.handler = async (event) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return handlePreflight();
    }

    // Only allow GET
    if (event.httpMethod !== 'GET') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    // Verify authentication
    const authResult = await verifyRequestAuth(event);
    if (authResult.error) {
        return jsonResponse(authResult.status, { error: authResult.error });
    }

    const user = authResult.user;

    try {
        const usersStore = getUsersStore();
        const mediaStore = getMediaStore();

        // Get user profile to get username
        const profileData = await usersStore.get(user.id);
        if (!profileData) {
            return jsonResponse(200, {
                media_specs: [],
                count: 0,
                message: 'No profile found'
            });
        }

        const profile = JSON.parse(profileData);
        if (!profile.username) {
            return jsonResponse(200, {
                media_specs: [],
                count: 0,
                message: 'Username not set'
            });
        }

        // List all media specs and filter by username
        const blobs = await mediaStore.list();
        const userSpecs = [];

        for (const { key } of blobs.blobs) {
            const data = await mediaStore.get(key);
            if (data) {
                try {
                    const spec = JSON.parse(data);
                    if (spec.registered_by?.username === profile.username) {
                        userSpecs.push(spec);
                    }
                } catch (e) {
                    console.warn(`Invalid JSON for media spec ${key}:`, e);
                }
            }
        }

        // Sort by registration date (most recent first)
        userSpecs.sort((a, b) => {
            const dateA = a.registered_by?.registered_at || '';
            const dateB = b.registered_by?.registered_at || '';
            return dateB.localeCompare(dateA);
        });

        return jsonResponse(200, {
            media_specs: userSpecs,
            count: userSpecs.length
        });
    } catch (error) {
        console.error('User media specs error:', error);
        return jsonResponse(500, {
            error: 'Internal server error',
            message: error.message
        });
    }
};
