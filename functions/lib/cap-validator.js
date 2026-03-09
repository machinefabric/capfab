// Capability Validation Module
// Enforces all validation rules from RULES.md
// No fallbacks - fail hard on any violation

const { CapUrn, Cap, CapArg, ArgSource, validateCapArgs, RESERVED_CLI_FLAGS } = require('capdag');

/**
 * Validate a capability definition against all rules
 * Enforces: RULE1-RULE12, MS1, MS4 (inline), CU1-CU2
 * @param {Object} capability - The capability object
 * @returns {{ valid: boolean, error?: string }}
 */
function validateCapability(capability) {
    if (!capability) {
        return { valid: false, error: 'Capability data is required' };
    }

    // Validate required fields
    if (!capability.title || typeof capability.title !== 'string') {
        return { valid: false, error: 'Capability title is required' };
    }

    if (!capability.command || typeof capability.command !== 'string') {
        return { valid: false, error: 'Capability command is required' };
    }

    // Validate urn (CU1, CU2) - accepts string or object format
    if (!capability.urn) {
        return { valid: false, error: 'Capability urn is required' };
    }

    // CU1: Required in/out tags
    // CU2: Valid media URN references
    try {
        if (typeof capability.urn === 'string') {
            // String format: parse to validate
            CapUrn.fromString(capability.urn);
        } else if (capability.urn && capability.urn.tags) {
            // Object format (deprecated): validate via fromTags
            const tags = capability.urn.tags;
            if (typeof tags !== 'object' || Array.isArray(tags)) {
                return { valid: false, error: 'Capability tags must be an object' };
            }
            CapUrn.fromTags(tags);
        } else {
            return { valid: false, error: 'Capability urn must be a string or object with tags' };
        }
    } catch (error) {
        return { valid: false, error: `Invalid capability URN: ${error.message}` };
    }

    // Validate inline media_specs (MS1, XV4)
    if (capability.media_specs) {
        const mediaSpecsValidation = validateInlineMediaSpecs(capability.media_specs);
        if (!mediaSpecsValidation.valid) {
            return mediaSpecsValidation;
        }
    }

    // Validate args array (RULE1-RULE12)
    if (capability.args) {
        const argsValidation = validateArgsWithRules(capability.args);
        if (!argsValidation.valid) {
            return argsValidation;
        }
    }

    // Validate output
    if (capability.output) {
        const outputValidation = validateOutput(capability.output);
        if (!outputValidation.valid) {
            return outputValidation;
        }
    }

    // Validate metadata_json if present
    if (capability.metadata_json !== undefined && capability.metadata_json !== null) {
        if (typeof capability.metadata_json !== 'object' || Array.isArray(capability.metadata_json)) {
            return { valid: false, error: 'metadata_json must be an object if provided' };
        }
    }

    return { valid: true };
}

/**
 * Validate inline media_specs array
 * Enforces MS1 (title required) for inline specs (XV4)
 * @param {Array} mediaSpecs - The media_specs array
 * @returns {{ valid: boolean, error?: string }}
 */
function validateInlineMediaSpecs(mediaSpecs) {
    if (!Array.isArray(mediaSpecs)) {
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
            return { valid: false, error: `Invalid media URN in media_specs: '${urn}' must start with 'media:'` };
        }

        // Check for duplicate URNs
        if (seenUrns.has(urn)) {
            return { valid: false, error: `Duplicate media URN in media_specs: '${urn}'` };
        }
        seenUrns.add(urn);

        // MS1/XV4: Title required
        if (!spec.title || typeof spec.title !== 'string') {
            return { valid: false, error: `Inline media spec '${urn}' has no title` };
        }

        // MS3: Media type required
        if (!spec.media_type || typeof spec.media_type !== 'string') {
            return { valid: false, error: `Inline media spec '${urn}' has no media_type` };
        }
    }

    return { valid: true };
}

/**
 * Validate args array against RULE1-RULE12
 * @param {Array} args - The args array
 * @returns {{ valid: boolean, error?: string }}
 */
function validateArgsWithRules(args) {
    if (!Array.isArray(args)) {
        return { valid: false, error: 'args must be an array' };
    }

    // Structural validation first
    for (let i = 0; i < args.length; i++) {
        const argValidation = validateArgStructure(args[i], i);
        if (!argValidation.valid) {
            return argValidation;
        }
    }

    // RULE1: No duplicate media_urns
    const mediaUrns = new Set();
    for (const arg of args) {
        if (mediaUrns.has(arg.media_urn)) {
            return { valid: false, error: `RULE1: Duplicate media_urn '${arg.media_urn}'` };
        }
        mediaUrns.add(arg.media_urn);
    }

    // Collect stdin URNs, positions, and cli_flags for cross-arg validation
    const stdinUrns = [];
    const positions = [];
    const cliFlags = [];

    for (const arg of args) {
        // RULE2: sources must not be empty (already checked in structural validation)

        const sourceTypes = new Set();
        let hasPosition = false;
        let hasCliFlag = false;

        for (const source of arg.sources) {
            // Determine source type
            let sourceType = null;
            if (source.stdin !== undefined) sourceType = 'stdin';
            else if (source.position !== undefined) sourceType = 'position';
            else if (source.cli_flag !== undefined) sourceType = 'cli_flag';

            if (!sourceType) {
                // RULE8: No unknown keys
                return { valid: false, error: `RULE8: Argument '${arg.media_urn}' has source with unknown keys: ${JSON.stringify(source)}` };
            }

            // RULE4: No duplicate source types per argument
            if (sourceTypes.has(sourceType)) {
                return { valid: false, error: `RULE4: Argument '${arg.media_urn}' has duplicate source type '${sourceType}'` };
            }
            sourceTypes.add(sourceType);

            if (sourceType === 'stdin') {
                stdinUrns.push(source.stdin);
            } else if (sourceType === 'position') {
                hasPosition = true;
                positions.push({ position: source.position, mediaUrn: arg.media_urn });
            } else if (sourceType === 'cli_flag') {
                hasCliFlag = true;
                const flag = source.cli_flag;
                cliFlags.push({ flag, mediaUrn: arg.media_urn });

                // RULE10: Reserved cli_flags
                if (RESERVED_CLI_FLAGS.includes(flag)) {
                    return { valid: false, error: `RULE10: Argument '${arg.media_urn}' uses reserved cli_flag '${flag}'` };
                }
            }
        }

        // RULE7: No arg may have both position and cli_flag
        if (hasPosition && hasCliFlag) {
            return { valid: false, error: `RULE7: Argument '${arg.media_urn}' has both position and cli_flag sources` };
        }
    }

    // RULE3: Multiple stdin sources must have identical media_urns
    if (stdinUrns.length > 1) {
        const firstStdin = stdinUrns[0];
        for (let i = 1; i < stdinUrns.length; i++) {
            if (stdinUrns[i] !== firstStdin) {
                return { valid: false, error: `RULE3: Multiple args have different stdin media_urns: '${firstStdin}' vs '${stdinUrns[i]}'` };
            }
        }
    }

    // RULE5: No two args may have same position
    const positionSet = new Set();
    for (const { position, mediaUrn } of positions) {
        if (positionSet.has(position)) {
            return { valid: false, error: `RULE5: Duplicate position ${position} in argument '${mediaUrn}'` };
        }
        positionSet.add(position);
    }

    // RULE6: Positions must be sequential (0-based, no gaps)
    if (positions.length > 0) {
        const sortedPositions = [...positions].sort((a, b) => a.position - b.position);
        for (let i = 0; i < sortedPositions.length; i++) {
            if (sortedPositions[i].position !== i) {
                return { valid: false, error: `RULE6: Position gap - expected ${i} but found ${sortedPositions[i].position}` };
            }
        }
    }

    // RULE9: No two args may have same cli_flag
    const flagSet = new Set();
    for (const { flag, mediaUrn } of cliFlags) {
        if (flagSet.has(flag)) {
            return { valid: false, error: `RULE9: Duplicate cli_flag '${flag}' in argument '${mediaUrn}'` };
        }
        flagSet.add(flag);
    }

    return { valid: true };
}

/**
 * Validate argument structure
 * @param {Object} arg - The argument object
 * @param {number} index - Argument index for error messages
 * @returns {{ valid: boolean, error?: string }}
 */
function validateArgStructure(arg, index) {
    if (!arg || typeof arg !== 'object') {
        return { valid: false, error: `Argument ${index} must be an object` };
    }

    if (!arg.media_urn || typeof arg.media_urn !== 'string') {
        return { valid: false, error: `Argument ${index} media_urn is required and must be a string` };
    }

    // MS2: media_urn must start with 'media:'
    if (!arg.media_urn.startsWith('media:')) {
        return { valid: false, error: `Argument ${index} media_urn must start with 'media:'` };
    }

    if (arg.required !== undefined && typeof arg.required !== 'boolean') {
        return { valid: false, error: `Argument ${index} required must be a boolean if provided` };
    }

    // RULE2: sources must not be empty
    if (!arg.sources || !Array.isArray(arg.sources)) {
        return { valid: false, error: `RULE2: Argument '${arg.media_urn}' sources is required and must be an array` };
    }

    if (arg.sources.length === 0) {
        return { valid: false, error: `RULE2: Argument '${arg.media_urn}' has empty sources` };
    }

    // Validate each source
    for (let i = 0; i < arg.sources.length; i++) {
        const sourceValidation = validateArgSource(arg.sources[i], arg.media_urn, i);
        if (!sourceValidation.valid) {
            return sourceValidation;
        }
    }

    // Validate schema if present
    if (arg.schema) {
        const schemaValidation = validateJsonSchema(arg.schema);
        if (!schemaValidation.valid) {
            return { valid: false, error: `Argument ${index} has invalid schema: ${schemaValidation.error}` };
        }
    }

    return { valid: true };
}

/**
 * Validate argument source
 * @param {Object} source - The source object
 * @param {string} mediaUrn - Parent argument's media_urn for error messages
 * @param {number} sourceIndex - Source index for error messages
 * @returns {{ valid: boolean, error?: string }}
 */
function validateArgSource(source, mediaUrn, sourceIndex) {
    if (!source || typeof source !== 'object') {
        return { valid: false, error: `Source ${sourceIndex} for '${mediaUrn}' must be an object` };
    }

    // Must have exactly one of: stdin, position, cli_flag
    const hasStdin = source.stdin !== undefined;
    const hasPosition = source.position !== undefined;
    const hasCliFlag = source.cli_flag !== undefined;

    const count = [hasStdin, hasPosition, hasCliFlag].filter(Boolean).length;
    if (count !== 1) {
        return { valid: false, error: `RULE8: Source ${sourceIndex} for '${mediaUrn}' must have exactly one of: stdin, position, cli_flag` };
    }

    // Validate stdin (must be a media URN string)
    if (hasStdin) {
        if (typeof source.stdin !== 'string') {
            return { valid: false, error: `Source ${sourceIndex} stdin must be a string (media URN)` };
        }
        if (!source.stdin.startsWith('media:')) {
            return { valid: false, error: `Source ${sourceIndex} stdin must be a valid media URN starting with 'media:'` };
        }
    }

    // Validate position (must be a non-negative integer)
    if (hasPosition) {
        if (!Number.isInteger(source.position) || source.position < 0) {
            return { valid: false, error: `Source ${sourceIndex} position must be a non-negative integer` };
        }
    }

    // Validate cli_flag (must be a non-empty string)
    if (hasCliFlag) {
        if (typeof source.cli_flag !== 'string' || source.cli_flag.trim().length === 0) {
            return { valid: false, error: `Source ${sourceIndex} cli_flag must be a non-empty string` };
        }
    }

    return { valid: true };
}

/**
 * Validate output definition
 * @param {Object} output - The output object
 * @returns {{ valid: boolean, error?: string }}
 */
function validateOutput(output) {
    if (!output || typeof output !== 'object') {
        return { valid: false, error: 'Output must be an object' };
    }

    if (!output.media_urn || typeof output.media_urn !== 'string') {
        return { valid: false, error: 'Output media_urn is required and must be a string' };
    }

    // MS2: media_urn must start with 'media:'
    if (!output.media_urn.startsWith('media:')) {
        return { valid: false, error: 'Output media_urn must start with \'media:\'' };
    }

    // Validate schema if present
    if (output.schema) {
        const schemaValidation = validateJsonSchema(output.schema);
        if (!schemaValidation.valid) {
            return { valid: false, error: `Output has invalid schema: ${schemaValidation.error}` };
        }
    }

    return { valid: true };
}

/**
 * Validate JSON Schema structure
 * @param {Object} schema - The JSON Schema object
 * @param {string} path - Path for error messages
 * @returns {{ valid: boolean, error?: string }}
 */
function validateJsonSchema(schema, path = 'schema') {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        return { valid: false, error: `${path} must be a valid object` };
    }

    // Schema can either have a type field or be a $ref
    if (!schema.type && !schema.$ref) {
        return { valid: false, error: `${path} must have either a type field or $ref` };
    }

    // If it's a $ref, validate the reference format
    if (schema.$ref) {
        if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/')) {
            return { valid: false, error: `${path}.$ref must be a valid reference starting with #/` };
        }
        return { valid: true };
    }

    const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];

    // Handle union types (array of types)
    if (Array.isArray(schema.type)) {
        for (const type of schema.type) {
            if (!validTypes.includes(type)) {
                return { valid: false, error: `${path} type array contains invalid type: ${type}` };
            }
        }
    } else if (!validTypes.includes(schema.type)) {
        return { valid: false, error: `${path} type must be one of: ${validTypes.join(', ')}` };
    }

    // Validate nested properties
    if (schema.properties) {
        if (typeof schema.properties !== 'object' || Array.isArray(schema.properties)) {
            return { valid: false, error: `${path} properties must be an object` };
        }
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
            const propValidation = validateJsonSchema(propSchema, `${path}.properties.${propName}`);
            if (!propValidation.valid) {
                return propValidation;
            }
        }
    }

    // Validate array items
    if (schema.items) {
        if (Array.isArray(schema.items)) {
            for (let i = 0; i < schema.items.length; i++) {
                const itemValidation = validateJsonSchema(schema.items[i], `${path}.items[${i}]`);
                if (!itemValidation.valid) {
                    return itemValidation;
                }
            }
        } else {
            const itemValidation = validateJsonSchema(schema.items, `${path}.items`);
            if (!itemValidation.valid) {
                return itemValidation;
            }
        }
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
        return { valid: false, error: `Invalid media URN: '${mediaSpec.urn}' must start with 'media:'` };
    }

    // MS1: Title required
    if (!mediaSpec.title || typeof mediaSpec.title !== 'string') {
        return { valid: false, error: `Media spec '${mediaSpec.urn}' has no title` };
    }

    // MS3: Media type required
    if (!mediaSpec.media_type || typeof mediaSpec.media_type !== 'string') {
        return { valid: false, error: `Media spec '${mediaSpec.urn}' has no media_type` };
    }

    return { valid: true };
}

/**
 * Format CapUrn as canonical string
 * @param {Object|string} capUrn - Cap URN object or string
 * @returns {string} Canonical URN string
 */
function formatCapUrn(capUrn) {
    if (typeof capUrn === 'string') {
        return CapUrn.fromString(capUrn).toString();
    }

    if (capUrn && capUrn.tags) {
        const capUrnObj = CapUrn.fromTags(capUrn.tags);
        return capUrnObj.toString();
    }

    throw new Error('Invalid capability URN format');
}

module.exports = {
    validateCapability,
    validateInlineMediaSpecs,
    validateArgsWithRules,
    validateArgStructure,
    validateArgSource,
    validateOutput,
    validateJsonSchema,
    validateMediaSpec,
    formatCapUrn,
    RESERVED_CLI_FLAGS
};
