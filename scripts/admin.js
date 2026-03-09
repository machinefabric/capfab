// CAPDAG Registry Admin JavaScript

// API Base URL
const API_BASE = '';

// Authentication state
let authToken = null;

// Authentication functions
async function login(event) {
    event.preventDefault();
    const form = event.target;
    const adminKey = form.querySelector('#admin-key').value;
    const errorDiv = document.getElementById('auth-error');
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/auth`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ key: adminKey })
        });
        
        if (response.ok) {
            const result = await response.json();
            authToken = result.token;
            
            // Hide auth section and show admin panel
            document.getElementById('auth-section').style.display = 'none';
            document.getElementById('admin-panel').style.display = 'block';
            
            // Load existing capabilities
            loadCapabilitiesAdmin();
            
            errorDiv.style.display = 'none';
        } else {
            const error = await response.json();
            showError(errorDiv, error.message || 'Authentication failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError(errorDiv, 'Authentication failed. Please try again.');
    }
}

function logout() {
    authToken = null;
    
    // Show auth section and hide admin panel
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('admin-panel').style.display = 'none';
    
    // Clear form
    document.getElementById('admin-key').value = '';
    document.getElementById('auth-error').style.display = 'none';
}

// Capability management functions
async function addCapability(event) {
    event.preventDefault();
    const form = event.target;
    
    try {
        const capability = buildCapabilityFromForm(form);
        
        const response = await fetch(`${API_BASE}/api/admin/capabilities`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(capability)
        });
        
        if (response.ok) {
            showSuccess('Capability added successfully!');
            form.reset();
            resetArgumentsForm();
            loadCapabilitiesAdmin();
        } else {
            const error = await response.json();
            showError(null, error.message || 'Failed to add capability');
        }
    } catch (error) {
        console.error('Add capability error:', error);
        showError(null, error.message || 'Failed to add capability');
    }
}

function buildCapabilityFromForm(form) {
    const formData = new FormData(form);
    
    // Parse CAPURN
    const capurnString = form.querySelector('#capurn').value.trim();
    const capUrn = parseCapUrn(capurnString);
    
    // Collect arguments
    const arguments_obj = {};
    const argumentGroups = form.querySelectorAll('.argument-group');
    
    argumentGroups.forEach(group => {
        const name = group.querySelector('.arg-name').value.trim();
        const type = group.querySelector('.arg-type').value;
        const description = group.querySelector('.arg-description').value.trim();
        const cliFlag = group.querySelector('.arg-cli-flag').value.trim();
        
        if (name && type && description && cliFlag) {
            arguments_obj[name] = {
                name: name,
                arg_type: type,
                description: description,
                cli_flag: cliFlag,
                validation: {
                    required: true
                }
            };
        }
    });
    
    // Build output object
    let output = null;
    const outputType = form.querySelector('#output-type').value;
    const outputFormat = form.querySelector('#output-format').value.trim();
    
    if (outputType) {
        output = {
            type: outputType,
            format: outputFormat || undefined
        };
    }
    
    const result = {
        urn: capUrn,
        cap_description: form.querySelector('#description').value.trim() || undefined,
        command: form.querySelector('#command').value.trim(),
        arguments: arguments_obj,
        output: output
    };

    // Only include stdin if it has a value (absence means no stdin)
    const stdinValue = form.querySelector('#stdin').value.trim();
    if (stdinValue) {
        result.stdin = stdinValue;
    }

    return result;
}

// Argument management functions
function addArgument() {
    const container = document.getElementById('arguments-container');
    const argumentGroup = document.createElement('div');
    argumentGroup.className = 'argument-group';
    
    argumentGroup.innerHTML = `
        <input type="text" placeholder="Argument name" class="arg-name form-input">
        <select class="arg-type form-input">
            <option value="String">String</option>
            <option value="Integer">Integer</option>
            <option value="Float">Float</option>
            <option value="Boolean">Boolean</option>
            <option value="File">File</option>
        </select>
        <input type="text" placeholder="Description" class="arg-description form-input">
        <input type="text" placeholder="CLI flag (e.g., --input)" class="arg-cli-flag form-input">
        <button type="button" onclick="removeArgument(this)" class="remove-btn">Remove</button>
    `;
    
    container.appendChild(argumentGroup);
}

function removeArgument(button) {
    button.closest('.argument-group').remove();
}

function resetArgumentsForm() {
    const container = document.getElementById('arguments-container');
    container.innerHTML = `
        <div class="argument-group">
            <input type="text" placeholder="Argument name" class="arg-name form-input">
            <select class="arg-type form-input">
                <option value="String">String</option>
                <option value="Integer">Integer</option>
                <option value="Float">Float</option>
                <option value="Boolean">Boolean</option>
                <option value="File">File</option>
            </select>
            <input type="text" placeholder="Description" class="arg-description form-input">
            <input type="text" placeholder="CLI flag (e.g., --input)" class="arg-cli-flag form-input">
            <button type="button" onclick="removeArgument(this)" class="remove-btn">Remove</button>
        </div>
    `;
}

// Load capabilities for admin management
async function loadCapabilitiesAdmin() {
    const listContainer = document.getElementById('admin-capabilities-list');
    
    try {
        listContainer.innerHTML = '<div class="loading">Loading capabilities...</div>';
        
        const response = await fetch(`${API_BASE}/api/capabilities`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const capabilities = await response.json();
        
        if (capabilities.length === 0) {
            listContainer.innerHTML = '<div class="loading">No capabilities registered yet.</div>';
            return;
        }
        
        listContainer.innerHTML = '';
        
        capabilities.forEach(cap => {
            const card = createAdminCapabilityCard(cap);
            listContainer.appendChild(card);
        });
        
    } catch (error) {
        console.error('Load capabilities error:', error);
        listContainer.innerHTML = `<div class="loading">Error loading capabilities: ${error.message}</div>`;
    }
}

// Create admin capability card
function createAdminCapabilityCard(capability) {
    const card = document.createElement('div');
    card.className = 'admin-capability-card';
    
    const urnString = formatCapUrn(capability.urn);
    const description = capability.cap_description || 'No description provided';
    
    card.innerHTML = `
        <div class="admin-capability-header">
            <div class="admin-capability-urn">${urnString}</div>
            <div class="admin-capability-actions">
                <button class="action-btn" onclick="editCapability('${urnString}')">Edit</button>
                <button class="action-btn danger" onclick="deleteCapability('${urnString}')">Delete</button>
            </div>
        </div>
        <div class="admin-capability-description">${description}</div>
        <div class="admin-capability-meta">
            <span>Command: <code>${capability.command}</code></span>
        </div>
    `;
    
    return card;
}

// Delete capability
async function deleteCapability(urnString) {
    if (!confirm(`Are you sure you want to delete capability: ${urnString}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/capabilities/${encodeURIComponent(urnString)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            showSuccess('Capability deleted successfully!');
            loadCapabilitiesAdmin();
        } else {
            const error = await response.json();
            showError(null, error.message || 'Failed to delete capability');
        }
    } catch (error) {
        console.error('Delete capability error:', error);
        showError(null, 'Failed to delete capability');
    }
}

// Edit capability (simplified - just show JSON for now)
async function editCapability(urnString) {
    try {
        const response = await fetch(`${API_BASE}/${encodeURIComponent(urnString)}`);
        
        if (response.ok) {
            const capability = await response.json();
            alert(`Edit capability (JSON):\n\n${JSON.stringify(capability, null, 2)}`);
        } else {
            showError(null, 'Failed to load capability for editing');
        }
    } catch (error) {
        console.error('Edit capability error:', error);
        showError(null, 'Failed to load capability for editing');
    }
}

// Utility functions
function showError(element, message) {
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
    } else {
        // Show global error
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        // Insert at top of admin panel
        const adminPanel = document.querySelector('.admin-container');
        if (adminPanel) {
            adminPanel.insertBefore(errorDiv, adminPanel.firstChild);
            setTimeout(() => errorDiv.remove(), 5000);
        }
    }
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    
    // Insert at top of admin panel
    const adminPanel = document.querySelector('.admin-container');
    if (adminPanel) {
        adminPanel.insertBefore(successDiv, adminPanel.firstChild);
        setTimeout(() => successDiv.remove(), 3000);
    }
}

// Format CapUrn object as string using CapUrn class for proper quoted value handling
function formatCapUrn(capUrn) {
    if (typeof capUrn === 'string') {
        try {
            // Parse and re-serialize to ensure proper formatting with smart quoting
            const parsed = CapUrn.fromString(capUrn);
            return parsed.toString();
        } catch (error) {
            console.warn('Invalid Cap URN string:', capUrn, error);
            return 'cap:unknown';
        }
    }

    if (capUrn && capUrn.tags) {
        try {
            // Convert tags object to CapUrn and get canonical string with smart quoting
            const capUrnObj = CapUrn.fromTags(capUrn.tags);
            return capUrnObj.toString();
        } catch (error) {
            console.warn('Invalid Cap URN tags:', capUrn.tags, error);
            return 'cap:unknown';
        }
    }

    return 'cap:unknown';
}

// Parse CAPURN string into object using CapUrn class for proper quoted value handling
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

// Reset registry to standard capabilities
async function resetToStandardCapabilities() {
    if (!confirm('Are you sure you want to reset the registry to standard capabilities? This will DELETE ALL current capabilities and replace them with the standard set.')) {
        return;
    }
    
    if (!confirm('This action is irreversible. All custom capabilities will be permanently lost. Continue?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/reset`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            showSuccess(`Registry reset successful! Deleted: ${result.deleted_count}, Added: ${result.added_count} standard capabilities.`);
            loadCapabilitiesAdmin();
        } else {
            const error = await response.json();
            showError(null, error.message || 'Failed to reset registry');
        }
    } catch (error) {
        console.error('Reset registry error:', error);
        showError(null, 'Failed to reset registry: ' + error.message);
    }
}

// Initialize admin panel
document.addEventListener('DOMContentLoaded', function() {
    // Check if we have auth token stored (simple localStorage check)
    const storedToken = localStorage.getItem('capdag_admin_token');
    if (storedToken) {
        authToken = storedToken;
        // Try to validate token by making an API call
        loadCapabilitiesAdmin();
    }
});

// Store auth token on successful login (optional persistence)
function storeAuthToken(token) {
    localStorage.setItem('capdag_admin_token', token);
}

function clearAuthToken() {
    localStorage.removeItem('capdag_admin_token');
}