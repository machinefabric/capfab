// Netlify Function: User Profile Management
// Handles GET (fetch profile) and POST (set username) for authenticated users

const {
    verifyRequestAuth,
    getUsersStore,
    getUsernamesStore,
    validateUsername,
    jsonResponse,
    handlePreflight
} = require('./lib/identity-auth.js');

exports.handler = async (event) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return handlePreflight();
    }

    // Verify authentication
    const authResult = await verifyRequestAuth(event);
    if (authResult.error) {
        return jsonResponse(authResult.status, { error: authResult.error });
    }

    const user = authResult.user;

    try {
        if (event.httpMethod === 'GET') {
            return await handleGetProfile(user);
        } else if (event.httpMethod === 'POST') {
            return await handleSetUsername(event, user);
        } else {
            return jsonResponse(405, { error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('User profile error:', error);
        return jsonResponse(500, {
            error: 'Internal server error',
            message: error.message
        });
    }
};

async function handleGetProfile(user) {
    const usersStore = getUsersStore();

    // Try to get existing profile
    const profileData = await usersStore.get(user.id);

    if (!profileData) {
        // User is authenticated but hasn't set up profile yet
        return jsonResponse(200, {
            id: user.id,
            email: user.email,
            username: null,
            needs_username: true,
            registered_caps: []
        });
    }

    const profile = JSON.parse(profileData);

    return jsonResponse(200, {
        id: profile.id,
        email: profile.email,
        username: profile.username,
        needs_username: false,
        registered_caps: profile.registered_caps || [],
        created_at: profile.created_at
    });
}

async function handleSetUsername(event, user) {
    const body = JSON.parse(event.body || '{}');
    const requestedUsername = body.username;

    // Validate username format
    const validation = validateUsername(requestedUsername);
    if (!validation.valid) {
        return jsonResponse(400, { error: validation.error });
    }

    const username = validation.username;
    const usernameLower = username.toLowerCase();

    const usersStore = getUsersStore();
    const usernamesStore = getUsernamesStore();

    // Check if user already has a username
    const existingProfileData = await usersStore.get(user.id);
    if (existingProfileData) {
        const existingProfile = JSON.parse(existingProfileData);
        if (existingProfile.username) {
            return jsonResponse(400, {
                error: 'Username already set',
                message: 'You have already chosen a username. Usernames cannot be changed.'
            });
        }
    }

    // Check if username is already taken
    const existingUsernameData = await usernamesStore.get(usernameLower);
    if (existingUsernameData) {
        return jsonResponse(409, {
            error: 'Username taken',
            message: 'This username is already in use. Please choose a different one.'
        });
    }

    const now = new Date().toISOString();

    // Create username reservation
    const usernameEntry = {
        user_id: user.id,
        username: username,
        email: user.email,
        created_at: now
    };

    // Create or update user profile
    const profile = {
        id: user.id,
        email: user.email,
        username: username,
        created_at: now,
        registered_caps: []
    };

    // Store both atomically (best effort - Netlify Blobs doesn't have transactions)
    // Store username reservation first to minimize race condition window
    await usernamesStore.set(usernameLower, JSON.stringify(usernameEntry));
    await usersStore.set(user.id, JSON.stringify(profile));

    console.log(`Username set: ${username} for user ${user.id}`);

    return jsonResponse(201, {
        message: 'Username set successfully',
        profile: {
            id: profile.id,
            email: profile.email,
            username: profile.username,
            needs_username: false,
            registered_caps: [],
            created_at: profile.created_at
        }
    });
}
