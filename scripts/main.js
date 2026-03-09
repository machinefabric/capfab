// CAPDAG Registry Main JavaScript

// API Base URL - adjust for production
const API_BASE = '';

// Capability lookup functionality
async function lookupCapability() {
    const input = document.getElementById('capurn-input');
    const resultDiv = document.getElementById('lookup-result');
    const urn = input.value.trim();
    
    if (!urn) {
        showResult('Please enter a CAPURN to look up.', false);
        return;
    }
    
    // Use strict validation from our JavaScript implementation
    try {
        CapUrn.fromString(urn);
    } catch (error) {
        if (error instanceof CapUrnError) {
            showResult(`Invalid CAPURN: ${error.message}`, false);
            return;
        }
        showResult('CAPURN validation error', false);
        return;
    }
    
    try {
        showResult('Looking up capability...', true);
        
        // Use the CAPURN as-is for the API path
        const response = await fetch(`${API_BASE}/${urn}`);
        
        if (response.ok) {
            const capability = await response.json();
            showJsonResult(capability);
        } else if (response.status === 404) {
            showResult('Capability not found in registry.', false);
        } else {
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            showResult(`Error: ${errorData.error || response.statusText}`, false);
        }
    } catch (error) {
        console.error('Lookup error:', error);
        showResult(`Error: ${error.message}`, false);
    }
}

function showResult(text, success) {
    const resultDiv = document.getElementById('lookup-result');
    resultDiv.textContent = text;
    resultDiv.className = `lookup-result show ${success ? 'success' : 'error'}`;
}

function showJsonResult(data) {
    const resultDiv = document.getElementById('lookup-result');
    resultDiv.innerHTML = createJsonViewer(data);
    resultDiv.className = 'lookup-result show success json-viewer';
}

function createJsonViewer(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    
    if (obj === null) {
        return `<span class="json-null">null</span>`;
    }
    
    if (typeof obj === 'string') {
        return `<span class="json-string">"${escapeHtml(obj)}"</span>`;
    }
    
    if (typeof obj === 'number') {
        return `<span class="json-number">${obj}</span>`;
    }
    
    if (typeof obj === 'boolean') {
        return `<span class="json-boolean">${obj}</span>`;
    }
    
    if (Array.isArray(obj)) {
        if (obj.length === 0) {
            return '[]';
        }
        
        const items = obj.map(item => 
            `${spaces}  ${createJsonViewer(item, indent + 1)}`
        ).join(',\n');
        
        return `[\n${items}\n${spaces}]`;
    }
    
    if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        if (keys.length === 0) {
            return '{}';
        }
        
        const items = keys.map(key => 
            `${spaces}  <span class="json-key">"${escapeHtml(key)}"</span>: ${createJsonViewer(obj[key], indent + 1)}`
        ).join(',\n');
        
        return `{\n${items}\n${spaces}}`;
    }
    
    return String(obj);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Create capability card element
function createCapabilityCard(capability) {
    const card = document.createElement('div');
    card.className = 'capability-card';

    const urnString = formatCapUrn(capability.urn);
    const title = capability.title || 'Untitled Capability';
    const description = capability.cap_description || 'No description provided';
    const mediaSpecs = capability.media_specs || {};

    // Create inputs visualization
    const inputsHtml = createInputsVisualization(capability.args, mediaSpecs);

    // Create outputs visualization
    const outputsHtml = createOutputsVisualization(capability.output, mediaSpecs);
    
    card.innerHTML = `
        <div class="capability-header">
            <div class="capability-urn">${urnString}</div>
        </div>
        
        <div class="capability-body">
            <div class="capability-inputs">
                <div class="io-header">
                    <span class="io-direction">IN</span>
                    <span class="io-label">Inputs</span>
                </div>
                <div class="io-list">
                    ${inputsHtml}
                </div>
            </div>
            
            <div class="capability-core">
            	<div class="capability-title">${title}</div>
                <div class="capability-description">${description}</div>
				<div class="capability-command">
					<code>${capability.command}</code>
				</div>
            </div>
            
            <div class="capability-outputs">
                <div class="io-header">
                    <span class="io-label">Outputs</span>
                    <span class="io-direction">OUT</span>
                </div>
                <div class="io-list">
                    ${outputsHtml}
                </div>
            </div>
        </div>
        
        <div class="capability-footer">
            <div class="capability-stats">
                ${getCapabilityStats(capability)}
            </div>
        </div>
    `;
    
    card.addEventListener('click', (e) => {
        // Don't trigger card click if clicking on expandable items
        if (e.target.closest('.expand-btn')) {
            e.stopPropagation();
            return;
        }
        if (e.target.closest('.io-item.expandable')) {
            e.stopPropagation();
            return;
        }
        
        document.getElementById('capurn-input').value = urnString;
        lookupCapability();
        document.querySelector('#lookup-result').scrollIntoView({ behavior: 'smooth' });
    });
    
    // Add expand functionality
    setupExpandableItems(card);
    
    return card;
}

// Create inputs visualization
function createInputsVisualization(args, mediaSpecs) {
    if (!args || !Array.isArray(args) || args.length === 0) {
        return '<div class="io-item io-empty">No inputs</div>';
    }

    const inputs = [];

    // Process args array
    args.forEach((arg, index) => {
        const isRequired = arg.required !== undefined ? arg.required : false;
        inputs.push(createArgumentVisualization(arg, isRequired, mediaSpecs, index));
    });

    return inputs.length > 0 ? inputs.join('') : '<div class="io-item io-empty">No inputs</div>';
}

// Create single argument visualization
function createArgumentVisualization(arg, isRequired, mediaSpecs, index) {
    const requiredClass = isRequired ? 'required' : 'optional';

    // Format media URN tags for display
    const mediaUrnDisplay = formatMediaUrnForDisplay(arg.media_urn);

    // Get schema from media_specs table
    const schema = getSchemaFromMediaSpecs(arg.media_urn, mediaSpecs);
    const hasSchema = schema !== null;
    const schemaIndicator = hasSchema ? '<span class="schema-indicator" title="Schema validated">S</span>' : '';

    // Generate a name from sources or use generic name
    const argName = getArgName(arg, index);

    return `
        <div class="io-item io-input ${requiredClass}" title="${arg.arg_description || argName}">
            <div class="io-type">
                <div class="media-tags">${mediaUrnDisplay}</div>
            </div>
            <div class="io-name">${argName}</div>
            ${schemaIndicator}
            ${isRequired ? '<span class="required-indicator">REQ</span>' : '<span class="optional-indicator">OPT</span>'}
        </div>
    `;
}

// Generate argument name from sources
function getArgName(arg, index) {
    if (!arg.sources || arg.sources.length === 0) {
        return `arg${index}`;
    }

    const source = arg.sources[0];
    if (source.stdin) {
        return 'stdin';
    } else if (source.position !== undefined) {
        return `arg${source.position}`;
    } else if (source.cli_flag) {
        return source.cli_flag;
    }

    return `arg${index}`;
}

// Create outputs visualization
function createOutputsVisualization(output, mediaSpecs) {
    if (!output) {
        return '<div class="io-item io-empty">No output defined</div>';
    }

    // Format media URN tags for display
    const mediaUrnDisplay = formatMediaUrnForDisplay(output.media_urn);

    // Get schema from media_specs table
    const schema = getSchemaFromMediaSpecs(output.media_urn, mediaSpecs);
    const hasSchema = schema !== null;
    const schemaIndicator = hasSchema ? '<span class="schema-indicator" title="Schema validated">S</span>' : '';

    return `
        <div class="io-item io-output" title="${output.output_description}">
            <div class="io-type">
                <div class="media-tags">${mediaUrnDisplay}</div>
            </div>
            <div class="io-name">result</div>
            ${schemaIndicator}
        </div>
    `;
}

// Format media URN for display - show all tags in canonical order
// Omit media: prefix, change = to :, each tag on new line
// Uses capdag TaggedUrn to ensure canonical ordering
function formatMediaUrnForDisplay(mediaUrn) {
    if (!mediaUrn) {
        throw new Error('Media URN is required');
    }

    try {
        // Parse to canonical form using capdag TaggedUrn
        const parsed = TaggedUrn.fromString(mediaUrn);
        const canonical = parsed.toString();

        // Remove media: prefix
        let urnPart = canonical.replace(/^media:/, '');

        // Split by semicolon to get tags in canonical order
        const tags = urnPart.split(';');

        // Format each tag: change = to :
        const formattedTags = tags.map(tag => {
            if (tag.includes('=')) {
                return tag.replace('=', ': ');
            } else {
                return tag;
            }
        });

        // Join with line breaks
        return formattedTags.join('<br>');
    } catch (error) {
        throw new Error(`Cannot parse media URN '${mediaUrn}': ${error.message}`);
    }
}

// Get schema for a spec ID using capdag-js resolveMediaUrn
function getSchemaFromMediaSpecs(mediaSpec, mediaSpecs) {
    if (!mediaSpec) {
        return null;
    }

    // Use resolveMediaUrn from capdag-js - this handles both built-in and custom specs
    const resolved = resolveMediaUrn(mediaSpec, mediaSpecs || {});

    // Return the schema from the resolved MediaSpec (may be null for built-in specs)
    return resolved.schema || null;
}

// Get capability statistics
function getCapabilityStats(capability) {
    const stats = [];
    const mediaSpecs = capability.media_specs || {};

    // Count inputs from args array
    const totalInputs = (capability.args || []).length;

    if (totalInputs > 0) {
        stats.push(`${totalInputs} input${totalInputs > 1 ? 's' : ''}`);
    }

    // Output info
    if (capability.output) {
        stats.push('Has output');
    }

    // Schema info - check media_specs table for schemas
    const hasInputSchemas = (capability.args || []).some(arg => getSchemaFromMediaSpecs(arg.media_urn, mediaSpecs) !== null);
    const hasOutputSchema = capability.output && getSchemaFromMediaSpecs(capability.output.media_urn, mediaSpecs) !== null;

    if (hasInputSchemas || hasOutputSchema) {
        stats.push('Schema validated');
    }

    // Check if any arg has stdin source
    const hasStdinSource = (capability.args || []).some(arg =>
        (arg.sources || []).some(source => source.stdin)
    );
    if (hasStdinSource) {
        stats.push('Accepts stdin');
    }

    return stats.length > 0 ? stats.join(' • ') : 'Basic capability';
}

// Setup expandable functionality for I/O items
function setupExpandableItems(card) {
    const expandableItems = card.querySelectorAll('.io-item.expandable');
    
    expandableItems.forEach(item => {
        const expandBtn = item.querySelector('.expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleItemExpansion(item);
            });
        }
        
        // Also make the item itself clickable for expansion
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleItemExpansion(item);
        });
    });
}

// Toggle expansion of an I/O item
function toggleItemExpansion(item) {
    const isExpanded = item.classList.contains('expanded');
    
    if (isExpanded) {
        collapseItem(item);
    } else {
        expandItem(item);
    }
}

// Expand item to show detailed schema
function expandItem(item) {
    const schemaData = item.dataset.schema;
    if (!schemaData) return;

    const schema = JSON.parse(schemaData);
    const detailsHtml = createDetailedSchemaView(schema);

    // Add expanded class and content
    item.classList.add('expanded');

    // Update expand button
    const expandBtn = item.querySelector('.expand-btn');
    if (expandBtn) {
        expandBtn.textContent = '⇡';
        expandBtn.title = 'Click to collapse structure';
    }

    // Add or update detailed view
    let detailsDiv = item.querySelector('.schema-details');
    if (!detailsDiv) {
        detailsDiv = document.createElement('div');
        detailsDiv.className = 'schema-details';
        item.appendChild(detailsDiv);
    }
    detailsDiv.innerHTML = detailsHtml;
}

// Collapse item to hide detailed schema
function collapseItem(item) {
    item.classList.remove('expanded');
    
    // Update expand button
    const expandBtn = item.querySelector('.expand-btn');
    if (expandBtn) {
        expandBtn.textContent = '⇣';
        expandBtn.title = 'Click to expand structure';
    }
    
    // Remove detailed view
    const detailsDiv = item.querySelector('.schema-details');
    if (detailsDiv) {
        detailsDiv.remove();
    }
}

// Create detailed schema view
function createDetailedSchemaView(schema) {
    if (schema.type === 'object' && schema.properties) {
        return createObjectSchemaView(schema);
    } else if (schema.type === 'array' && schema.items) {
        return createArraySchemaView(schema);
    }
    // Display raw schema for unhandled structures
    return `<pre class="detail-json">${escapeHtml(JSON.stringify(schema, null, 2))}</pre>`;
}

// Create detailed object schema view
function createObjectSchemaView(schema) {
    const properties = schema.properties || {};
    const required = schema.required || [];
    
    const fieldsHtml = Object.entries(properties).map(([name, fieldDef]) => {
        const isRequired = required.includes(name);
        const type = fieldDef.type || 'any';
        const description = fieldDef.description || '';
        const constraints = getFieldConstraints(fieldDef);
        
        return `
            <div class="detail-field ${isRequired ? 'required' : 'optional'}">
                <div class="field-header">
                    <span class="field-name">${name}</span>
                    <span class="field-type">${type}</span>
                    ${isRequired ? '<span class="req-badge">REQ</span>' : '<span class="opt-badge">OPT</span>'}
                </div>
                ${description ? `<div class="field-desc">${description}</div>` : ''}
                ${constraints ? `<div class="field-constraints">${constraints}</div>` : ''}
            </div>
        `;
    }).join('');
    
    return `<div class="object-details">${fieldsHtml}</div>`;
}

// Create detailed array schema view
function createArraySchemaView(schema) {
    const items = schema.items || {};
    const itemType = items.type || 'any';
    const minItems = schema.minItems !== undefined ? schema.minItems : null;
    const maxItems = schema.maxItems !== undefined ? schema.maxItems : null;
    
    let constraintsHtml = '';
    if (minItems !== null || maxItems !== null) {
        const min = minItems !== null ? `min: ${minItems}` : '';
        const max = maxItems !== null ? `max: ${maxItems}` : '';
        constraintsHtml = `<div class="array-constraints">${[min, max].filter(Boolean).join(', ')}</div>`;
    }
    
    if (itemType === 'object' && items.properties) {
        const objectHtml = createObjectSchemaView(items);
        return `
            <div class="array-details">
                <div class="array-header">Array of objects ${constraintsHtml}</div>
                ${objectHtml}
            </div>
        `;
    } else {
        const itemConstraints = getFieldConstraints(items);
        return `
            <div class="array-details">
                <div class="array-header">Array of ${itemType} ${constraintsHtml}</div>
                ${itemConstraints ? `<div class="item-constraints">${itemConstraints}</div>` : ''}
            </div>
        `;
    }
}

// Get field constraints as readable text
function getFieldConstraints(fieldDef) {
    const constraints = [];
    
    if (fieldDef.minLength !== undefined) constraints.push(`min: ${fieldDef.minLength}`);
    if (fieldDef.maxLength !== undefined) constraints.push(`max: ${fieldDef.maxLength}`);
    if (fieldDef.minimum !== undefined) constraints.push(`min: ${fieldDef.minimum}`);
    if (fieldDef.maximum !== undefined) constraints.push(`max: ${fieldDef.maximum}`);
    if (fieldDef.pattern) constraints.push(`pattern: ${fieldDef.pattern}`);
    if (fieldDef.enum && fieldDef.enum.length > 0) {
        constraints.push(`values: ${fieldDef.enum.slice(0, 3).join(', ')}${fieldDef.enum.length > 3 ? '...' : ''}`);
    }
    
    return constraints.length > 0 ? constraints.join(' | ') : '';
}

// Format CapUrn object as string using strict implementation
function formatCapUrn(capUrn) {
    if (typeof capUrn === 'string') {
        const parsed = CapUrn.fromString(capUrn);
        return parsed.toString();
    }

    if (capUrn && capUrn.tags) {
        const capUrnObj = CapUrn.fromTags(capUrn.tags);
        return capUrnObj.toString();
    }

    throw new Error(`Invalid URN format: ${JSON.stringify(capUrn)}`);
}

// Handle Enter key in CAPURN input
document.addEventListener('DOMContentLoaded', function() {
    const input = document.getElementById('capurn-input');
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                lookupCapability();
            }
        });
    }
    
    // Capabilities are now loaded by the cap-navigator
    // if (document.getElementById('capabilities-list')) {
    //     loadCapabilities();
    // }
    
    // Add smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

// Utility function to validate CAPURN format
// Uses the CapUrn class from capdag.js to properly handle quoted values
function validateCapUrn(urn) {
    if (!urn || typeof urn !== 'string') {
        return { valid: false, error: 'CAPURN must be a string' };
    }

    try {
        // Use CapUrn.fromString for proper validation including quoted values
        CapUrn.fromString(urn);
        return { valid: true };
    } catch (error) {
        if (error instanceof CapUrnError) {
            return { valid: false, error: error.message };
        }
        return { valid: false, error: 'Invalid CAPURN format' };
    }
}

// Parse CAPURN string into object
// Uses the CapUrn class from capdag.js to properly handle quoted values
function parseCapUrn(urn) {
    try {
        const capUrn = CapUrn.fromString(urn);
        return { tags: capUrn.tags };
    } catch (error) {
        if (error instanceof CapUrnError) {
            throw new Error(error.message);
        }
        throw new Error('Invalid CAPURN format');
    }
}