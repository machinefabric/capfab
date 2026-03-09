// Netlify Function: Admin Capabilities Management
// Handles POST, DELETE for capability management
// Includes bulk operations and user registration

const jwt = require('jsonwebtoken');
const { getStore } = require('@netlify/blobs');
const { validateCapability, formatCapUrn } = require('./lib/cap-validator.js');
const { validateMediaUrnsExist, extractMediaUrns, validateNoMediaSpecRedefinition } = require('./lib/media-validator.js');

// Helper to retry Netlify Blobs operations with exponential backoff
async function retryBlobOperation(operation, maxRetries = 3) {
    for (let retry = 0; retry < maxRetries; retry++) {
        try {
            return await operation();
        } catch (err) {
            const errStr = String(err?.message || err);
            const isRateLimited = errStr.includes('401') || errStr.includes('429') ||
                                   errStr.includes('internal error') || errStr.includes('rate') ||
                                   errStr.includes('too many') || errStr.includes('throttl');
            console.log(`Blob operation failed (attempt ${retry + 1}/${maxRetries}): ${errStr.substring(0, 100)}`);
            if (isRateLimited && retry < maxRetries - 1) {
                const backoffMs = Math.pow(2, retry) * 1000 + Math.random() * 1000;
                console.log(`Retrying in ${Math.round(backoffMs)}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            } else {
                throw err;
            }
        }
    }
}

/**
 * Validate media URNs against a pre-loaded cache (avoids rate limiting)
 * @param {Object} capability - The capability object
 * @param {Set<string>} cachedMediaUrns - Set of known media URN keys
 * @returns {{valid: boolean, missing?: string[], error?: string}}
 */
function validateMediaUrnsFromCache(capability, cachedMediaUrns) {
    const urns = extractMediaUrns(capability);

    if (urns.length === 0) {
        return { valid: false, error: 'Capability must reference at least one media URN (in/out tags)' };
    }

    const missing = [];
    for (const urn of urns) {
        if (!cachedMediaUrns.has(urn)) {
            missing.push(urn);
        }
    }

    if (missing.length > 0) {
        return {
            valid: false,
            missing,
            error: `Capability references unregistered media URNs: ${missing.join(', ')}`
        };
    }

    return { valid: true };
}

/**
 * XV5: Validate that inline media specs don't redefine existing registry specs (cache version)
 * @param {Array} mediaSpecs - The inline media_specs array from a capability
 * @param {Set<string>} cachedMediaUrns - Set of known media URN keys from registry
 * @returns {{valid: boolean, error?: string, redefines?: string[]}}
 */
function validateNoMediaSpecRedefinitionFromCache(mediaSpecs, cachedMediaUrns) {
    if (!mediaSpecs || !Array.isArray(mediaSpecs) || mediaSpecs.length === 0) {
        return { valid: true };
    }

    const redefines = [];

    for (const spec of mediaSpecs) {
        const mediaUrn = spec?.urn;
        if (!mediaUrn) continue;

        // Check against cached registry
        if (cachedMediaUrns.has(mediaUrn)) {
            redefines.push(mediaUrn);
        }
    }

    if (redefines.length > 0) {
        return {
            valid: false,
            error: `XV5: Inline media specs redefine existing registry specs: ${redefines.join(', ')}`,
            redefines
        };
    }

    return { valid: true };
}

// Initialize the caps store
function getCapsStore() {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_TOKEN;

    if (!siteID || !token) {
        throw new Error('NETLIFY_SITE_ID and NETLIFY_TOKEN environment variables are required');
    }

    return getStore({
        name: 'caps',
        siteID: siteID,
        token: token
    });
}

// Initialize the users store
function getUsersStore() {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_TOKEN;

    if (!siteID || !token) {
        throw new Error('NETLIFY_SITE_ID and NETLIFY_TOKEN environment variables are required');
    }

    return getStore({
        name: 'users',
        siteID: siteID,
        token: token
    });
}

// Initialize the usernames store
function getUsernamesStore() {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_TOKEN;

    if (!siteID || !token) {
        throw new Error('NETLIFY_SITE_ID and NETLIFY_TOKEN environment variables are required');
    }

    return getStore({
        name: 'usernames',
        siteID: siteID,
        token: token
    });
}

// Initialize the media store
function getMediaStore() {
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

/**
 * Auto-register custom media specs from a capability
 * First-registrant wins - existing specs are not overwritten
 */
async function registerCustomMediaSpecs(mediaSpecs, username, capurn, mediaStore, itemDelayMs = 50) {
    if (!mediaSpecs || !Array.isArray(mediaSpecs)) return;

    for (let i = 0; i < mediaSpecs.length; i++) {
        const specDef = mediaSpecs[i];
        if (!specDef || !specDef.urn) continue;

        const normalizedUrn = specDef.urn.trim();

        // First-registrant wins - don't overwrite
        const existing = await retryBlobOperation(() => mediaStore.get(normalizedUrn));
        if (existing) {
            continue;
        }

        const mediaSpecToStore = {
            urn: normalizedUrn,
            media_type: specDef.media_type,
            title: specDef.title,
            profile_uri: specDef.profile_uri,
            schema: specDef.schema,
            description: specDef.description || null,
            validation: specDef.validation || null,
            metadata: specDef.metadata || null,
            registered_by: {
                username: username || 'standard',
                registered_at: new Date().toISOString(),
                from_capability: capurn
            }
        };

        await retryBlobOperation(() => mediaStore.set(normalizedUrn, JSON.stringify(mediaSpecToStore)));

        // Small delay between items
        if (itemDelayMs > 0 && i < entries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, itemDelayMs));
        }
    }
}

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
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
        // Check for bulk operations in path
        const path = event.path;

        if (event.httpMethod === 'POST') {
            if (path.endsWith('/bulk-delete')) {
                return await handleBulkDelete(event, headers);
            } else if (path.endsWith('/clear')) {
                return await handleClearAll(event, headers);
            } else if (path.endsWith('/bulk')) {
                return await handleBulkCreateCapabilities(event, headers);
            } else {
                return await handleCreateCapability(event, headers);
            }
        } else if (event.httpMethod === 'DELETE') {
            return await handleDeleteCapability(event, headers);
        } else {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }
    } catch (error) {
        console.error('Admin capabilities error:', error);
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

async function handleBulkCreateCapabilities(event, headers) {
    const body = JSON.parse(event.body || '{}');
    const capabilities = body.capabilities;
    const registerAsUsername = body.register_as_username;
    // Optional delay between items to avoid rate limiting (in ms)
    const itemDelayMs = parseInt(body.item_delay_ms || '50', 10);

    if (!Array.isArray(capabilities) || capabilities.length === 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'capabilities array is required' }) };
    }

    // Stores
    const capsStore = getCapsStore();
    const mediaStore = getMediaStore();
    const usersStore = getUsersStore();
    const usernamesStore = getUsernamesStore();

    let profile = null;
    if (registerAsUsername) {
        const usernameLower = registerAsUsername.toLowerCase();
        const usernameData = await usernamesStore.get(usernameLower);
        if (!usernameData) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'Username not found', username: registerAsUsername }) };
        }
        const userId = JSON.parse(usernameData).user_id;
        const profileData = await usersStore.get(userId);
        if (!profileData) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'User profile not found', username: registerAsUsername }) };
        }
        profile = JSON.parse(profileData);
    }

    const results = { created: [], conflicts: [], errors: [], missing_media: {} };

    // Pre-load all media URNs once to avoid rate limiting from repeated lookups
    const { blobs: mediaBlobs } = await mediaStore.list();
    const cachedMediaUrns = new Set(mediaBlobs.map(b => b.key));

    for (let i = 0; i < capabilities.length; i++) {
        const cap = capabilities[i];
        try {
            const validation = validateCapability(cap);
            if (!validation.valid) {
                results.errors.push({ urn: cap && cap.urn, error: validation.error });
                continue;
            }

            // XV5: Validate that inline media specs don't redefine existing registry specs
            if (cap.media_specs) {
                const xv5Validation = validateNoMediaSpecRedefinitionFromCache(cap.media_specs, cachedMediaUrns);
                if (!xv5Validation.valid) {
                    results.errors.push({ urn: cap.urn, error: xv5Validation.error });
                    continue;
                }
            }

            // Validate all referenced media URNs exist (using cached set)
            const mediaValidation = validateMediaUrnsFromCache(cap, cachedMediaUrns);
            if (!mediaValidation.valid) {
                results.missing_media[cap.urn] = mediaValidation.missing;
                results.errors.push({ urn: cap.urn, error: 'Missing media URNs' });
                continue;
            }

            const capurnString = formatCapUrn(cap.urn);
            const existing = await retryBlobOperation(() => capsStore.get(capurnString));
            if (existing) {
                results.conflicts.push(capurnString);
                continue;
            }

            const capabilityToStore = { ...cap };
            delete capabilityToStore.register_as_username;

            if (profile) {
                capabilityToStore.registered_by = {
                    username: profile.username,
                    registered_at: new Date().toISOString()
                };
            }

            await retryBlobOperation(() => capsStore.set(capurnString, JSON.stringify(capabilityToStore)));

            if (profile) {
                const existingCaps = profile.registered_caps || [];
                if (!existingCaps.includes(capurnString)) {
                    profile.registered_caps = [...existingCaps, capurnString];
                    await retryBlobOperation(() => usersStore.set(profile.user_id, JSON.stringify(profile)));
                }
            }

            // Auto-register any custom media specs defined in this capability
            if (cap.media_specs) {
                await registerCustomMediaSpecs(cap.media_specs, profile ? profile.username : null, capurnString, mediaStore, itemDelayMs);
            }

            results.created.push(capurnString);

            // Small delay between items to avoid rate limiting
            if (itemDelayMs > 0 && i < capabilities.length - 1) {
                await new Promise(resolve => setTimeout(resolve, itemDelayMs));
            }
        } catch (error) {
            results.errors.push({ urn: cap && cap.urn, error: error.message });
        }
    }

    return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: 'Bulk capability import completed',
            created_count: results.created.length,
            conflict_count: results.conflicts.length,
            error_count: results.errors.length,
            missing_media: results.missing_media,
            results
        })
    };
}

async function handleCreateCapability(event, headers) {
    const body = JSON.parse(event.body || '{}');

    // Validate required fields
    const validation = validateCapability(body);
    if (!validation.valid) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: validation.error })
        };
    }

    // Get media store for subsequent validations
    const mediaStore = getMediaStore();

    // XV5: Validate that inline media specs don't redefine existing registry specs
    if (body.media_specs) {
        const xv5Validation = await validateNoMediaSpecRedefinition(body.media_specs, mediaStore);
        if (!xv5Validation.valid) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'XV5: Inline media spec redefinition',
                    message: xv5Validation.error,
                    redefines: xv5Validation.redefines
                })
            };
        }
    }

    // Validate all referenced media URNs exist in the media store
    const mediaValidation = await validateMediaUrnsExist(body, mediaStore);
    if (!mediaValidation.valid) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                error: 'Media URN validation failed',
                message: mediaValidation.error,
                missing_media_urns: mediaValidation.missing
            })
        };
    }

    const capUrn = body.urn;
    const capurnString = formatCapUrn(capUrn);

    // Get store and save capability
    const capsStore = getCapsStore();

    // Check if capability already exists
    const existing = await capsStore.get(capurnString);
    if (existing) {
        return {
            statusCode: 409,
            headers,
            body: JSON.stringify({
                error: 'Capability already exists',
                capurn: capurnString
            })
        };
    }

    // Check if we need to register under a username
    const registerAsUsername = body.register_as_username;
    let capabilityToStore = { ...body };
    delete capabilityToStore.register_as_username; // Don't store this field

    if (registerAsUsername) {
        // Look up the user by username
        const usernamesStore = getUsernamesStore();
        const usersStore = getUsersStore();

        const usernameLower = registerAsUsername.toLowerCase();
        const usernameData = await usernamesStore.get(usernameLower);

        if (!usernameData) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({
                    error: 'Username not found',
                    username: registerAsUsername
                })
            };
        }

        const usernameEntry = JSON.parse(usernameData);
        const userId = usernameEntry.user_id;

        // Get user profile
        const profileData = await usersStore.get(userId);
        if (!profileData) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({
                    error: 'User profile not found',
                    username: registerAsUsername
                })
            };
        }

        const profile = JSON.parse(profileData);
        const now = new Date().toISOString();

        // Add registration metadata (username only - user_id is internal)
        capabilityToStore.registered_by = {
            username: profile.username,
            registered_at: now
        };

        // Store the capability
        await capsStore.set(capurnString, JSON.stringify(capabilityToStore));

        // Update user's registered_caps list (avoid duplicates)
        const existingCaps = profile.registered_caps || [];
        if (!existingCaps.includes(capurnString)) {
            profile.registered_caps = [...existingCaps, capurnString];
            await usersStore.set(userId, JSON.stringify(profile));
        }

        // Auto-register any custom media specs defined in this capability
        if (body.media_specs) {
            await registerCustomMediaSpecs(body.media_specs, profile.username, capurnString, mediaStore);
        }

        return {
            statusCode: 201,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Capability created and registered to user',
                capurn: capurnString,
                registered_to: profile.username,
                capability: capabilityToStore
            })
        };
    }

    // Store the capability without user registration
    await capsStore.set(capurnString, JSON.stringify(capabilityToStore));

    // Auto-register any custom media specs defined in this capability
    if (body.media_specs) {
        await registerCustomMediaSpecs(body.media_specs, null, capurnString, mediaStore);
    }

    return {
        statusCode: 201,
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: 'Capability created successfully',
            capurn: capurnString,
            capability: capabilityToStore
        })
    };
}

async function handleDeleteCapability(event, headers) {
    // Extract CAPURN from path
    const pathParts = event.path.split('/');
    const capurnEncoded = pathParts[pathParts.length - 1];

    if (!capurnEncoded) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'CAPURN is required in path' })
        };
    }

    const capurnString = decodeURIComponent(capurnEncoded);

    if (!capurnString.startsWith('cap:')) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Invalid CAPURN format' })
        };
    }

    // Get store and delete capability
    const store = getCapsStore();

    // Check if capability exists
    const existing = await store.get(capurnString);
    if (!existing) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                error: 'Capability not found',
                capurn: capurnString
            })
        };
    }

    // Delete the capability
    await store.delete(capurnString);

    return {
        statusCode: 200,
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: 'Capability deleted successfully',
            capurn: capurnString
        })
    };
}

async function handleBulkDelete(event, headers) {
    const body = JSON.parse(event.body || '{}');
    const capurns = body.capurns;

    if (!Array.isArray(capurns) || capurns.length === 0) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'capurns array is required' })
        };
    }

    const store = getCapsStore();
    const results = {
        deleted: [],
        not_found: [],
        errors: []
    };

    for (const capurn of capurns) {
        try {
            if (!capurn.startsWith('cap:')) {
                results.errors.push({ capurn, error: 'Invalid CAPURN format' });
                continue;
            }

            const existing = await store.get(capurn);
            if (!existing) {
                results.not_found.push(capurn);
                continue;
            }

            await store.delete(capurn);
            results.deleted.push(capurn);
        } catch (error) {
            results.errors.push({ capurn, error: error.message });
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: 'Bulk delete completed',
            deleted_count: results.deleted.length,
            not_found_count: results.not_found.length,
            error_count: results.errors.length,
            results
        })
    };
}

async function handleClearAll(event, headers) {
    const capsStore = getCapsStore();
    const usersStore = getUsersStore();

    // List all capabilities
    const { blobs: capBlobs } = await capsStore.list();

    const deleted = [];
    const errors = [];

    // Delete all capabilities
    for (const blob of capBlobs) {
        try {
            await capsStore.delete(blob.key);
            deleted.push(blob.key);
        } catch (error) {
            errors.push({ key: blob.key, error: error.message });
        }
    }

    // Clear registered_caps from all user profiles
    const { blobs: userBlobs } = await usersStore.list();
    let usersCleared = 0;

    for (const userBlob of userBlobs) {
        try {
            const profileData = await usersStore.get(userBlob.key);
            if (profileData) {
                const profile = JSON.parse(profileData);
                if (profile.registered_caps && profile.registered_caps.length > 0) {
                    profile.registered_caps = [];
                    await usersStore.set(userBlob.key, JSON.stringify(profile));
                    usersCleared++;
                }
            }
        } catch (error) {
            console.error('Clear: error clearing user profile:', userBlob.key, error.message);
        }
    }

    return {
        statusCode: 200,
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: 'Clear all completed',
            deleted_count: deleted.length,
            users_cleared: usersCleared,
            error_count: errors.length,
            deleted,
            errors: errors.length > 0 ? errors : undefined
        })
    };
}
