// Netlify Function: User Capability Registration
// Handles GET (list user's caps) and POST (register new cap) for authenticated users

const {
    verifyRequestAuth,
    getUsersStore,
    getCapsStore,
    getMediaStore,
    jsonResponse,
    handlePreflight
} = require('./lib/identity-auth.js');

const {
    validateCapability,
    formatCapUrn
} = require('./lib/cap-validator.js');

const {
    validateMediaUrnsExist,
    validateNoMediaSpecRedefinition
} = require('./lib/media-validator.js');

// Maximum capability JSON size (100KB)
const MAX_CAP_SIZE = 100 * 1024;

/**
 * Auto-register custom media specs from a capability
 * First-registrant wins - existing specs are not overwritten
 */
async function registerCustomMediaSpecs(mediaSpecs, username, capurn, mediaStore) {
    if (!mediaSpecs || !Array.isArray(mediaSpecs)) {
        return;
    }

    for (const specDef of mediaSpecs) {
        if (!specDef || !specDef.urn) continue;

        const normalizedUrn = specDef.urn.trim();

        // First-registrant wins - don't overwrite
        const existing = await mediaStore.get(normalizedUrn);
        if (existing) {
            continue;
        }

        const mediaSpecToStore = {
            urn: normalizedUrn,
            media_type: specDef.media_type,
            title: specDef.title,
            profile_uri: specDef.profile_uri,
            schema: specDef.schema,
            registered_by: {
                username: username,
                registered_at: new Date().toISOString(),
                from_capability: capurn
            }
        };

        await mediaStore.set(normalizedUrn, JSON.stringify(mediaSpecToStore));
    }
}

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
            return await handleListCapabilities(user);
        } else if (event.httpMethod === 'POST') {
            return await handleRegisterCapability(event, user);
        } else {
            return jsonResponse(405, { error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('User capabilities error:', error);
        return jsonResponse(500, {
            error: 'Internal server error',
            message: error.message
        });
    }
};

async function handleListCapabilities(user) {
    const usersStore = getUsersStore();
    const capsStore = getCapsStore();

    // Get user profile
    const profileData = await usersStore.get(user.id);
    if (!profileData) {
        return jsonResponse(200, {
            capabilities: [],
            message: 'No profile found. Please set up your username first.'
        });
    }

    const profile = JSON.parse(profileData);
    const registeredCapUrns = profile.registered_caps || [];

    // Fetch full capability data for each registered cap
    const capabilities = [];
    for (const capUrn of registeredCapUrns) {
        const capData = await capsStore.get(capUrn);
        if (capData) {
            capabilities.push(JSON.parse(capData));
        }
    }

    return jsonResponse(200, {
        capabilities: capabilities,
        count: capabilities.length
    });
}

async function handleRegisterCapability(event, user) {
    // Check request size
    if (event.body && event.body.length > MAX_CAP_SIZE) {
        return jsonResponse(413, {
            error: 'Payload too large',
            message: `Capability JSON must be less than ${MAX_CAP_SIZE / 1024}KB`
        });
    }

    const usersStore = getUsersStore();
    const capsStore = getCapsStore();
    const mediaStore = getMediaStore();

    // Get user profile and verify username is set
    const profileData = await usersStore.get(user.id);
    if (!profileData) {
        return jsonResponse(403, {
            error: 'Profile required',
            message: 'Please set up your username before registering capabilities.'
        });
    }

    const profile = JSON.parse(profileData);
    if (!profile.username) {
        return jsonResponse(403, {
            error: 'Username required',
            message: 'Please set up your username before registering capabilities.'
        });
    }

    // Parse capability JSON
    let capability;
    try {
        capability = JSON.parse(event.body || '{}');
    } catch (e) {
        return jsonResponse(400, {
            error: 'Invalid JSON',
            message: 'Request body must be valid JSON'
        });
    }

    // Validate capability structure
    const validation = validateCapability(capability);
    if (!validation.valid) {
        return jsonResponse(400, {
            error: 'Validation failed',
            message: validation.error
        });
    }

    // XV5: Validate that inline media specs don't redefine existing registry specs
    if (capability.media_specs) {
        const xv5Validation = await validateNoMediaSpecRedefinition(capability.media_specs, mediaStore);
        if (!xv5Validation.valid) {
            return jsonResponse(400, {
                error: 'XV5: Inline media spec redefinition',
                message: xv5Validation.error,
                redefines: xv5Validation.redefines
            });
        }
    }

    // Validate all referenced media URNs exist in the media store
    const mediaValidation = await validateMediaUrnsExist(capability, mediaStore);
    if (!mediaValidation.valid) {
        return jsonResponse(400, {
            error: 'Media URN validation failed',
            message: mediaValidation.error,
            missing_media_urns: mediaValidation.missing
        });
    }

    // Format CAPURN to canonical form
    let capurnString;
    try {
        capurnString = formatCapUrn(capability.urn);
    } catch (e) {
        return jsonResponse(400, {
            error: 'Invalid URN',
            message: e.message
        });
    }

    // Check if capability already exists
    const existingCap = await capsStore.get(capurnString);
    if (existingCap) {
        const existing = JSON.parse(existingCap);
        const registeredBy = existing.registered_by?.username || 'unknown';
        return jsonResponse(409, {
            error: 'Capability already exists',
            message: `This CAPURN has already been registered by @${registeredBy}. Capabilities cannot be overwritten.`,
            capurn: capurnString
        });
    }

    // Add registration metadata
    const now = new Date().toISOString();
    const capWithMetadata = {
        ...capability,
        registered_by: {
            username: profile.username,
            registered_at: now
        }
    };

    // Store the capability
    await capsStore.set(capurnString, JSON.stringify(capWithMetadata));

    // Update user's registered_caps list (avoid duplicates)
    const existingCaps = profile.registered_caps || [];
    if (!existingCaps.includes(capurnString)) {
        profile.registered_caps = [...existingCaps, capurnString];
        await usersStore.set(user.id, JSON.stringify(profile));
    }

    // Auto-register any custom media specs defined in this capability
    if (capability.media_specs) {
        await registerCustomMediaSpecs(
            capability.media_specs,
            profile.username,
            capurnString,
            mediaStore
        );
    }

    return jsonResponse(201, {
        message: 'Capability registered successfully',
        capurn: capurnString,
        capability: capWithMetadata
    });
}
