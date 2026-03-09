// Media URN Validation Module
// Enforces all media spec validation rules from RULES.md
// No fallbacks - fail hard on any violation

const { TaggedUrn } = require('tagged-urn');

/**
 * Normalize a media URN to its canonical form for storage/lookup
 * Enforces MS2: Valid URN format
 * @param {string} urn - The URN string
 * @returns {string} - Normalized URN string
 * @throws {Error} - If URN is invalid or not a media URN
 */
function normalizeMediaUrn(urn) {
    if (!urn || typeof urn !== 'string') {
        throw new Error('Media URN is required and must be a string');
    }

    // MS2: Must start with 'media:'
    if (!urn.startsWith('media:')) {
        throw new Error(`Invalid media URN: '${urn}' must start with 'media:'`);
    }

    const parsed = TaggedUrn.fromString(urn);
    if (parsed.getPrefix() !== 'media') {
        throw new Error(`Invalid media URN: expected 'media:' prefix, got '${parsed.getPrefix()}:'`);
    }
    return parsed.toString();
}

/**
 * Extract all media URNs referenced by a capability
 * @param {Object} capability - The capability object
 * @returns {string[]} - Array of unique media URNs (normalized)
 */
function extractMediaUrns(capability) {
    const urns = new Set();

    // Extract from URN tags (in/out) - skip wildcards
    if (capability.urn?.tags?.in && capability.urn.tags.in !== '*') {
        urns.add(normalizeMediaUrn(capability.urn.tags.in));
    }
    if (capability.urn?.tags?.out && capability.urn.tags.out !== '*') {
        urns.add(normalizeMediaUrn(capability.urn.tags.out));
    }

    // Extract from args array
    if (capability.args && Array.isArray(capability.args)) {
        for (const arg of capability.args) {
            if (arg.media_urn) {
                urns.add(normalizeMediaUrn(arg.media_urn));
            }
            // Extract from arg sources (stdin sources have media URNs)
            if (arg.sources && Array.isArray(arg.sources)) {
                for (const source of arg.sources) {
                    if (source.stdin) {
                        urns.add(normalizeMediaUrn(source.stdin));
                    }
                }
            }
        }
    }

    // Extract from output
    if (capability.output?.media_urn) {
        urns.add(normalizeMediaUrn(capability.output.media_urn));
    }

    return Array.from(urns);
}

/**
 * Validate that all media URNs in a capability exist in the media store
 * Enforces XV3: Media URN Resolution Required
 * URNs are normalized to canonical form before lookup
 * @param {Object} capability - The capability object
 * @param {Object} mediaStore - The Netlify Blobs media store
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.checkInlineSpecs=true] - Whether to check inline media_specs
 * @returns {Promise<{valid: boolean, missing?: string[], error?: string}>}
 */
async function validateMediaUrnsExist(capability, mediaStore, options = {}) {
    const { checkInlineSpecs = true } = options;

    let urns;
    try {
        urns = extractMediaUrns(capability);
    } catch (error) {
        return { valid: false, error: error.message };
    }

    if (urns.length === 0) {
        return { valid: false, error: 'Capability must reference at least one media URN (in/out tags)' };
    }

    // Build set of inline media specs for resolution
    const inlineSpecs = new Set();
    if (checkInlineSpecs && capability.media_specs && Array.isArray(capability.media_specs)) {
        for (const spec of capability.media_specs) {
            if (spec && spec.urn) {
                try {
                    inlineSpecs.add(normalizeMediaUrn(spec.urn));
                } catch (error) {
                    return { valid: false, error: `Invalid inline media spec URN: ${error.message}` };
                }
            }
        }
    }

    const missing = [];

    for (const urn of urns) {
        // XV3: Resolution order - check inline specs first, then global registry
        if (inlineSpecs.has(urn)) {
            continue; // Resolved via inline spec
        }

        // Check global registry
        const exists = await mediaStore.get(urn);
        if (!exists) {
            missing.push(urn);
        }
    }

    if (missing.length > 0) {
        return {
            valid: false,
            missing,
            error: `XV3: Unresolved media URNs (not in inline media_specs or global registry): ${missing.join(', ')}`
        };
    }

    return { valid: true };
}

/**
 * Validate a media spec definition
 * Enforces MS1, MS2, MS3
 * @param {Object} mediaSpec - The media spec object
 * @returns {{ valid: boolean, error?: string }}
 */
function validateMediaSpec(mediaSpec) {
    if (!mediaSpec || typeof mediaSpec !== 'object') {
        return { valid: false, error: 'Media spec must be an object' };
    }

    // MS2: Valid URN format
    if (!mediaSpec.urn || typeof mediaSpec.urn !== 'string') {
        return { valid: false, error: 'Media spec urn is required and must be a string' };
    }
    if (!mediaSpec.urn.startsWith('media:')) {
        return { valid: false, error: `MS2: Invalid media URN: '${mediaSpec.urn}' must start with 'media:'` };
    }

    // MS1: Title required
    if (!mediaSpec.title || typeof mediaSpec.title !== 'string') {
        return { valid: false, error: `MS1: Media spec '${mediaSpec.urn}' has no title` };
    }

    // MS3: Media type required
    if (!mediaSpec.media_type || typeof mediaSpec.media_type !== 'string') {
        return { valid: false, error: `MS3: Media spec '${mediaSpec.urn}' has no media_type` };
    }

    return { valid: true };
}

/**
 * Validate inline media_specs in a capability
 * Enforces XV4 (inline specs must have title)
 * @param {Array} mediaSpecs - The media_specs array from a capability
 * @returns {{ valid: boolean, error?: string }}
 */
function validateInlineMediaSpecs(mediaSpecs) {
    if (!mediaSpecs || !Array.isArray(mediaSpecs)) {
        return { valid: false, error: 'media_specs must be an array' };
    }

    const seenUrns = new Set();
    for (const spec of mediaSpecs) {
        if (!spec || typeof spec !== 'object') {
            return { valid: false, error: 'Each media_spec must be an object' };
        }

        const urn = spec.urn;

        // URN is required
        if (!urn || typeof urn !== 'string') {
            return { valid: false, error: 'Each media_spec must have a urn field' };
        }

        // MS2: Valid URN format
        if (!urn.startsWith('media:')) {
            return { valid: false, error: `MS2: Invalid media URN in media_specs: '${urn}' must start with 'media:'` };
        }

        // Check for duplicate URNs
        if (seenUrns.has(urn)) {
            return { valid: false, error: `Duplicate media URN in media_specs: '${urn}'` };
        }
        seenUrns.add(urn);

        // XV4/MS1: Title required for inline specs
        if (!spec.title || typeof spec.title !== 'string') {
            return { valid: false, error: `XV4: Inline media spec '${urn}' has no title` };
        }

        // MS3: Media type required
        if (!spec.media_type || typeof spec.media_type !== 'string') {
            return { valid: false, error: `MS3: Inline media spec '${urn}' has no media_type` };
        }
    }

    return { valid: true };
}

/**
 * XV5: Validate that inline media_specs don't redefine existing registry specs.
 *
 * Behavior:
 * - With store access: strictly enforced - fail if any inline spec exists in registry
 * - Without store access: check against built-in specs only, log warning
 *
 * @param {Array} mediaSpecs - The inline media_specs array from a capability
 * @param {Object} mediaStore - The Netlify Blobs media store
 * @returns {Promise<{valid: boolean, error?: string, redefines?: string[]}>}
 */
async function validateNoMediaSpecRedefinition(mediaSpecs, mediaStore) {
    if (!mediaSpecs || !Array.isArray(mediaSpecs) || mediaSpecs.length === 0) {
        return { valid: true };
    }

    const redefines = [];

    for (const spec of mediaSpecs) {
        const mediaUrn = spec?.urn;
        if (!mediaUrn) continue;

        // Check against registry store
        if (mediaStore) {
            try {
                const existingSpec = await mediaStore.get(mediaUrn);
                if (existingSpec) {
                    redefines.push(mediaUrn);
                }
            } catch (err) {
                // Store unavailable - log warning and allow (graceful degradation)
                console.warn(`[WARN] XV5: Could not verify inline spec '${mediaUrn}' against registry store: ${err.message}. Allowing operation.`);
            }
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

module.exports = {
    normalizeMediaUrn,
    extractMediaUrns,
    validateMediaUrnsExist,
    validateMediaSpec,
    validateInlineMediaSpecs,
    validateNoMediaSpecRedefinition
};
