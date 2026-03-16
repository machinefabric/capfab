#!/usr/bin/env node

// Load standard capabilities from TOML files, validate against schema, and prepare for registry upload
// Separates machfab-specific capabilities (generated but not uploaded) from public registry capabilities
//
// CLI Commands:
//   (no args)      - Existing upload flow (default)
//   validate       - Full validation suite with detailed error reporting
//   list-urns      - List all defined URNs (cap URNs + media URNs)
//   list-caps      - List caps with their utilized media URNs (tree format)
//   export-graph   - Export media spec graph to DOT format
//
// Options for export-graph:
//   --output <path>  - Output DOT file path (default: stdout)
//   --render         - Render to PNG using graphviz
//   --png <path>     - PNG output path (implies --render)

// Load .env file for environment variables
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const toml = require('@iarna/toml');
const Ajv = require('ajv');
const { execSync } = require('child_process');

// ============================================================================
// CLI OPTION PARSING
// ============================================================================

/**
 * Print usage help
 */
function printHelp() {
    console.log('Usage: npm run standards -- [command] [options]');
    console.log('');
    console.log('Commands:');
    console.log('  (no args)      Run upload flow (default)');
    console.log('  validate       Full validation suite with detailed error reporting');
    console.log('  list-urns      List all defined URNs (cap URNs + media URNs)');
    console.log('  list-caps      List caps with their utilized media URNs (tree format)');
    console.log('  export-graph   Export media spec graph to DOT format');
    console.log('');
    console.log('Options for export-graph:');
    console.log('  --output <path>  Output DOT file path (default: stdout)');
    console.log('  --render         Render to PNG using graphviz');
    console.log('  --png <path>     PNG output path (implies --render)');
    console.log('');
    console.log('General options:');
    console.log('  --help, -h       Show this help message');
    console.log('  --verbose, -v    Show detailed progress (file-by-file, batch-by-batch)');
    console.log('');
    console.log('NPM scripts:');
    console.log('  npm run standards              Run upload flow');
    console.log('  npm run standards:validate     Run validation suite');
    console.log('  npm run standards:list-urns    List all URNs');
    console.log('  npm run standards:list-caps    List caps with media URNs');
    console.log('  npm run standards:export-graph Export graph to stdout');
    console.log('  npm run standards:render-graph Render graph to cap-graph.ignore.png');
}

/**
 * Parse command-line arguments
 * @param {string[]} args - Command-line arguments (process.argv.slice(2))
 * @returns {{ command: string, options: object }}
 */
function parseOptions(args) {
    const result = {
        command: '', // Default: run upload flow
        options: {
            output: null,
            render: false,
            png: null,
            help: false,
            verbose: false
        }
    };

    let i = 0;
    while (i < args.length) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            result.options.help = true;
            i += 1;
        } else if (arg === '--verbose' || arg === '-v') {
            result.options.verbose = true;
            i += 1;
        } else if (arg === '--output' && i + 1 < args.length) {
            result.options.output = args[i + 1];
            i += 2;
        } else if (arg === '--render') {
            result.options.render = true;
            i += 1;
        } else if (arg === '--png' && i + 1 < args.length) {
            result.options.png = args[i + 1];
            result.options.render = true; // --png implies --render
            i += 2;
        } else if (!arg.startsWith('-')) {
            // First non-option argument is the command
            if (!result.command) {
                result.command = arg;
            }
            i += 1;
        } else {
            // Unknown option
            console.error(`Unknown option: ${arg}`);
            console.error('');
            printHelp();
            process.exit(1);
        }
    }

    return result;
}

// Reserved CLI flags that cannot be used (from Rust validation.rs)
const RESERVED_CLI_FLAGS = ['manifest', '--help', '--version', '-v', '-h'];

/**
 * Load and validate standard capability definitions
 * @param {object} opts - Options
 * @param {boolean} opts.quiet - Suppress all output (overrides verbose)
 * @param {boolean} opts.verbose - Show detailed per-file progress
 */
async function loadStandardCapabilities(opts = {}) {
    const { quiet = false, verbose = false } = opts;
    const log = quiet ? () => {} : console.log.bind(console);

	const srcDir = __dirname;
    const capsDir = path.join(__dirname, 'caps');
    const mediaDir = path.join(__dirname, 'media');
    const machfabDir = path.join(srcDir, 'machfab');
    const capSchemaPath = path.join(srcDir, 'cap.schema.json');
    const mediaSchemaPath = path.join(srcDir, 'media.schema.json');

    // Load JSON schemas
    const capSchema = JSON.parse(fs.readFileSync(capSchemaPath, 'utf8'));
    const mediaSchema = JSON.parse(fs.readFileSync(mediaSchemaPath, 'utf8'));

    // Create AJV and add media schema first (cap schema references it via $ref)
    const ajv = new Ajv({ allErrors: true });
    ajv.addSchema(mediaSchema, 'media.schema.json');
    const validate = ajv.compile(capSchema);

    // Find all TOML files in caps directory (public registry caps)
    const publicTomlFiles = fs.readdirSync(capsDir)
        .filter(file => file.endsWith('.toml') && file !== 'cap_sample.toml')
        .sort();

    // Find all TOML files in machfab directory (machfab-specific caps)
    const machfabTomlFiles = fs.existsSync(machfabDir)
        ? fs.readdirSync(machfabDir).filter(file => file.endsWith('.toml')).sort()
        : [];

    log(`Found ${publicTomlFiles.length} public capability definitions`);
    if (verbose) {
        publicTomlFiles.forEach(file => log(`  - ${file}`));
        log();
    }

    if (machfabTomlFiles.length > 0) {
        log(`Found ${machfabTomlFiles.length} machfab-specific capability definitions`);
        if (verbose) {
            machfabTomlFiles.forEach(file => log(`  - machfab/${file}`));
            log();
        }
    }

    const publicCapabilities = [];
    const machfabCapabilities = [];
    const errors = [];

    // Process public capabilities
    for (const file of publicTomlFiles) {
        const result = processTomlFile(path.join(capsDir, file), file, validate, { quiet, verbose });
        if (result.error) {
            errors.push(result.error);
        } else {
            publicCapabilities.push(result.capability);
        }
    }

    // Process machfab-specific capabilities
    for (const file of machfabTomlFiles) {
        const result = processTomlFile(path.join(machfabDir, file), `machfab/${file}`, validate, { quiet, verbose });
        if (result.error) {
            errors.push(result.error);
        } else {
            machfabCapabilities.push(result.capability);
        }
    }

    log();
    log(`Summary:`);
    log(`  Public capabilities loaded: ${publicCapabilities.length}`);
    log(`  Macina-specific capabilities loaded: ${machfabCapabilities.length}`);
    log(`  Errors: ${errors.length}`);

    if (verbose && publicCapabilities.length > 0) {
        log();
        log(`Public capabilities (will be uploaded):`);
        publicCapabilities.forEach(cap => {
            log(`  - ${cap.name}: ${cap.urn}`);
        });
    }

    if (verbose && machfabCapabilities.length > 0) {
        log();
        log(`Macina-specific capabilities (JSON only, not uploaded):`);
        machfabCapabilities.forEach(cap => {
            log(`  - ${cap.name}: ${cap.urn}`);
        });
    }

    if (errors.length > 0) {
        log();
        log(`Files with errors:`);
        errors.forEach(err => {
            log(`  - ${err.file}`);
        });
        process.exit(1);
    }

    return { publicCapabilities, machfabCapabilities };
}

// Import Tagged URN for proper URN validation and matching
const { TaggedUrn, TaggedUrnError } = require('tagged-urn');

/**
 * Parse and validate a media URN string
 * @param {string} urnStr - The URN string to parse
 * @returns {{ urn: TaggedUrn, error: string|null }} Parsed URN or error message
 */
function parseMediaUrn(urnStr) {
    if (!urnStr || typeof urnStr !== 'string') {
        return { urn: null, error: 'URN is empty or not a string' };
    }
    try {
        const urn = TaggedUrn.fromString(urnStr);
        if (urn.getPrefix() !== 'media') {
            return { urn: null, error: `URN has wrong prefix '${urn.getPrefix()}', expected 'media'` };
        }
        return { urn, error: null };
    } catch (e) {
        if (e instanceof TaggedUrnError) {
            return { urn: null, error: e.message };
        }
        return { urn: null, error: String(e) };
    }
}

/**
 * Check if a requested URN matches any of the available media spec URNs
 * Uses tagged-urn matching semantics (tag-based, order-independent)
 * @param {TaggedUrn} requestedUrn - The URN being requested
 * @param {TaggedUrn[]} availableUrns - Array of available media spec URNs
 * @returns {boolean} True if any available URN matches the request
 */
function mediaUrnMatchesAny(requestedUrn, availableUrns) {
    for (const availableUrn of availableUrns) {
        try {
            // Check if the available media spec can satisfy the requested URN
            if (availableUrn.conformsTo(requestedUrn)) {
                return true;
            }
        } catch (e) {
            // Only skip PREFIX_MISMATCH (expected when comparing different prefixes).
            // All other errors (TypeError, missing methods, etc.) must fail hard.
            if (e && e.code === 'PREFIX_MISMATCH') {
                continue;
            }
            throw e;
        }
    }
    return false;
}

/**
 * Validate that every media_urn referenced by a capability (args + output) exists
 * either in the capability's own media_specs table or in the set of separately
 * defined media specs loaded from standard/media.
 *
 * Uses tagged-urn matching semantics for proper tag-based comparison.
 *
 * Returns: { errors: [], localOnlyWarnings: [] }
 *   - errors: URNs not found in either local or global specs (fatal)
 *   - localOnlyWarnings: URNs found only in local media_specs, not global (warning)
 */
function validateCapMediaReferences(capabilities, mediaSpecs) {
    const errors = [];
    const localOnlyWarnings = [];
    const urnParseErrors = [];

    // Parse all global media spec URNs
    const globalSpecUrns = [];
    for (const ms of (mediaSpecs || [])) {
        const urnStr = (ms.spec && ms.spec.urn) || ms.urn;
        if (!urnStr) continue;

        const { urn, error } = parseMediaUrn(urnStr);
        if (error) {
            urnParseErrors.push({ source: 'media_spec', urn: urnStr, error });
        } else {
            globalSpecUrns.push(urn);
        }
    }

    for (const cap of capabilities) {
        const capName = cap.name;
        const capObj = cap.capability;

        // Parse local media spec URNs from capability's media_specs array
        const localSpecUrns = [];
        for (const spec of (capObj.media_specs || [])) {
            if (!spec || !spec.urn) continue;
            const { urn, error } = parseMediaUrn(spec.urn);
            if (error) {
                urnParseErrors.push({ source: `cap:${capName}:media_specs`, urn: spec.urn, error });
            } else {
                localSpecUrns.push(urn);
            }
        }

        // Collect all referenced URNs from args, output, and capability URN in/out tags
        const referencedStrs = new Set();

        // Check args media_urn references
        if (Array.isArray(capObj.args)) {
            capObj.args.forEach(a => { if (a && a.media_urn) referencedStrs.add(a.media_urn); });
        }

        // Check output media_urn reference
        if (capObj.output && capObj.output.media_urn) {
            referencedStrs.add(capObj.output.media_urn);
        }

        // Check capability URN's in/out tags (these contain media URNs)
        if (capObj.urn && capObj.urn.tags) {
            if (capObj.urn.tags.in) {
                referencedStrs.add(capObj.urn.tags.in);
            }
            if (capObj.urn.tags.out) {
                referencedStrs.add(capObj.urn.tags.out);
            }
        }

        // Check each referenced URN
        for (const urnStr of referencedStrs) {
            const { urn: requestedUrn, error } = parseMediaUrn(urnStr);
            if (error) {
                urnParseErrors.push({ source: `cap:${capName}:ref`, urn: urnStr, error });
                continue;
            }

            // Check if it matches any local or global media spec
            const matchesLocal = mediaUrnMatchesAny(requestedUrn, localSpecUrns);
            const matchesGlobal = mediaUrnMatchesAny(requestedUrn, globalSpecUrns);

            if (!matchesLocal && !matchesGlobal) {
                errors.push({ cap: capName, missing_media_urn: urnStr });
            } else if (matchesLocal && !matchesGlobal) {
                // Matches local but not global - warn about this
                localOnlyWarnings.push({ cap: capName, local_only_media_urn: urnStr });
            }
        }
    }

    // URN parse errors are fatal
    if (urnParseErrors.length > 0) {
        console.error('\nFATAL: Invalid URN(s) found:');
        for (const { source, urn, error } of urnParseErrors) {
            console.error(`  ${source}: ${urn} - ${error}`);
        }
        process.exit(1);
    }

    return { errors, localOnlyWarnings };
}

/**
 * Process a single TOML file
 * FATAL: Any error immediately exits the process
 * @param {object} opts - Options
 * @param {boolean} opts.quiet - Suppress all output
 * @param {boolean} opts.verbose - Show detailed per-file progress
 */
function processTomlFile(filePath, displayName, validate, opts = {}) {
    const { quiet = false, verbose = false } = opts;
    const log = quiet ? () => {} : console.log.bind(console);
    const verboseLog = (quiet || !verbose) ? () => {} : console.log.bind(console);
    const name = path.basename(filePath, '.toml');

    try {
        verboseLog(`Processing ${displayName}...`);

        // Parse TOML
        const tomlContent = fs.readFileSync(filePath, 'utf8');
        const parsed = toml.parse(tomlContent);

        // Convert to capability format
        const capability = convertTomlToCapability(parsed);

        // Validate against schema
        const valid = validate(capability);
        if (!valid) {
            console.error(`\nFATAL: Validation failed for ${displayName}:`);
            validate.errors.forEach(err => {
                console.error(`   ${err.instancePath || 'root'}: ${err.message}`);
                if (err.data !== undefined) {
                    console.error(`   Data: ${JSON.stringify(err.data)}`);
                }
            });
            process.exit(1);
        }

        verboseLog(`OK ${displayName} validated successfully`);
        return {
            capability: {
                name,
                file: displayName,
                capability,
                urn: formatCapUrn(capability.urn)
            }
        };

    } catch (error) {
        console.error(`\nFATAL: Error processing ${displayName}:`, error.message);
        if (error.line !== undefined) {
            console.error(`   At line ${error.line}, column ${error.col}`);
        }
        process.exit(1);
    }
}

/**
 * Convert TOML format to CAPDAG capability JSON format
 * Uses CapUrn for proper URN normalization (handles case and quoting correctly)
 */
function convertTomlToCapability(tomlData) {
    // Use CapUrn for proper normalization - handles case rules correctly
    // (keys are always lowercased, unquoted values are lowercased, quoted values preserve case)
    // Always output URN as string format (new standard)
    let normalizedUrn;
    if (typeof tomlData.urn === 'string') {
        // New format: URN is already a string, validate and normalize
        const capUrnObj = CapUrn.fromString(tomlData.urn);
        normalizedUrn = capUrnObj.toString();
    } else if (tomlData.urn && tomlData.urn.tags) {
        // Old format: Convert tags object to string
        const capUrnObj = CapUrn.fromTags(tomlData.urn.tags);
        normalizedUrn = capUrnObj.toString();
    } else {
        throw new Error('Invalid URN format: must be string or {tags: {...}}');
    }

    const capability = {
        urn: normalizedUrn,
        command: tomlData.command,
        title: tomlData.title  // Required field in new schema
    };

    if (tomlData.cap_description) {
        capability.cap_description = tomlData.cap_description;
    }

    if (tomlData.metadata) {
        capability.metadata = tomlData.metadata;
    } else {
        capability.metadata = {};
    }

    // Include media_specs table for media URN resolution
    if (tomlData.media_specs) {
        capability.media_specs = tomlData.media_specs;
    }

    if (tomlData.metadata_json !== undefined) {
        capability.metadata_json = tomlData.metadata_json;
    }

    // Convert args - new unified format with sources
    if (tomlData.args && tomlData.args.length > 0) {
        capability.args = processCapArgs(tomlData.args);
    } else {
        capability.args = [];
    }

    // Convert output and process schemas
    if (tomlData.output) {
        capability.output = processOutputSchema(tomlData.output);
    }

    return capability;
}

/**
 * Process cap args - handles the new unified args format with sources
 */
function processCapArgs(args) {
    return args.map(arg => {
        const processedArg = {
            media_urn: arg.media_urn,
            required: arg.required,
            sources: arg.sources || []
        };

        // Include optional fields if present
        if (arg.arg_description) {
            processedArg.arg_description = arg.arg_description;
        }

        if (arg.validation) {
            processedArg.validation = arg.validation;
        }

        if (arg.default_value !== undefined) {
            processedArg.default_value = arg.default_value;
        }

        if (arg.metadata !== undefined) {
            processedArg.metadata = arg.metadata;
        }

        return processedArg;
    });
}

/**
 * Process output schema - handles schema_ref, embedded schema, and metadata fields
 */
function processOutputSchema(output) {
    const processedOutput = { ...output };

    // Handle schema_ref from TOML (for external schemas)
    if (output.schema_ref) {
        processedOutput.schema_ref = output.schema_ref;
    }

    // Handle embedded schema from TOML
    if (output.schema) {
        processedOutput.schema = output.schema;
    }

    // Handle metadata from TOML
    if (output.metadata !== undefined) {
        processedOutput.metadata = output.metadata;
    }

    return processedOutput;
}

// Import the strict Cap URN implementation from npm package
const { CapUrn, CapUrnError } = require('capdag');

/**
 * Format capability URN as string using strict implementation
 */
function formatCapUrn(capUrn) {
    if (typeof capUrn === 'string') {
        try {
            // Parse and re-serialize to ensure proper formatting
            const parsed = CapUrn.fromString(capUrn);
            return parsed.toString();
        } catch (error) {
            if (error instanceof CapUrnError) {
                console.warn(`Invalid Cap URN string: ${capUrn}`, error.message);
                return 'cap:unknown';
            }
            throw error;
        }
    }

    if (capUrn && capUrn.tags) {
        try {
            // Use fromTags to properly extract in/out and normalize
            const capUrnObj = CapUrn.fromTags(capUrn.tags);
            return capUrnObj.toString();
        } catch (error) {
            if (error instanceof CapUrnError) {
                console.warn(`Invalid Cap URN tags:`, capUrn.tags, error.message);
                return 'cap:unknown';
            }
            throw error;
        }
    }

    return 'cap:unknown';
}

/**
 * Recursively clear a directory's contents
 */
function clearDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach(file => {
            const filePath = path.join(dirPath, file);
            if (fs.statSync(filePath).isDirectory()) {
                clearDirectory(filePath);
                fs.rmdirSync(filePath);
            } else {
                fs.unlinkSync(filePath);
            }
        });
    }
}

/**
 * Export capabilities as JSON for API upload
 * @param {Array} publicCapabilities - Public capabilities to export
 * @param {Array} machfabCapabilities - Macina-specific capabilities to export
 * @param {object} opts - Options
 * @param {boolean} opts.verbose - Show detailed export progress
 */
function exportCapabilitiesJson(publicCapabilities, machfabCapabilities, opts = {}) {
    const { verbose = false } = opts;
    const outputDir = path.join(__dirname, '..', 'generated');
    const machfabOutputDir = path.join(outputDir, 'machfab');

    // Clear generated directory to remove stale files
    if (verbose) console.log('Clearing generated directory...');
    clearDirectory(outputDir);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }
    if (!fs.existsSync(machfabOutputDir)) {
        fs.mkdirSync(machfabOutputDir);
    }

    // Export public capability JSON files
    if (verbose) console.log('Exporting public capabilities:');
    publicCapabilities.forEach(cap => {
        const jsonPath = path.join(outputDir, `${cap.name}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(cap.capability, null, 2));
        if (verbose) console.log(`  Exported: ${jsonPath}`);
    });

    // Export machfab-specific capability JSON files
    if (machfabCapabilities.length > 0) {
        if (verbose) console.log('Exporting machfab-specific capabilities:');
        machfabCapabilities.forEach(cap => {
            const jsonPath = path.join(machfabOutputDir, `${cap.name}.json`);
            fs.writeFileSync(jsonPath, JSON.stringify(cap.capability, null, 2));
            if (verbose) console.log(`  Exported: ${jsonPath}`);
        });
    }

    // Export combined JSON (public only)
    const allPublicCaps = publicCapabilities.map(cap => cap.capability);
    const combinedPath = path.join(outputDir, 'all-capabilities.json');
    fs.writeFileSync(combinedPath, JSON.stringify(allPublicCaps, null, 2));
    console.log(`Exported combined (public only): ${combinedPath}`);

    // Export combined JSON for machfab caps
    if (machfabCapabilities.length > 0) {
        const allMacinaCaps = machfabCapabilities.map(cap => cap.capability);
        const machfabCombinedPath = path.join(machfabOutputDir, 'all-machfab-capabilities.json');
        fs.writeFileSync(machfabCombinedPath, JSON.stringify(allMacinaCaps, null, 2));
        console.log(`Exported combined (machfab only): ${machfabCombinedPath}`);
    }

    // Export upload script (public capabilities only)
    const uploadScript = generateUploadScript(publicCapabilities);
    const scriptPath = path.join(outputDir, 'upload-standards.js');
    fs.writeFileSync(scriptPath, uploadScript);
    fs.chmodSync(scriptPath, '755');
    console.log(`Generated upload script (public only): ${scriptPath}`);

    // Export machfab upload script (registers under a username)
    if (machfabCapabilities.length > 0) {
        const machfabUploadScript = generateMacinaUploadScript(machfabCapabilities);
        const machfabScriptPath = path.join(machfabOutputDir, 'upload-machfab-caps.js');
        fs.writeFileSync(machfabScriptPath, machfabUploadScript);
        fs.chmodSync(machfabScriptPath, '755');
        console.log(`Generated machfab upload script: ${machfabScriptPath}`);
    }
}

/**
 * Generate script to upload capabilities to registry (public only)
 */
function generateUploadScript(capabilities) {
    return `#!/usr/bin/env node

// Auto-generated script to upload standard capabilities to CAPDAG registry
// NOTE: This only uploads public capabilities, not machfab-specific ones

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const https = require('https');
const fs = require('fs');
const path = require('path');

const REGISTRY_URL = process.env.CAPDAG_REGISTRY_URL || 'https://capdag.com';
const ADMIN_KEY = process.env.CAPDAG_ADMIN_KEY || process.env.ADMIN_PASSWORD;
const DEST_PATH = process.env.CAPDAG_DEST_PATH;

const capabilities = ${JSON.stringify(capabilities.map(c => ({ name: c.name, capability: c.capability })), null, 2)};

/**
 * Clear all JSON files from a directory to remove stale caps
 */
function clearDestinationDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        return 0;
    }
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    for (const file of files) {
        fs.unlinkSync(path.join(dirPath, file));
    }
    return files.length;
}

async function uploadCapabilities() {
    let successCount = 0;
    let errorCount = 0;

	if (DEST_PATH) {
		// Clear destination directory first to remove stale caps
		const clearedCount = clearDestinationDirectory(DEST_PATH);
		if (clearedCount > 0) {
			console.log(\`Cleared \${clearedCount} existing JSON files from \${DEST_PATH}\`);
		}

		if (!fs.existsSync(DEST_PATH)) {
			fs.mkdirSync(DEST_PATH, { recursive: true });
		}

		for (const { name, capability } of capabilities) {
			const urn = formatCapUrn(capability.urn);
			try {
				// copy the generated json for cap to destination path if defined
				const filename = \`\${name}.json\`;
				const destPath = path.join(DEST_PATH, filename);
				fs.writeFileSync(destPath, JSON.stringify(capability, null, 2));
				console.log(\`   Copied to: \${destPath}\`);

				successCount++;
			} catch (error) {
				console.error(\`ERR Failed to copy \${urn}:\`, error.message);
				errorCount++;
			}
		}
	}

    if (!ADMIN_KEY) {
        console.error('Error: CAPDAG_ADMIN_KEY or ADMIN_PASSWORD environment variable required');
        process.exit(1);
    }

    console.log('Authenticating with registry...');
    const token = await authenticate();

    console.log('Clearing existing capabilities...');
    await clearAllCapabilities(token);

    console.log('Uploading standard capabilities...');
    successCount = 0;
    errorCount = 0;

    for (const { name, capability } of capabilities) {
        const urn = formatCapUrn(capability.urn);
        try {
            await uploadCapability(token, capability);
            console.log(\`OK Uploaded: \${urn}\`);

            successCount++;
        } catch (error) {
            console.error(\`ERR Failed to upload \${urn}:\`, error.message);
            errorCount++;
        }
    }

    console.log();
    console.log(\`Upload complete: \${successCount} success, \${errorCount} errors\`);

    if (errorCount > 0) {
        console.error(\`\\nNO ERROR: Failed to upload \${errorCount} capability/capabilities.\`);
        console.error('Capability uploads had errors. Check the error messages above for details.');
        console.error('Common issues: missing media URNs, validation failures, network errors.');
        process.exit(1);
    }
}

async function authenticate() {
    const data = JSON.stringify({ key: ADMIN_KEY });
    const response = await makeRequest('/api/admin/auth', 'POST', data);
    return response.token;
}

async function clearAllCapabilities(token) {
    const response = await makeRequest('/api/admin/capabilities/clear', 'POST', null, token);
    console.log(\`  Cleared \${response.deleted_count} capabilities\`);
    if (response.error_count > 0) {
        console.warn(\`  Warning: \${response.error_count} errors during clear\`);
    }
}

async function uploadCapability(token, capability) {
    const data = JSON.stringify(capability);
    await makeRequest('/api/admin/capabilities', 'POST', data, token);
}

function makeRequest(path, method, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, REGISTRY_URL);

        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = \`Bearer \${token}\`;
        }

        if (data) {
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }

        const req = https.request(url, options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    const parsed = responseData ? JSON.parse(responseData) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(\`HTTP \${res.statusCode}: \${parsed.error || responseData}\`));
                    }
                } catch (error) {
                    reject(new Error(\`Invalid JSON response: \${responseData}\`));
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(data);
        }

        req.end();
    });
}

// Import the strict Cap URN implementation from npm package
const { CapUrn, CapUrnError } = require('capdag');

function formatCapUrn(capUrn) {
    if (typeof capUrn === 'string') {
        try {
            // Parse and re-serialize to ensure proper formatting
            const parsed = CapUrn.fromString(capUrn);
            return parsed.toString();
        } catch (error) {
            if (error instanceof CapUrnError) {
                console.warn(\`Invalid Cap URN string: \${capUrn}\`, error.message);
                return 'cap:unknown';
            }
            throw error;
        }
    }

    if (capUrn && capUrn.tags) {
        try {
            // Use fromTags to properly extract in/out and normalize
            const capUrnObj = CapUrn.fromTags(capUrn.tags);
            return capUrnObj.toString();
        } catch (error) {
            if (error instanceof CapUrnError) {
            console.warn(\`Invalid Cap URN tags:\`, capUrn.tags, error);
            return 'cap:unknown';
            }
            throw error;
        }
    }

    return 'cap:unknown';
}

if (require.main === module) {
    uploadCapabilities().catch(error => {
        console.error('Upload failed:', error);
        process.exit(1);
    });
}

module.exports = { uploadCapabilities, formatCapUrn };
`;
}

/**
 * Generate script to upload machfab-specific capabilities registered under a username
 */
function generateMacinaUploadScript(capabilities) {
    return `#!/usr/bin/env node

// Auto-generated script to upload machfab-specific capabilities to CAPDAG registry
// These are registered under the MACINA_USERNAME user account

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const https = require('https');
const fs = require('fs');
const path = require('path');

const REGISTRY_URL = process.env.CAPDAG_REGISTRY_URL || 'https://capdag.com';
const ADMIN_KEY = process.env.CAPDAG_ADMIN_KEY || process.env.ADMIN_PASSWORD;
const MACINA_USERNAME = process.env.MACINA_USERNAME;
const DEST_PATH = process.env.CAPDAG_MACINA_DEST_PATH;

const capabilities = ${JSON.stringify(capabilities.map(c => ({ name: c.name, capability: c.capability })), null, 2)};

async function uploadMacinaCapabilities() {
    if (!MACINA_USERNAME) {
        console.error('Error: MACINA_USERNAME environment variable required');
        console.error('This script registers capabilities under a specific user account.');
        process.exit(1);
    }

    if (!ADMIN_KEY) {
        console.error('Error: CAPDAG_ADMIN_KEY or ADMIN_PASSWORD environment variable required');
        process.exit(1);
    }

    let successCount = 0;
    let errorCount = 0;

    // Copy to destination path if specified
    if (DEST_PATH) {
        console.log(\`Copying machfab capabilities to \${DEST_PATH}...\`);
        for (const { name, capability } of capabilities) {
            const urn = formatCapUrn(capability.urn);
            try {
                const filename = \`\${name}.json\`;
                const destPath = path.join(DEST_PATH, filename);
                if (!fs.existsSync(DEST_PATH)) {
                    fs.mkdirSync(DEST_PATH, { recursive: true });
                }
                fs.writeFileSync(destPath, JSON.stringify(capability, null, 2));
                console.log(\`  Copied: \${destPath}\`);
            } catch (error) {
                console.error(\`ERR Failed to copy \${urn}:\`, error.message);
            }
        }
    }

    console.log('Authenticating with registry...');
    const token = await authenticate();

    console.log(\`Uploading machfab capabilities registered to @\${MACINA_USERNAME}...\`);

    for (const { name, capability } of capabilities) {
        const urn = formatCapUrn(capability.urn);
        try {
            // Add register_as_username to register under the machfab user
            const capWithUser = {
                ...capability,
                register_as_username: MACINA_USERNAME
            };
            await uploadCapability(token, capWithUser);
            console.log(\`OK Uploaded: \${urn} (registered to @\${MACINA_USERNAME})\`);
            successCount++;
        } catch (error) {
            // If cap already exists, that's OK - might be a re-run
            if (error.message.includes('409') || error.message.includes('already exists')) {
                console.log(\`SKIP Already exists: \${urn}\`);
            } else {
                console.error(\`ERR Failed to upload \${urn}:\`, error.message);
                errorCount++;
            }
        }
    }

    console.log();
    console.log(\`Upload complete: \${successCount} success, \${errorCount} errors\`);

    if (errorCount > 0) {
        console.error(\`\\nNO ERROR: Failed to upload \${errorCount} machfab capability/capabilities.\`);
        console.error('Macina capability uploads had errors. Check the error messages above for details.');
        console.error('Common issues: missing media URNs, validation failures, network errors, invalid username.');
        process.exit(1);
    }
}

async function authenticate() {
    const data = JSON.stringify({ key: ADMIN_KEY });
    const response = await makeRequest('/api/admin/auth', 'POST', data);
    return response.token;
}

async function uploadCapability(token, capability) {
    const data = JSON.stringify(capability);
    await makeRequest('/api/admin/capabilities', 'POST', data, token);
}

function makeRequest(path, method, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, REGISTRY_URL);

        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = \`Bearer \${token}\`;
        }

        if (data) {
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }

        const req = https.request(url, options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    const parsed = responseData ? JSON.parse(responseData) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(\`HTTP \${res.statusCode}: \${parsed.error || responseData}\`));
                    }
                } catch (error) {
                    reject(new Error(\`Invalid JSON response: \${responseData}\`));
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(data);
        }

        req.end();
    });
}

// Import the strict Cap URN implementation from npm package
const { CapUrn, CapUrnError } = require('capdag');

function formatCapUrn(capUrn) {
    if (typeof capUrn === 'string') {
        try {
            const parsed = CapUrn.fromString(capUrn);
            return parsed.toString();
        } catch (error) {
            if (error instanceof CapUrnError) {
                console.warn(\`Invalid Cap URN string: \${capUrn}\`, error.message);
                return 'cap:unknown';
            }
            throw error;
        }
    }

    if (capUrn && capUrn.tags) {
        try {
            // Use fromTags to properly extract in/out and normalize
            const capUrnObj = CapUrn.fromTags(capUrn.tags);
            return capUrnObj.toString();
        } catch (error) {
            if (error instanceof CapUrnError) {
            console.warn(\`Invalid Cap URN tags:\`, capUrn.tags, error);
            return 'cap:unknown';
            }
            throw error;
        }
    }

    return 'cap:unknown';
}

if (require.main === module) {
    uploadMacinaCapabilities().catch(error => {
        console.error('Upload failed:', error);
        process.exit(1);
    });
}

module.exports = { uploadMacinaCapabilities, formatCapUrn };
`;
}

// ============================================================================
// MEDIA SPEC LOADING
// ============================================================================

/**
 * Load and validate standard media spec definitions
 * @param {object} opts - Options
 * @param {boolean} opts.quiet - Suppress all output
 * @param {boolean} opts.verbose - Show detailed per-file progress
 */
async function loadStandardMediaSpecs(opts = {}) {
    const { quiet = false, verbose = false } = opts;
    const log = quiet ? () => {} : console.log.bind(console);

    const standardDir = __dirname;
    const mediaDir = path.join(standardDir, 'media');
    const schemaPath = path.join(standardDir, 'media.schema.json');

    // Load JSON schema
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);

    // Find all TOML files in media directory
    const mediaTomlFiles = fs.existsSync(mediaDir)
        ? fs.readdirSync(mediaDir).filter(file => file.endsWith('.toml')).sort()
        : [];

    if (mediaTomlFiles.length === 0) {
        log('No media spec TOML files found.');
        return { mediaSpecs: [], errors: [] };
    }

    log(`Found ${mediaTomlFiles.length} media spec definitions`);
    if (verbose) {
        mediaTomlFiles.forEach(file => log(`  - media/${file}`));
        log();
    }

    const mediaSpecs = [];
    const errors = [];

    for (const file of mediaTomlFiles) {
        const result = processMediaSpecTomlFile(path.join(mediaDir, file), `media/${file}`, validate, { quiet, verbose });
        if (result.error) {
            errors.push(result.error);
        } else if (result.mediaSpecs) {
            // Multiple specs from one file (using [[media_spec]] array syntax)
            mediaSpecs.push(...result.mediaSpecs);
        } else if (result.mediaSpec) {
            // Single spec (traditional format)
            mediaSpecs.push(result.mediaSpec);
        }
    }

    log(`Media specs loaded: ${mediaSpecs.length}`);
    if (errors.length > 0) {
        log(`Media spec errors: ${errors.length}`);
    }

    return { mediaSpecs, errors };
}

/**
 * Derive a filename-safe slug from a media URN
 * e.g. "media:real;discrete;signed" -> "scalar-real-discrete-signed"
 * e.g. "media:" -> "identity" (special case for identity URN)
 */
function mediaUrnToSlug(urn) {
    if (!urn || typeof urn !== 'string') return 'unknown';
    // Special case: identity URN "media:" becomes "identity"
    if (urn === 'media:') return 'identity';
    // Remove 'media:' prefix, replace semicolons and other separators with dashes
    return urn
        .replace(/^media:/, '')
        .replace(/[;=]/g, '-')
        .replace(/[^a-zA-Z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

/**
 * Process a single media spec TOML file
 * Supports both single-spec format and [[media_spec]] array format
 * FATAL: Any error immediately exits the process
 * @param {object} opts - Options
 * @param {boolean} opts.quiet - Suppress all output
 * @param {boolean} opts.verbose - Show detailed per-file progress
 */
function processMediaSpecTomlFile(filePath, displayName, validate, opts = {}) {
    const { quiet = false, verbose = false } = opts;
    const log = quiet ? () => {} : console.log.bind(console);
    const verboseLog = (quiet || !verbose) ? () => {} : console.log.bind(console);
    const baseName = path.basename(filePath, '.toml');

    try {
        verboseLog(`Processing ${displayName}...`);

        // Parse TOML
        const tomlContent = fs.readFileSync(filePath, 'utf8');
        const parsed = toml.parse(tomlContent);

        // Check if this is the [[media_spec]] array format
        if (parsed.media_spec && Array.isArray(parsed.media_spec)) {
            const specs = [];

            for (let i = 0; i < parsed.media_spec.length; i++) {
                const spec = parsed.media_spec[i];
                const specDisplayName = `${displayName}[${i}]`;

                // Validate each spec against schema
                const valid = validate(spec);
                if (!valid) {
                    console.error(`\nFATAL: Validation failed for ${specDisplayName}:`);
                    validate.errors.forEach(err => {
                        console.error(`   ${err.instancePath || 'root'}: ${err.message}`);
                    });
                    process.exit(1);
                }

                // Use URN-derived slug for unique naming
                const slug = mediaUrnToSlug(spec.urn);
                specs.push({
                    name: slug,
                    file: displayName,
                    spec
                });
                verboseLog(`OK ${specDisplayName} (${spec.urn}) validated successfully`);
            }

            verboseLog(`OK ${displayName} - ${specs.length} media specs validated successfully`);
            return { mediaSpecs: specs };
        }

        // Single spec format (traditional) - validate the whole parsed object
        const valid = validate(parsed);
        if (!valid) {
            console.error(`\nFATAL: Validation failed for ${displayName}:`);
            validate.errors.forEach(err => {
                console.error(`   ${err.instancePath || 'root'}: ${err.message}`);
            });
            process.exit(1);
        }

        verboseLog(`OK ${displayName} validated successfully`);
        return {
            mediaSpec: {
                name: baseName,
                file: displayName,
                spec: parsed
            }
        };

    } catch (error) {
        console.error(`\nFATAL: Error processing ${displayName}:`, error.message);
        if (error.line !== undefined) {
            console.error(`   At line ${error.line}, column ${error.col}`);
        }
        process.exit(1);
    }
}

/**
 * Export media specs as JSON for bundling and upload
 * @param {Array} mediaSpecs - Media specs to export
 * @param {object} opts - Options
 * @param {boolean} opts.verbose - Show detailed export progress
 */
function exportMediaSpecsJson(mediaSpecs, opts = {}) {
    const { verbose = false } = opts;
    const outputDir = path.join(__dirname, '..', 'generated', 'media');
    const rustBundleDir = path.join(__dirname, '..', '..', 'capdag', 'standard', 'media');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    if (!fs.existsSync(rustBundleDir)) {
        fs.mkdirSync(rustBundleDir, { recursive: true });
    }

    if (verbose) console.log('Exporting media specs:');

    // Export individual JSON files
    mediaSpecs.forEach(ms => {
        const jsonPath = path.join(outputDir, `${ms.name}.json`);
        const rustJsonPath = path.join(rustBundleDir, `${ms.name}.json`);
        const jsonContent = JSON.stringify(ms.spec, null, 2);

        fs.writeFileSync(jsonPath, jsonContent);
        fs.writeFileSync(rustJsonPath, jsonContent);
        if (verbose) console.log(`  Exported: ${jsonPath}`);
    });

    // Export combined JSON
    const allSpecs = mediaSpecs.map(ms => ms.spec);
    const combinedPath = path.join(outputDir, 'all-media-specs.json');
    fs.writeFileSync(combinedPath, JSON.stringify(allSpecs, null, 2));
    console.log(`Exported ${mediaSpecs.length} media specs to: ${combinedPath}`);

    // Generate upload script
    const uploadScript = generateMediaSpecUploadScript(mediaSpecs);
    const scriptPath = path.join(outputDir, 'upload-media-specs.js');
    fs.writeFileSync(scriptPath, uploadScript);
    fs.chmodSync(scriptPath, '755');
    if (verbose) console.log(`Generated upload script: ${scriptPath}`);
}

/**
 * Generate script to upload media specs to registry
 */
function generateMediaSpecUploadScript(mediaSpecs) {
    return `#!/usr/bin/env node

// Auto-generated script to upload standard media specs to CAPDAG registry

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const https = require('https');

const REGISTRY_URL = process.env.CAPDAG_REGISTRY_URL || 'https://capdag.com';
const ADMIN_KEY = process.env.CAPDAG_ADMIN_KEY || process.env.ADMIN_PASSWORD;

const mediaSpecs = ${JSON.stringify(mediaSpecs.map(ms => ({ name: ms.name, spec: ms.spec })), null, 2)};

async function uploadMediaSpecs() {
    if (!ADMIN_KEY) {
        console.error('Error: CAPDAG_ADMIN_KEY or ADMIN_PASSWORD environment variable required');
        process.exit(1);
    }

    console.log('Authenticating with registry...');
    const token = await authenticate();

    console.log('Clearing existing media specs...');
    await clearAllMediaSpecs(token);

    console.log('Uploading standard media specs...');
    let successCount = 0;
    let errorCount = 0;

    for (const { name, spec } of mediaSpecs) {
        try {
            await uploadMediaSpec(token, spec);
            console.log(\`OK Uploaded: \${spec.urn}\`);
            successCount++;
        } catch (error) {
            console.error(\`ERR Failed to upload \${spec.urn}:\`, error.message);
            errorCount++;
        }
    }

    console.log();
    console.log(\`Upload complete: \${successCount} success, \${errorCount} errors\`);

    if (errorCount > 0) {
        console.error(\`\\nNO ERROR: Failed to upload \${errorCount} media spec(s).\`);
        console.error('Media spec uploads had errors. This will prevent capability uploads since caps reference media URNs.');
        console.error('Common issues: duplicate URNs, invalid URN format, validation failures, network errors.');
        console.error('Fix the errors above and try again.');
        process.exit(1);
    }
}

async function authenticate() {
    const data = JSON.stringify({ key: ADMIN_KEY });
    const response = await makeRequest('/api/admin/auth', 'POST', data);
    return response.token;
}

async function clearAllMediaSpecs(token) {
    const response = await makeRequest('/api/admin/media/clear', 'POST', null, token);
    console.log(\`  Cleared \${response.deleted_count} media specs\`);
    if (response.error_count > 0) {
        console.warn(\`  Warning: \${response.error_count} errors during clear\`);
    }
}

async function uploadMediaSpec(token, spec) {
    const data = JSON.stringify(spec);
    await makeRequest('/api/admin/media', 'POST', data, token);
}

function makeRequest(path, method, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, REGISTRY_URL);

        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = \`Bearer \${token}\`;
        }

        if (data) {
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }

        const req = https.request(url, options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    const parsed = responseData ? JSON.parse(responseData) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(\`HTTP \${res.statusCode}: \${parsed.error || responseData}\`));
                    }
                } catch (error) {
                    reject(new Error(\`Invalid JSON response: \${responseData}\`));
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(data);
        }

        req.end();
    });
}

if (require.main === module) {
    uploadMediaSpecs().catch(error => {
        console.error('Upload failed:', error);
        process.exit(1);
    });
}

module.exports = { uploadMediaSpecs };
`;
}


// ============================================================================
// VALIDATION RULES (RULE1-RULE12 from Rust validation.rs)
// ============================================================================

/**
 * Detect duplicate cap URNs across all capabilities
 * @param {Array} capabilities - Array of capability objects with urn property
 * @returns {Array} Array of {urn, files} objects for duplicates
 */
function detectDuplicateCapUrns(capabilities) {
    const urnToFiles = new Map();
    for (const cap of capabilities) {
        const urn = cap.urn;
        if (!urnToFiles.has(urn)) {
            urnToFiles.set(urn, []);
        }
        urnToFiles.get(urn).push(cap.file);
    }

    const duplicates = [];
    for (const [urn, files] of urnToFiles) {
        if (files.length > 1) {
            duplicates.push({ urn, files });
        }
    }
    return duplicates;
}

/**
 * Detect duplicate media URNs across all media specs
 * @param {Array} mediaSpecs - Array of media spec objects with spec.urn property
 * @returns {Array} Array of {urn, files} objects for duplicates
 */
function detectDuplicateMediaUrns(mediaSpecs) {
    const urnToFiles = new Map();
    for (const ms of mediaSpecs) {
        const urn = ms.spec.urn;
        if (!urnToFiles.has(urn)) {
            urnToFiles.set(urn, []);
        }
        urnToFiles.get(urn).push(ms.file);
    }

    const duplicates = [];
    for (const [urn, files] of urnToFiles) {
        if (files.length > 1) {
            duplicates.push({ urn, files });
        }
    }
    return duplicates;
}

/**
 * Validate cap args against the 12 validation rules
 * @param {object} cap - Capability object with capability.args
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateCapArgsRules(cap) {
    const errors = [];
    const warnings = [];
    const capUrn = cap.urn;
    const capObj = cap.capability;
    const args = capObj.args || [];

    // RULE1: No duplicate media_urns within a cap's args
    const mediaUrns = new Set();
    for (const arg of args) {
        if (mediaUrns.has(arg.media_urn)) {
            errors.push(`${capUrn}: RULE1 - Duplicate media_urn '${arg.media_urn}'`);
        }
        mediaUrns.add(arg.media_urn);
    }

    // Collect data for cross-arg validation
    const stdinUrns = [];
    const positions = [];
    const cliFlags = [];

    for (const arg of args) {
        const sources = arg.sources || [];

        // RULE2: sources must not be null or empty
        if (!sources || sources.length === 0) {
            errors.push(`${capUrn}: RULE2 - Argument '${arg.media_urn}' has empty sources`);
            continue;
        }

        const sourceTypes = new Set();
        let hasPosition = false;
        let hasCliFlag = false;

        for (const source of sources) {
            // Determine source type
            let sourceType = null;
            if (source.stdin !== undefined) sourceType = 'stdin';
            else if (source.position !== undefined) sourceType = 'position';
            else if (source.cli_flag !== undefined) sourceType = 'cli_flag';

            if (!sourceType) {
                // RULE8: No unknown keys in source objects (unknown key detected)
                errors.push(`${capUrn}: RULE8 - Argument '${arg.media_urn}' has source with unknown keys: ${JSON.stringify(source)}`);
                continue;
            }

            // RULE4: No arg may specify same source type more than once
            if (sourceTypes.has(sourceType)) {
                errors.push(`${capUrn}: RULE4 - Argument '${arg.media_urn}' has duplicate source type '${sourceType}'`);
            }
            sourceTypes.add(sourceType);

            if (sourceType === 'stdin') {
                stdinUrns.push(source.stdin);
            } else if (sourceType === 'position') {
                hasPosition = true;
                positions.push({ position: source.position, media_urn: arg.media_urn });
            } else if (sourceType === 'cli_flag') {
                hasCliFlag = true;
                const flag = source.cli_flag;
                cliFlags.push({ flag, media_urn: arg.media_urn });

                // RULE10: Reserved cli_flags cannot be used
                if (RESERVED_CLI_FLAGS.includes(flag)) {
                    errors.push(`${capUrn}: RULE10 - Argument '${arg.media_urn}' uses reserved cli_flag '${flag}'`);
                }
            }
        }

        // RULE7: No arg may have both position and cli_flag
        if (hasPosition && hasCliFlag) {
            errors.push(`${capUrn}: RULE7 - Argument '${arg.media_urn}' has both position and cli_flag sources`);
        }
    }

    // RULE3: Multiple stdin sources must have identical media_urns
    if (stdinUrns.length > 1) {
        const firstStdin = stdinUrns[0];
        for (let i = 1; i < stdinUrns.length; i++) {
            if (stdinUrns[i] !== firstStdin) {
                errors.push(`${capUrn}: RULE3 - Multiple args have different stdin media_urns: '${firstStdin}' vs '${stdinUrns[i]}'`);
                break;
            }
        }
    }

    // RULE5: No two args may have same position
    const positionSet = new Set();
    for (const { position, media_urn } of positions) {
        if (positionSet.has(position)) {
            errors.push(`${capUrn}: RULE5 - Duplicate position ${position} in argument '${media_urn}'`);
        }
        positionSet.add(position);
    }

    // RULE6: Positions must be sequential (0-based, no gaps)
    if (positions.length > 0) {
        const sortedPositions = [...positions].sort((a, b) => a.position - b.position);
        for (let i = 0; i < sortedPositions.length; i++) {
            if (sortedPositions[i].position !== i) {
                errors.push(`${capUrn}: RULE6 - Position gap - expected ${i} but found ${sortedPositions[i].position}`);
                break;
            }
        }
    }

    // RULE9: No two args may have same cli_flag
    const flagSet = new Set();
    for (const { flag, media_urn } of cliFlags) {
        if (flagSet.has(flag)) {
            errors.push(`${capUrn}: RULE9 - Duplicate cli_flag '${flag}' in argument '${media_urn}'`);
        }
        flagSet.add(flag);
    }

    // RULE11: cli_flag used verbatim as specified - enforced by design
    // RULE12: media_urn is the key, no name field - enforced by schema

    return { errors, warnings };
}

/**
 * Detect generic caps that mask more specific caps with the same (in, out) specs.
 *
 * A "generic" cap has fewer non-directional tags (tags other than 'in' and 'out')
 * than another cap with the same in/out specs. This creates routing ambiguity:
 * the path finder may select the generic cap, but at execution time, routing
 * dispatches to any matching provider (which may expect a different model format).
 *
 * Example:
 *   Generic:  cap:in=media:textable;op=generate_embeddings;out=media:embedding-vector;...
 *   Specific: cap:candle;in=media:textable;ml-model;op=generate_embeddings;out=media:embedding-vector;...
 *   Specific: cap:mlx;in=media:textable;ml-model;op=generate_embeddings;out=media:embedding-vector;...
 *
 * The generic cap lacks 'candle'/'mlx' and 'ml-model' tags. If selected, routing
 * may dispatch to either candle or mlx, but the model-spec argument may not match.
 *
 * Uses CapUrn for proper URN parsing and comparison (never compares URNs as strings).
 *
 * @param {Array} capabilities - Array of capability objects with urn (string) property
 * @returns {Array} Array of masking issues: { generic: {file, urn, tagCount, tags}, masked: [{file, urn, tagCount, tags}] }
 */
function detectGenericCapMasking(capabilities) {
    const { CapUrn } = require('capdag');

    // Group caps by (inSpec, outSpec) using CapUrn for proper parsing
    const byInOut = new Map();

    for (const cap of capabilities) {
        let parsedUrn;
        try {
            parsedUrn = CapUrn.fromString(cap.urn);
        } catch (e) {
            // Skip caps with invalid URNs (should have been caught earlier)
            continue;
        }

        // Get in/out specs using CapUrn accessors
        const inSpec = parsedUrn.getInSpec();
        const outSpec = parsedUrn.getOutSpec();

        if (!inSpec || !outSpec) {
            continue;
        }

        // Get non-directional tags - CapUrn stores them in .tags property
        // (in and out are stored separately in inSpec/outSpec)
        const nonDirectionalTags = parsedUrn.tags || {};

        // Create key from in/out - use canonical string form from CapUrn
        // We group by the combination of inSpec and outSpec
        const key = `${inSpec}|||${outSpec}`;

        if (!byInOut.has(key)) {
            byInOut.set(key, []);
        }
        byInOut.get(key).push({
            file: cap.file,
            urn: cap.urn,
            parsedUrn,
            inSpec,
            outSpec,
            tags: nonDirectionalTags,
            tagCount: Object.keys(nonDirectionalTags).length
        });
    }

    const issues = [];

    // For each (in, out) group, check for masking
    for (const [key, group] of byInOut) {
        if (group.length < 2) {
            continue; // No masking possible with single cap
        }

        // For each pair of caps, check if one's tags are a proper subset of the other's
        // A generic cap masks a specific cap iff:
        // - All of generic's tag keys exist in specific with same values
        // - Specific has additional tags that generic doesn't have
        for (let i = 0; i < group.length; i++) {
            const potentialGeneric = group[i];
            const maskedBy = [];

            for (let j = 0; j < group.length; j++) {
                if (i === j) continue;

                const potentialSpecific = group[j];

                // Check if potentialGeneric's tags are a proper subset of potentialSpecific's tags
                const genericTags = potentialGeneric.tags;
                const specificTags = potentialSpecific.tags;

                // All generic tags must exist in specific with same value
                let isSubset = true;
                for (const [key, value] of Object.entries(genericTags)) {
                    if (specificTags[key] !== value) {
                        isSubset = false;
                        break;
                    }
                }

                // Must be proper subset (specific has more tags)
                const isProperSubset = isSubset &&
                    Object.keys(specificTags).length > Object.keys(genericTags).length;

                if (isProperSubset) {
                    maskedBy.push(potentialSpecific);
                }
            }

            if (maskedBy.length > 0) {
                issues.push({
                    generic: {
                        file: potentialGeneric.file,
                        urn: potentialGeneric.urn,
                        tagCount: potentialGeneric.tagCount,
                        tags: Object.keys(potentialGeneric.tags)
                    },
                    masked: maskedBy.map(s => ({
                        file: s.file,
                        urn: s.urn,
                        tagCount: s.tagCount,
                        tags: Object.keys(s.tags)
                    }))
                });
            }
        }
    }

    // Deduplicate issues (same generic cap may be found multiple times)
    const seen = new Set();
    const dedupedIssues = [];
    for (const issue of issues) {
        const key = issue.generic.urn;
        if (!seen.has(key)) {
            seen.add(key);
            dedupedIssues.push(issue);
        }
    }

    return dedupedIssues;
}

// ============================================================================
// COMMAND: validate
// ============================================================================

/**
 * Run full validation suite with detailed error reporting
 * @param {object} opts - Options
 * @param {boolean} opts.verbose - Show detailed progress
 */
async function runValidate(opts = {}) {
    const { verbose = false } = opts;
    console.log('Running full validation suite...\n');

    const [{ publicCapabilities, machfabCapabilities }, { mediaSpecs }] = await Promise.all([
        loadStandardCapabilities({ verbose }),
        loadStandardMediaSpecs()
    ]);

    const allCapabilities = [...publicCapabilities, ...machfabCapabilities];
    let hasErrors = false;

    console.log('\n--- Duplicate Detection ---\n');

    // Check for duplicate cap URNs
    const dupCapUrns = detectDuplicateCapUrns(allCapabilities);
    if (dupCapUrns.length > 0) {
        hasErrors = true;
        console.error('ERROR: Duplicate cap URNs found:');
        for (const { urn, files } of dupCapUrns) {
            console.error(`  ${urn}`);
            for (const file of files) {
                console.error(`    - ${file}`);
            }
        }
    } else {
        console.log('OK No duplicate cap URNs');
    }

    // Check for duplicate media URNs
    const dupMediaUrns = detectDuplicateMediaUrns(mediaSpecs);
    if (dupMediaUrns.length > 0) {
        hasErrors = true;
        console.error('ERROR: Duplicate media URNs found:');
        for (const { urn, files } of dupMediaUrns) {
            console.error(`  ${urn}`);
            for (const file of files) {
                console.error(`    - ${file}`);
            }
        }
    } else {
        console.log('OK No duplicate media URNs');
    }

    console.log('\n--- Media Spec Required Fields ---\n');

    // Check that all standalone media specs have title
    let mediaSpecErrors = 0;
    for (const ms of mediaSpecs) {
        if (!ms.spec.title) {
            hasErrors = true;
            mediaSpecErrors++;
            console.error(`ERROR: Media spec '${ms.spec.urn}' in ${ms.file} has no title`);
        }
    }

    // Check that all inline media specs in capabilities have title
    for (const cap of allCapabilities) {
        if (cap.capability.media_specs && Array.isArray(cap.capability.media_specs)) {
            for (const spec of cap.capability.media_specs) {
                if (!spec || !spec.urn) continue;
                if (!spec.title) {
                    hasErrors = true;
                    mediaSpecErrors++;
                    console.error(`ERROR: Inline media spec '${spec.urn}' in ${cap.file} has no title`);
                }
            }
        }
    }

    if (mediaSpecErrors === 0) {
        console.log(`OK All media specs have title`);
    }

    console.log('\n--- Args Validation (RULE1-RULE12) ---\n');

    // Validate each capability against RULE1-RULE12
    let ruleErrors = 0;
    for (const cap of allCapabilities) {
        const { errors, warnings } = validateCapArgsRules(cap);
        if (errors.length > 0) {
            hasErrors = true;
            ruleErrors += errors.length;
            for (const err of errors) {
                console.error(`ERROR: ${err}`);
            }
        }
        for (const warn of warnings) {
            console.warn(`WARNING: ${warn}`);
        }
    }
    if (ruleErrors === 0) {
        console.log(`OK All ${allCapabilities.length} capabilities pass RULE1-RULE12`);
    }

    console.log('\n--- Cross-Validation (Media URN References) ---\n');

    // Cross-validate media URN references
    const { errors: crossErrors, localOnlyWarnings } = validateCapMediaReferences(allCapabilities, mediaSpecs);

    if (localOnlyWarnings.length > 0) {
        console.warn('WARNING: Media URNs defined only in capability media_specs (not in global registry):');
        for (const w of localOnlyWarnings) {
            console.warn(`  - ${w.cap}: ${w.local_only_media_urn}`);
        }
    }

    if (crossErrors.length > 0) {
        hasErrors = true;
        console.error('ERROR: Missing media specs referenced by capabilities:');
        for (const e of crossErrors) {
            console.error(`  - ${e.cap}: ${e.missing_media_urn}`);
        }
    } else {
        console.log('OK All media URN references resolve');
    }

    console.log('\n--- Generic Cap Masking Detection ---\n');

    // Detect generic caps that mask more specific ones
    const maskingIssues = detectGenericCapMasking(allCapabilities);
    if (maskingIssues.length > 0) {
        hasErrors = true;
        console.error('ERROR: Generic caps detected that mask more specific caps:');
        console.error('       (Generic caps have fewer tags and create routing ambiguity)\n');
        for (const issue of maskingIssues) {
            console.error(`  GENERIC: ${issue.generic.file}`);
            console.error(`           ${issue.generic.urn}`);
            console.error(`           tags: [${issue.generic.tags.join(', ')}] (${issue.generic.tagCount} non-directional tags)`);
            console.error(`    MASKS:`);
            for (const masked of issue.masked) {
                console.error(`      - ${masked.file}`);
                console.error(`        ${masked.urn}`);
                console.error(`        tags: [${masked.tags.join(', ')}] (${masked.tagCount} non-directional tags)`);
            }
            console.error('');
        }
        console.error('  FIX: Delete the generic cap files, or add distinguishing tags to make them specific.');
    } else {
        console.log('OK No generic cap masking issues found');
    }

    console.log('\n--- Summary ---\n');
    console.log(`Capabilities validated: ${allCapabilities.length}`);
    console.log(`Media specs validated: ${mediaSpecs.length}`);

    if (hasErrors) {
        console.error('\nValidation FAILED');
        process.exit(1);
    } else {
        console.log('\nValidation PASSED');
        process.exit(0);
    }
}

// ============================================================================
// COMMAND: list-urns
// ============================================================================

/**
 * List all defined URNs (cap URNs + media URNs)
 * @param {object} opts - Options
 * @param {boolean} opts.verbose - Show detailed progress
 */
async function runListUrns(opts = {}) {
    const { verbose = false } = opts;
    const [{ publicCapabilities, machfabCapabilities }, { mediaSpecs }] = await Promise.all([
        loadStandardCapabilities({ verbose }),
        loadStandardMediaSpecs({ verbose })
    ]);

    const allCapabilities = [...publicCapabilities, ...machfabCapabilities];

    console.log('=== Cap URNs ===\n');
    for (const cap of allCapabilities) {
        console.log(cap.urn);
    }

    // Collect standalone media URNs
    const standaloneUrns = new Set();
    for (const ms of mediaSpecs) {
        standaloneUrns.add(ms.spec.urn);
    }

    // Collect inline media URNs from capabilities
    const inlineUrns = new Map(); // urn -> [files]
    for (const cap of allCapabilities) {
        if (cap.capability.media_specs && Array.isArray(cap.capability.media_specs)) {
            for (const spec of cap.capability.media_specs) {
                if (!spec || !spec.urn) continue;
                if (!inlineUrns.has(spec.urn)) {
                    inlineUrns.set(spec.urn, []);
                }
                inlineUrns.get(spec.urn).push(cap.file);
            }
        }
    }

    console.log('\n=== Media URNs (standalone) ===\n');
    for (const ms of mediaSpecs) {
        console.log(ms.spec.urn);
    }

    // Show inline-only URNs (not defined as standalone)
    const inlineOnlyUrns = [...inlineUrns.keys()].filter(urn => !standaloneUrns.has(urn));
    if (inlineOnlyUrns.length > 0) {
        console.log('\n=== Media URNs (inline in caps only) ===\n');
        for (const urn of inlineOnlyUrns.sort()) {
            const files = inlineUrns.get(urn);
            console.log(`${urn}`);
            for (const file of files) {
                console.log(`  <- ${file}`);
            }
        }
    }

    const totalMedia = standaloneUrns.size + inlineOnlyUrns.length;
    console.log(`\nTotal: ${allCapabilities.length} cap URNs, ${totalMedia} media URNs (${standaloneUrns.size} standalone, ${inlineOnlyUrns.length} inline-only)`);
}

// ============================================================================
// COMMAND: list-caps
// ============================================================================

/**
 * List caps with their utilized media URNs (tree format)
 * @param {object} opts - Options
 * @param {boolean} opts.verbose - Show detailed progress
 */
async function runListCaps(opts = {}) {
    const { verbose = false } = opts;
    const [{ publicCapabilities, machfabCapabilities }] = await Promise.all([
        loadStandardCapabilities({ verbose }),
        loadStandardMediaSpecs({ verbose })
    ]);

    const allCapabilities = [...publicCapabilities, ...machfabCapabilities];

    for (const cap of allCapabilities) {
        console.log(`${cap.urn}`);
        console.log(`  title: ${cap.capability.title}`);
        console.log(`  command: ${cap.capability.command}`);

        // Collect all media URNs used by this cap
        const mediaUrns = new Set();

        // From urn.tags.in/out
        if (cap.capability.urn && cap.capability.urn.tags) {
            if (cap.capability.urn.tags.in) {
                mediaUrns.add(cap.capability.urn.tags.in);
            }
            if (cap.capability.urn.tags.out) {
                mediaUrns.add(cap.capability.urn.tags.out);
            }
        }

        // From args
        if (cap.capability.args) {
            for (const arg of cap.capability.args) {
                if (arg.media_urn) {
                    mediaUrns.add(arg.media_urn);
                }
            }
        }

        // From output
        if (cap.capability.output && cap.capability.output.media_urn) {
            mediaUrns.add(cap.capability.output.media_urn);
        }

        if (mediaUrns.size > 0) {
            console.log('  media_urns:');
            for (const urn of mediaUrns) {
                console.log(`    - ${urn}`);
            }
        }

        console.log('');
    }

    console.log(`Total: ${allCapabilities.length} capabilities`);
}

// ============================================================================
// COMMAND: export-graph
// ============================================================================

/**
 * Build graph from capabilities (nodes = media URNs, edges = caps)
 * @returns {{ nodes: Set<string>, edges: Array, nodeLabels: Map<string, string> }}
 */
async function buildCapGraph(opts = {}) {
    const { quiet = false } = opts;
    const [{ publicCapabilities, machfabCapabilities }, { mediaSpecs }] = await Promise.all([
        loadStandardCapabilities({ quiet }),
        loadStandardMediaSpecs({ quiet })
    ]);

    const allCapabilities = [...publicCapabilities, ...machfabCapabilities];

    // Build map of URN -> title from standalone media specs
    const nodeLabels = new Map();
    for (const ms of mediaSpecs) {
        const urn = ms.spec.urn;
        if (!ms.spec.title) {
            console.error(`FATAL: Media spec '${urn}' in ${ms.file} has no title`);
            process.exit(1);
        }
        nodeLabels.set(urn, ms.spec.title);
    }

    // Also collect media specs defined inline in capabilities
    for (const cap of allCapabilities) {
        if (cap.capability.media_specs && Array.isArray(cap.capability.media_specs)) {
            for (const spec of cap.capability.media_specs) {
                if (!spec || !spec.urn) continue;
                if (!nodeLabels.has(spec.urn)) {
                    if (!spec.title) {
                        console.error(`FATAL: Inline media spec '${spec.urn}' in ${cap.file} has no title`);
                        process.exit(1);
                    }
                    nodeLabels.set(spec.urn, spec.title);
                }
            }
        }
    }

    const nodes = new Set();
    const edges = [];
    const unresolvedUrns = [];

    for (const cap of allCapabilities) {
        const capUrn = cap.urn;
        const title = cap.capability.title || cap.capability.command || capUrn;

        // Get in/out from urn.tags
        let inSpec = null;
        let outSpec = null;

        if (cap.capability.urn && cap.capability.urn.tags) {
            inSpec = cap.capability.urn.tags.in;
            outSpec = cap.capability.urn.tags.out;
        }

        if (inSpec && outSpec) {
            // Fail hard if media URNs cannot be resolved
            if (!nodeLabels.has(inSpec)) {
                unresolvedUrns.push({ urn: inSpec, cap: capUrn, file: cap.file, field: 'urn.tags.in' });
            }
            if (!nodeLabels.has(outSpec)) {
                unresolvedUrns.push({ urn: outSpec, cap: capUrn, file: cap.file, field: 'urn.tags.out' });
            }

            nodes.add(inSpec);
            nodes.add(outSpec);
            edges.push({ from: inSpec, to: outSpec, cap: capUrn, title });
        }
    }

    if (unresolvedUrns.length > 0) {
        console.error('FATAL: Unresolved media URNs (not defined in standalone media/*.toml or capability media_specs):');
        for (const { urn, cap, file, field } of unresolvedUrns) {
            console.error(`  - ${urn} (referenced by ${field} in ${file})`);
        }
        process.exit(1);
    }

    return { nodes, edges, nodeLabels };
}

// Color palette for graph edges (bright colors for dark background)
const GRAPH_COLORS = [
    '#ff6b6b', // coral red
    '#4ecdc4', // teal
    '#ffe66d', // yellow
    '#95e1d3', // mint
    '#f38181', // salmon
    '#aa96da', // lavender
    '#fcbad3', // pink
    '#a8d8ea', // light blue
    '#ff9f43', // orange
    '#78e08f', // green
    '#e056fd', // magenta
    '#7bed9f', // light green
    '#70a1ff', // sky blue
    '#eccc68', // gold
    '#ff7f50', // coral
    '#00d2d3', // cyan
    '#ff9ff3', // light pink
    '#54a0ff', // blue
    '#5f27cd', // purple
    '#01a3a4', // dark cyan
    '#f368e0', // hot pink
    '#ff6348', // tomato
    '#7158e2', // violet
    '#3ae374', // bright green
    '#ffaf40', // light orange
    '#17c0eb', // bright cyan
    '#c44569', // raspberry
    '#cf6a87', // dusty rose
    '#574b90', // indigo
    '#78e08f', // emerald
    '#e77f67', // terra cotta
    '#786fa6', // purple grey
    '#63cdda', // turquoise
    '#f8a5c2', // blush
    '#f5cd79', // sand
    '#ea8685', // light coral
    '#596275', // slate
    '#303952', // dark slate
    '#e15f41', // burnt orange
    '#c8d6e5', // light grey blue
];

/**
 * Convert graph to DOT format
 * @param {{ nodes: Set<string>, edges: Array, nodeLabels: Map<string, string> }} graph
 * @returns {string} DOT format string
 */
function graphToDot(graph) {
    const lines = [];
    lines.push('digraph CapGraph {');
    lines.push('  rankdir=LR;');
    lines.push('  bgcolor="#1a1a2e";');
    lines.push('  dpi=200;');
    lines.push('  node [shape=box, fontname="Helvetica", style="filled,rounded", fillcolor="#16213e", fontcolor="#eaeaea", color="#4a4a6a", fontsize=12];');
    lines.push('  edge [fontname="Helvetica", fontsize=10];');
    lines.push('');

    // Escape strings for DOT
    const escapeLabel = (s) => s.replace(/"/g, '\\"');
    const nodeId = (s) => `"${escapeLabel(s)}"`;

    // Add nodes with human-readable labels
    for (const node of graph.nodes) {
        const label = graph.nodeLabels.get(node) || node;
        lines.push(`  ${nodeId(node)} [label="${escapeLabel(label)}"];`);
    }
    lines.push('');

    // Assign colors to each unique capability
    const capToColor = new Map();
    let colorIndex = 0;
    for (const edge of graph.edges) {
        if (!capToColor.has(edge.cap)) {
            capToColor.set(edge.cap, GRAPH_COLORS[colorIndex % GRAPH_COLORS.length]);
            colorIndex++;
        }
    }

    // Add edges with colors
    for (const edge of graph.edges) {
        const label = escapeLabel(edge.title);
        const color = capToColor.get(edge.cap);
        lines.push(`  ${nodeId(edge.from)} -> ${nodeId(edge.to)} [label="${label}", color="${color}", fontcolor="${color}"];`);
    }

    lines.push('}');
    return lines.join('\n');
}

/**
 * Export media spec graph to DOT format (optionally render to PNG)
 */
async function runExportGraph(options) {
    // Use quiet mode when outputting DOT to stdout to avoid mixing progress with DOT output
    const quietForStdout = !options.output && !options.render;
    const graph = await buildCapGraph({ quiet: quietForStdout });
    const dot = graphToDot(graph);

    if (options.output) {
        fs.writeFileSync(options.output, dot);
        console.error(`DOT graph written to ${options.output}`);
    } else if (!options.render) {
        // Output to stdout
        console.log(dot);
    }

    if (options.render) {
        const dotPath = options.output || '/tmp/capdag-graph.dot';
        if (!options.output) {
            fs.writeFileSync(dotPath, dot);
        }

        const pngPath = options.png || 'cap-graph.ignore.png';

        try {
            execSync(`dot -Tpng -Gdpi=200 "${dotPath}" -o "${pngPath}"`, { stdio: 'inherit' });
            console.error(`PNG rendered to ${pngPath}`);
        } catch (err) {
            console.error('ERROR: Failed to render PNG. Make sure graphviz is installed.');
            console.error('       Install with: brew install graphviz (macOS) or apt-get install graphviz (Linux)');
            process.exit(1);
        }

        // Clean up temp file if we created one
        if (!options.output) {
            fs.unlinkSync(dotPath);
        }
    }
}

// ============================================================================
// COMMAND: (default) - Upload flow
// ============================================================================

/**
 * Run the existing upload flow (refactored from original main block)
 * @param {object} opts - Options
 * @param {boolean} opts.verbose - Show detailed progress
 */
/**
 * Load, validate, export JSONs, and copy to local destinations.
 * Used by both `install` (standalone) and `upload` (as first step).
 */
async function runInstall(opts = {}) {
    const { verbose = false } = opts;
    const [{ publicCapabilities, machfabCapabilities }, { mediaSpecs, errors: mediaErrors }] = await Promise.all([
        loadStandardCapabilities({ verbose }),
        loadStandardMediaSpecs({ verbose })
    ]);

    console.log();
    console.log('Exporting JSON files...');
    exportCapabilitiesJson(publicCapabilities, machfabCapabilities, { verbose });

    if (mediaSpecs.length > 0) {
        console.log();
        exportMediaSpecsJson(mediaSpecs, { verbose });
    }

    console.log();
    console.log('OK Standard capabilities and media specs loaded and validated successfully!');

    // Cross-validate cap media_urn references against loaded media specs and local tables
    const { errors: crossErrors, localOnlyWarnings } = validateCapMediaReferences(publicCapabilities, mediaSpecs);

    if (localOnlyWarnings.length > 0) {
        console.warn();
        console.warn('WARNING: Media URNs defined only in capability media_specs (not in global registry):');
        console.warn('         These may cause upload failures if the server requires global media specs.');
        localOnlyWarnings.forEach(w => console.warn(`  - ${w.cap}: ${w.local_only_media_urn}`));
    }

    if (crossErrors.length > 0) {
        console.error();
        console.error('Cross-validation errors: missing media specs referenced by capabilities:');
        crossErrors.forEach(e => console.error(`  - ${e.cap}: ${e.missing_media_urn}`));
        process.exit(1);
    }

    // Copy generated JSONs to local destinations if configured
    const capsDestDir = process.env.CAPDAG_DEST_PATH || process.env.CAPDAG_DEFS_DIR;
    const mediaDestDir = process.env.CAPDAG_MEDIA_DEST_PATH || process.env.CAPDAG_MEDIA_DIR || process.env.CAPDAG_MEDIA_CACHE_DIR;

    if (capsDestDir) {
        console.log(`Copying generated capabilities to ${capsDestDir} ...`);
        fs.mkdirSync(capsDestDir, { recursive: true });
        const existingCaps = fs.readdirSync(capsDestDir).filter(f => f.endsWith('.json'));
        for (const f of existingCaps) {
            try { fs.unlinkSync(path.join(capsDestDir, f)); } catch (_) {}
        }
        const capsOutDir = path.join(__dirname, '..', 'generated');
        for (const f of fs.readdirSync(capsOutDir).filter(f => f.endsWith('.json') && f !== 'all-capabilities.json')) {
            fs.copyFileSync(path.join(capsOutDir, f), path.join(capsDestDir, f));
        }
    }

    if (mediaDestDir) {
        if (mediaDestDir === (process.env.CAPDAG_DEST_PATH || process.env.CAPDAG_DEFS_DIR)) {
            console.warn(`WARNING: CAPDAG_MEDIA_DEST_PATH equals CAPDAG_DEST_PATH; skipping media spec copy to avoid polluting caps directory.`);
        } else {
            console.log(`Copying generated media specs to ${mediaDestDir} ...`);
            fs.mkdirSync(mediaDestDir, { recursive: true });
            const existingMedia = fs.readdirSync(mediaDestDir).filter(f => f.endsWith('.json'));
            for (const f of existingMedia) {
                try { fs.unlinkSync(path.join(mediaDestDir, f)); } catch (_) {}
            }
            const mediaOutDir = path.join(__dirname, '..', 'generated', 'media');
            if (fs.existsSync(mediaOutDir)) {
                for (const f of fs.readdirSync(mediaOutDir).filter(f => f.endsWith('.json') && f !== 'all-media-specs.json')) {
                    fs.copyFileSync(path.join(mediaOutDir, f), path.join(mediaDestDir, f));
                }
            }
        }
    }

    // Copy all generated JSONs (including all-capabilities.json) to capdag-dot-com if configured
    const dotComDestDir = process.env.CAPDAG_DOT_COM_DEST_PATH;
    if (dotComDestDir) {
        console.log(`Copying generated files to ${dotComDestDir} ...`);
        fs.mkdirSync(dotComDestDir, { recursive: true });
        const existingFiles = fs.readdirSync(dotComDestDir).filter(f => f.endsWith('.json'));
        for (const f of existingFiles) {
            try { fs.unlinkSync(path.join(dotComDestDir, f)); } catch (_) {}
        }
        const capsOutDir = path.join(__dirname, '..', 'generated');
        for (const f of fs.readdirSync(capsOutDir).filter(f => f.endsWith('.json'))) {
            fs.copyFileSync(path.join(capsOutDir, f), path.join(dotComDestDir, f));
        }
    }

    return { publicCapabilities, machfabCapabilities, mediaSpecs };
}

async function runUpload(opts = {}) {
    const { verbose = false } = opts;
    const { publicCapabilities, machfabCapabilities, mediaSpecs } = await runInstall({ verbose });

    const adminKey = process.env.CAPDAG_ADMIN_KEY || process.env.ADMIN_PASSWORD;
    const MACINA_USERNAME = process.env.MACINA_USERNAME;

    if (!adminKey) {
        console.log();
        console.log('Next steps for PUBLIC capabilities:');
        console.log('1. Review generated JSON files in the generated/ directory');
        console.log('2. Set CAPDAG_ADMIN_KEY environment variable');
        console.log('3. Run: node generated/upload-standards.js');
        console.log();
        console.log('For MACINA-SPECIFIC capabilities:');
        console.log('1. JSON files are in generated/machfab/');
        console.log('2. Set MACINA_USERNAME to the username to register under');
        console.log('3. Set CAPDAG_ADMIN_KEY environment variable');
        console.log('4. Run: node generated/machfab/upload-machfab-caps.js');
        return;
    }

    console.log();
    console.log('ADMIN_PASSWORD is set - running full upload workflow...');

    // Bulk import media specs then caps via new API endpoints
    const REGISTRY_URL = process.env.CAPDAG_REGISTRY_URL || 'https://capdag.com';
    const ADMIN_KEY = process.env.CAPDAG_ADMIN_KEY || process.env.ADMIN_PASSWORD;
    if (!ADMIN_KEY) {
        throw new Error('CAPDAG_ADMIN_KEY (or ADMIN_PASSWORD) required for bulk import');
    }
    const https = require('https');
    const token = (await (async function authenticate() {
        const data = JSON.stringify({ key: ADMIN_KEY });
        const res = await makeRequest('/api/admin/auth', 'POST', data);
        return res.token;
    })());

    function makeRequest(reqPath, method, data = null, authToken = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(reqPath, REGISTRY_URL);
            const options = { method, headers: { 'Content-Type': 'application/json' } };
            if (authToken) options.headers['Authorization'] = `Bearer ${authToken}`;
            if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
            const req = https.request(url, options, (res) => {
                let responseData = '';
                res.on('data', c => responseData += c);
                res.on('end', () => {
                    try { const parsed = responseData ? JSON.parse(responseData) : {}; if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed); else reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || responseData}`)); } catch (e) { reject(new Error(`Invalid JSON response: ${responseData}`)); }
                });
            });
            req.on('error', reject); if (data) req.write(data); req.end();
        });
    }

    const BULK_BATCH_SIZE = parseInt(process.env.CAPDAG_BULK_BATCH_SIZE || process.env.CAPDAG_BATCH_SIZE || '50', 10) || 50;
    const BATCH_DELAY_MS = parseInt(process.env.CAPDAG_BATCH_DELAY_MS || '0', 10) || 0;
    const ITEM_DELAY_MS = parseInt(process.env.CAPDAG_ITEM_DELAY_MS || '50', 10) || 50;
    const MAX_RETRIES = parseInt(process.env.CAPDAG_MAX_RETRIES || '3', 10) || 3;

    // Helper to sleep for a given number of milliseconds
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function bulkPost(bulkPath, key, items, authToken, batchSize = BULK_BATCH_SIZE, extra = {}, verbose = false) {
        const total = items.length;
        const batches = Math.ceil(total / batchSize);
        let totalCreated = 0;
        let totalErrors = 0;
        const allMissingMedia = {};
        const verboseLog = verbose ? console.log.bind(console) : () => {};

        // Progress bar helper - fits in 60 chars to avoid line wrapping
        const updateProgress = (batchNum) => {
            const percent = Math.round((batchNum / batches) * 100);
            const barWidth = 20;
            const filled = Math.round((batchNum / batches) * barWidth);
            const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
            const status = `${totalCreated}/${totalErrors}`;
            process.stdout.write(`\r[${bar}] ${percent.toString().padStart(3)}% ${status}`);
        };

        for (let i = 0; i < items.length; i += batchSize) {
            const slice = items.slice(i, i + batchSize);
            const payload = { ...extra }; payload[key] = slice;

            // Retry logic with exponential backoff for rate limiting
            let response;
            let lastError;
            for (let retry = 0; retry < MAX_RETRIES; retry++) {
                try {
                    response = await makeRequest(bulkPath, 'POST', JSON.stringify(payload), authToken);
                    break; // Success, exit retry loop
                } catch (err) {
                    lastError = err;
                    const is401or429 = err.message.includes('401') || err.message.includes('429');
                    if (is401or429 && retry < MAX_RETRIES - 1) {
                        const backoffMs = Math.pow(2, retry) * 1000 + Math.random() * 1000;
                        verboseLog(`  Rate limited, retrying in ${Math.round(backoffMs)}ms (attempt ${retry + 2}/${MAX_RETRIES})...`);
                        await sleep(backoffMs);
                    } else {
                        throw err; // Re-throw on last retry or non-rate-limit error
                    }
                }
            }

            if (!response) {
                throw lastError || new Error('No response from server');
            }

            totalCreated += response.created_count || 0;
            totalErrors += response.error_count || 0;

            // Collect missing media URNs
            if (response.missing_media) {
                Object.assign(allMissingMedia, response.missing_media);
            }

            // Log errors from this batch
            if (response.results?.errors?.length > 0) {
                // Clear progress line if there are errors
                if (!verbose) process.stdout.write('\r' + ' '.repeat(50) + '\r');
                for (const err of response.results.errors) {
                    const urnStr = typeof err.urn === 'string' ? err.urn : JSON.stringify(err.urn) || 'unknown';
                    console.error(`  ERR ${urnStr}: ${err.error}`);
                }
            }

            // Update progress
            const batchNum = Math.floor(i / batchSize) + 1;
            if (verbose) {
                verboseLog(`  uploaded batch ${batchNum}/${batches} (created: ${response.created_count || 0}, errors: ${response.error_count || 0})`);
            } else {
                updateProgress(batchNum);
            }

            // Delay between batches if configured (to avoid rate limiting)
            if (BATCH_DELAY_MS > 0 && i + batchSize < items.length) {
                await sleep(BATCH_DELAY_MS);
            }
        }

        // Clear progress line and print final newline
        if (!verbose) {
            process.stdout.write('\r' + ' '.repeat(50) + '\r');
            console.log(`✓ ${totalCreated} created, ${totalErrors} errors`);
        }
        // Report missing media summary
        const missingKeys = Object.keys(allMissingMedia);
        if (missingKeys.length > 0) {
            console.error(`  Missing media URNs prevented ${missingKeys.length} capability uploads:`);
            for (const [capUrn, missing] of Object.entries(allMissingMedia)) {
                console.error(`    ${capUrn}: ${missing.join(', ')}`);
            }
        }
        if (totalErrors > 0) {
            throw new Error(`Bulk upload had ${totalErrors} errors`);
        }
        return totalCreated;
    }

    // Prepare payloads
    const mediaItems = mediaSpecs.map(ms => ms.spec);
    const capItems = publicCapabilities.map(c => c.capability);

    // Clear existing in registry before uploading new ones
    if (mediaItems.length > 0) {
        console.log('Clearing existing media specs in registry...');
        await makeRequest('/api/admin/media/clear', 'POST', null, token);
    }
    console.log('Clearing existing capabilities in registry...');
    await makeRequest('/api/admin/capabilities/clear', 'POST', null, token);

    if (mediaItems.length > 0) {
        console.log('Bulk importing media specs...');
        await bulkPost('/api/admin/media/bulk', 'specs', mediaItems, token, BULK_BATCH_SIZE, { item_delay_ms: ITEM_DELAY_MS }, verbose);
    }

    console.log('Bulk importing public capabilities...');
    await bulkPost('/api/admin/capabilities/bulk', 'capabilities', capItems, token, BULK_BATCH_SIZE, { item_delay_ms: ITEM_DELAY_MS }, verbose);

    // Bulk import machfab user-registered capabilities if username is set
    const machfabBulkUsername = process.env.MACINA_USERNAME;
    const machfabItems = (machfabCapabilities || []).map(c => c.capability);
    if (machfabBulkUsername && machfabItems.length > 0) {
        console.log();
        console.log(`Bulk importing MACINA capabilities registered to '${machfabBulkUsername}' ...`);
        await bulkPost('/api/admin/capabilities/bulk', 'capabilities', machfabItems, token, 50, { register_as_username: machfabBulkUsername }, verbose);
    }

    // Step 3: If MACINA_USERNAME is set, upload machfab caps
    if (MACINA_USERNAME && machfabCapabilities.length > 0) {
        console.log();
        console.log(`MACINA_USERNAME is set to "${MACINA_USERNAME}" - uploading machfab capabilities...`);
        const machfabScriptPath = path.join(__dirname, '..', 'generated', 'machfab', 'upload-machfab-caps.js');
        const { uploadMacinaCapabilities } = require(machfabScriptPath);
        await uploadMacinaCapabilities();
    }

    // Trigger registry view rebuild (runs in background on server)
    console.log();
    console.log('Triggering registry view rebuild...');
    await makeRequest('/api/admin/rebuild-view', 'POST', null, ADMIN_KEY);
    console.log('Registry view rebuild started (runs in background)');

    console.log();
    console.log('OK All uploads completed successfully!');
}

async function runRebuildView() {
    const https = require('https');
    const REGISTRY_URL = process.env.CAPDAG_REGISTRY_URL || 'https://capdag.com';
    const ADMIN_KEY = process.env.CAPDAG_ADMIN_KEY || process.env.ADMIN_PASSWORD;
    if (!ADMIN_KEY) {
        throw new Error('CAPDAG_ADMIN_KEY (or ADMIN_PASSWORD) required');
    }

    function makeRequest(reqPath, method, data = null, authToken = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(reqPath, REGISTRY_URL);
            const options = { method, headers: { 'Content-Type': 'application/json' } };
            if (authToken) options.headers['Authorization'] = `Bearer ${authToken}`;
            if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
            const req = https.request(url, options, (res) => {
                let responseData = '';
                res.on('data', c => responseData += c);
                res.on('end', () => {
                    try { const parsed = responseData ? JSON.parse(responseData) : {}; if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed); else reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || responseData}`)); } catch (e) { reject(new Error(`Invalid JSON response: ${responseData}`)); }
                });
            });
            req.on('error', reject); if (data) req.write(data); req.end();
        });
    }

    // api-admin.js verifies the raw admin key as bearer token directly
    console.log('Triggering registry view rebuild...');
    await makeRequest('/api/admin/rebuild-view', 'POST', null, ADMIN_KEY);
    console.log('Registry view rebuild started (runs in background)');
}

// ============================================================================
// MAIN COMMAND DISPATCHER
// ============================================================================

/**
 * Main entry point - dispatches to appropriate command handler
 */
async function main() {
    const args = process.argv.slice(2);
    const { command, options } = parseOptions(args);

    // Handle help flag
    if (options.help) {
        printHelp();
        process.exit(0);
    }

    switch (command) {
        case 'validate':
            await runValidate({ verbose: options.verbose });
            break;
        case 'list-urns':
            await runListUrns({ verbose: options.verbose });
            break;
        case 'list-caps':
            await runListCaps({ verbose: options.verbose });
            break;
        case 'export-graph':
            await runExportGraph(options);
            break;
        case 'install':
            await runInstall({ verbose: options.verbose });
            break;
        case 'rebuild-view':
            await runRebuildView();
            break;
        case '':
            // Default: run upload flow
            await runUpload({ verbose: options.verbose });
            break;
        default:
            console.error(`Unknown command: ${command}`);
            console.error('');
            printHelp();
            process.exit(1);
    }
}

// Main execution
if (require.main === module) {
    main().catch(error => {
        console.error('Failed:', error);
        process.exit(1);
    });
}

module.exports = {
    loadStandardCapabilities,
    loadStandardMediaSpecs,
    convertTomlToCapability,
    formatCapUrn,
    // New exports for CLI
    parseOptions,
    detectDuplicateCapUrns,
    detectDuplicateMediaUrns,
    validateCapArgsRules,
    detectGenericCapMasking,
    buildCapGraph,
    graphToDot,
    runValidate,
    runListUrns,
    runListCaps,
    runExportGraph,
    runUpload
};
