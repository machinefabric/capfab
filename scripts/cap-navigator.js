// Dynamic Cap Navigator for CAPDAG Registry
// Implements the same navigation concept as CapsWidgetView.swift

// Use API_BASE from main.js if available, otherwise define it
if (typeof API_BASE === 'undefined') {
    window.API_BASE = '';
}

class CapNavigator {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.caps = [];
        this.breadcrumbs = [];
        this.currentLevel = { type: 'keySelection', data: [] };
        this.isGoingBack = false;
        this.selectedCap = null;
        this.selectedNode = null;  // For graph node details
        this.selectedEdge = null;  // For graph edge details (capability)
        this.isLoading = false;
        this.errorMessage = null;
        this.preloadedCapabilities = options.capabilities || null;
        this.graph = null;  // Reference to graph for interaction
        this.isUserCollapsed = false;  // Track if user manually collapsed panel

        // Navigation history stack for back button
        this.navHistory = [];

        // Check if we're on the /browse path for URL state management
        this.isBrowsePath = window.location.pathname.startsWith('/browse');

        // Bind popstate handler
        this.handlePopState = this.handlePopState.bind(this);
        if (this.isBrowsePath) {
            window.addEventListener('popstate', this.handlePopState);
        }

        // Only auto-init if no preloaded capabilities (caller will call render() manually)
        if (!this.preloadedCapabilities) {
            this.init();
        }
    }

    setGraph(graph) {
        this.graph = graph;
    }

    /**
     * Check if two media URNs match using TaggedUrn matching semantics
     * @param {string} urn1 - First media URN string
     * @param {string} urn2 - Second media URN string
     * @returns {boolean} Whether the URNs match
     */
    mediaUrnsMatch(urn1, urn2) {
        if (!urn1 || !urn2) return false;
        if (urn1 === urn2) return true; // Fast path for exact match
        try {
            const parsed1 = TaggedUrn.fromString(urn1);
            const parsed2 = TaggedUrn.fromString(urn2);
            // Check both directions since matching is directional (handler vs request)
            return parsed1.conformsTo(parsed2) || parsed2.conformsTo(parsed1);
        } catch {
            return false;
        }
    }

    async init() {
        await this.loadCaps();

        // After loading caps, restore state from URL if on /browse
        let stateRestored = false;
        if (this.isBrowsePath) {
            stateRestored = this.restoreStateFromUrl();
        }

        // If no URL state was restored, set default navigation state
        if (!stateRestored) {
            this.setDefaultNavigationState();
        }

        // Replace current history state with initial state (don't push)
        if (this.isBrowsePath) {
            this.updateUrlState(false);
        }

        this.render();
    }

    // URL State Management
    // Returns true if state was restored from URL, false otherwise
    restoreStateFromUrl() {
        const path = window.location.pathname;
        const hash = window.location.hash;

        // Check if viewing a specific cap: /browse/cap:...
        const capMatch = path.match(/^\/browse\/cap:(.+)$/);
        if (capMatch) {
            const capUrn = `cap:${decodeURIComponent(capMatch[1])}`;

            // Validate the URN is parseable before using it
            try {
                TaggedUrn.fromString(capUrn);
            } catch (err) {
                // Invalid URN in URL (e.g., empty value like 'in=') - redirect to /browse
                console.error(`Invalid URN in URL: ${capUrn}`, err.message);
                window.location.href = '/browse';
                return false;
            }

            const cap = this.findCapByUrn(capUrn);
            if (!cap) {
                throw new Error(`Capability not found for URL: ${capUrn}`);
            }
            this.selectedCap = cap;
            // Set breadcrumbs from the cap's tags
            const tags = this.getCapTags(cap);
            this.breadcrumbs = Object.entries(tags).map(([key, value]) => ({ key, value }));
            return true;
        }

        // Check hash for intermediate navigation: #op=generate;format=pdf
        // Skip OAuth tokens (access_token, error, etc.)
        if (hash && hash.length > 1) {
            const hashContent = decodeURIComponent(hash.substring(1)); // Remove # and decode

            // Skip if this looks like an OAuth token
            if (this.isOAuthToken(hashContent)) {
                return false;
            }

            this.breadcrumbs = this.parseBreadcrumbsFromHash(hashContent);
            if (this.breadcrumbs.length > 0) {
                this.updateCurrentLevelFromBreadcrumbs();
                return true;
            }
        }

        return false;
    }

    // Check if hash content is an OAuth token or error
    isOAuthToken(hashContent) {
        const oauthTokenPrefixes = [
            'access_token=',
            'error=',
            'error_description='
        ];
        return oauthTokenPrefixes.some(prefix => hashContent.startsWith(prefix));
    }

    parseBreadcrumbsFromHash(hashContent) {
        if (!hashContent) return [];

        const breadcrumbs = [];
        // Parse key=value pairs separated by ;
        // Handle quoted values
        const parts = this.parseTagPairs(hashContent);
        for (const part of parts) {
            const eqIndex = part.indexOf('=');
            if (eqIndex > 0) {
                const key = part.substring(0, eqIndex);
                let value = part.substring(eqIndex + 1);
                // Remove quotes if present
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                }
                breadcrumbs.push({ key, value });
            }
        }
        return breadcrumbs;
    }

    parseTagPairs(str) {
        const pairs = [];
        let current = '';
        let inQuotes = false;
        let escape = false;

        for (const char of str) {
            if (escape) {
                current += char;
                escape = false;
            } else if (char === '\\') {
                current += char;
                escape = true;
            } else if (char === '"') {
                current += char;
                inQuotes = !inQuotes;
            } else if (char === ';' && !inQuotes) {
                if (current) pairs.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        if (current) pairs.push(current);
        return pairs;
    }

    updateCurrentLevelFromBreadcrumbs() {
        const remainingKeys = this.getAvailableKeys(this.filteredCaps);

        if (remainingKeys.length === 1) {
            const autoKey = remainingKeys[0];
            const availableValues = this.getUniqueValues(autoKey, this.filteredCaps);
            this.currentLevel = { type: 'valueSelection', data: { key: autoKey, values: availableValues } };
        } else if (remainingKeys.length > 0) {
            this.currentLevel = { type: 'keySelection', data: remainingKeys };
        }
    }

    findCapByUrn(urnString) {
        // Use TaggedUrn for parsing since the search URN may be partial (no in/out tags)
        const searchUrn = TaggedUrn.fromString(urnString);
        return this.caps.find(cap => {
            const capTags = this.getCapTags(cap);
            // Compare all tags from search URN - cap must have matching values
            for (const [key, value] of Object.entries(searchUrn.tags)) {
                if (capTags[key] !== value) {
                    return false;
                }
            }
            return true;
        });
    }

    updateUrlState(pushState = true) {
        if (!this.isBrowsePath) return;

        let newUrl;

        if (this.selectedCap) {
            // Viewing a specific cap - use real URL path
            const urn = this.getCapUrnString(this.selectedCap);
            newUrl = `/browse/${urn}`;
        } else if (this.breadcrumbs.length > 0) {
            // Intermediate navigation - use hash
            const hash = this.buildHashFromBreadcrumbs();
            newUrl = `/browse#${hash}`;
        } else {
            // Home state
            newUrl = '/browse';
        }

        if (pushState) {
            window.history.pushState({ breadcrumbs: this.breadcrumbs, selectedCapUrn: this.selectedCap ? this.getCapUrnString(this.selectedCap) : null }, '', newUrl);
        } else {
            window.history.replaceState({ breadcrumbs: this.breadcrumbs, selectedCapUrn: this.selectedCap ? this.getCapUrnString(this.selectedCap) : null }, '', newUrl);
        }
    }

    buildHashFromBreadcrumbs() {
        if (this.breadcrumbs.length === 0) return '';

        // Use TaggedUrnBuilder for partial URNs (breadcrumbs don't have full in/out specs)
        let builder = new TaggedUrnBuilder('cap');
        for (const crumb of this.breadcrumbs) {
            builder = builder.tag(crumb.key, crumb.value);
        }
        // Get the string without 'cap:' prefix
        const full = builder.build().toString();
        return full.replace(/^cap:/, '');
    }

    handlePopState(event) {
        if (!this.isBrowsePath) return;

        // Restore state from current URL
        this.selectedCap = null;
        this.breadcrumbs = [];
        this.restoreStateFromUrl();

        // Determine animation direction
        this.isGoingBack = true;

        this.render();
    }
    
    async loadCaps() {
        this.isLoading = true;
        this.render();

        try {
            // Use the same API endpoint as the existing main.js
            const response = await fetch(`${API_BASE}/api/capabilities`);

            // Check if response is ok
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Parse JSON directly
            const capabilities = await response.json();

            if (!Array.isArray(capabilities)) {
                throw new Error('API response is not an array');
            }

            this.caps = capabilities;

        } catch (error) {
            this.errorMessage = error.message;
        } finally {
            this.isLoading = false;
            // Don't render here - init() will handle it
        }
    }

    setDefaultNavigationState() {
        // Set initial navigation level based on available caps
        const allKeys = this.getAvailableKeys(this.caps);

        // If only one capability total, automatically show detail view
        if (this.caps.length === 1) {
            this.selectedCap = this.caps[0];
        } else if (allKeys.length === 1) {
            // If only one key available at start, automatically select it
            const autoKey = allKeys[0];
            const availableValues = this.getUniqueValues(autoKey, this.caps);
            this.currentLevel = { type: 'valueSelection', data: { key: autoKey, values: availableValues } };
        } else {
            this.currentLevel = { type: 'keySelection', data: allKeys };
        }
    }
    
    render() {
        // If we have preloaded capabilities and haven't initialized yet, do it now
        if (this.preloadedCapabilities && this.caps.length === 0) {
            this.caps = this.preloadedCapabilities;
            this.preloadedCapabilities = null;

            // Restore state from URL if on /browse
            let stateRestored = false;
            if (this.isBrowsePath) {
                stateRestored = this.restoreStateFromUrl();
            }

            // If no URL state was restored, set default navigation state
            if (!stateRestored) {
                this.setDefaultNavigationState();
            }

            // Replace current history state with initial state (don't push)
            if (this.isBrowsePath) {
                this.updateUrlState(false);
            }
        }

        if (this.selectedNode) {
            this.renderNodeDetail();
        } else if (this.selectedEdge) {
            this.renderEdgeDetail();
        } else if (this.selectedCap) {
            this.renderCapDetail();
        } else {
            this.renderNavigator();
        }

        // Sync header title with current state
        this.updateHeaderTitle();
    }

    // Update the floating header brand to show URN with colored tags (replaces "cap:")
    updateHeaderTitle() {
        const brandText = document.getElementById('brand-text');
        if (!brandText) return;

        let urn = null;

        if (this.selectedNode) {
            urn = this.selectedNode.id;
        } else if (this.selectedEdge) {
            const { capability } = this.selectedEdge;
            if (capability) {
                urn = this.getCapUrnString(capability);
            }
        } else if (this.selectedCap) {
            urn = this.getCapUrnString(this.selectedCap);
        } else if (this.breadcrumbs.length > 0) {
            urn = this.buildPartialUrnFromBreadcrumbs();
        }

        // Show colored URN tags if selected, otherwise show default "cap:"
        if (urn) {
            brandText.innerHTML = this.renderUrnTags(urn);
            brandText.dataset.fullUrn = urn;
            brandText.style.cursor = 'copy';
            brandText.title = 'Click to copy full URN';
        } else {
            brandText.innerHTML = 'cap:';
            delete brandText.dataset.fullUrn;
            brandText.style.cursor = '';
            brandText.removeAttribute('title');
        }
    }

    // Called by graph when a node is selected
    showNodeDetail(nodeData) {
        this.selectedNode = nodeData;
        this.selectedEdge = null;
        this.selectedCap = null;
        // Don't auto-expand if user collapsed - just update content
        this.render();
    }

    // Called by graph when an edge is selected
    showEdgeDetail(edgeData, capability) {
        this.selectedEdge = { edge: edgeData, capability: capability };
        this.selectedNode = null;
        this.selectedCap = null;
        // Don't auto-expand if user collapsed - just update content
        this.render();
    }

    // Called by graph when selection is cleared
    clearGraphSelection() {
        if (this.selectedNode || this.selectedEdge) {
            this.selectedNode = null;
            this.selectedEdge = null;
            // Don't auto-expand if user collapsed - just update content
            this.render();
        }
    }
    
    renderNavigator() {
        const html = `
            <div class="cap-navigator ${this.isGoingBack ? 'going-back' : 'going-forward'}">
                ${this.renderPanelHeader()}
                <div class="navigator-body">
                    ${this.renderContent()}
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEventListeners();
    }

    renderPanelHeader(options = {}) {
        // Options for detail views
        const { showBackButton = false, backAction = 'back-to-nav', showJsonButton = false } = options;

        // Determine simple title for panel header
        let titleContent = '';
        let countDisplay = this.filteredCaps.length;

        if (this.selectedNode) {
            titleContent = this.getShortMediaType(this.selectedNode.id);
            countDisplay = '';
        } else if (this.selectedEdge) {
            const { edge, capability } = this.selectedEdge;
            if (capability) {
                titleContent = capability.title || capability.command || 'Capability';
            } else {
                titleContent = edge.op || 'Connection';
            }
            countDisplay = '';
        } else if (this.selectedCap) {
            titleContent = this.selectedCap.title || this.selectedCap.command || 'Capability';
            countDisplay = '';
        } else if (this.breadcrumbs.length > 0) {
            const lastCrumb = this.breadcrumbs[this.breadcrumbs.length - 1];
            titleContent = lastCrumb.value;
        }

        const backButtonHtml = showBackButton
            ? `<button class="panel-back-btn" data-action="${backAction}" title="Back">←</button>`
            : '';

        // Always show home button
        const homeButtonHtml = `<button class="panel-home-btn" data-action="home" title="Home">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
            </button>`;

        // Hide grip when showing back button
        const gripHtml = showBackButton ? '' : '<div class="panel-grip"></div>';

        // Simple title display
        const titleHtml = titleContent
            ? `<span class="panel-title-content">${this.escapeHtml(titleContent)}</span>`
            : `<span class="panel-title">cap:</span>`;

        const countHtml = countDisplay !== ''
            ? `<span class="panel-count">${countDisplay}</span>`
            : '';

        // JSON button for detail views
        const jsonButtonHtml = showJsonButton
            ? `<button class="panel-json-btn" data-action="expand-json" title="Show JSON">{ }</button>`
            : '';

        return `
            <div class="panel-header" data-action="toggle-panel">
                ${backButtonHtml}
                ${homeButtonHtml}
                ${gripHtml}
                ${titleHtml}
                ${countHtml}
                ${jsonButtonHtml}
                <button class="panel-toggle" data-action="toggle-panel">
                    <svg class="panel-toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
            </div>
        `;
    }

    // Render URN as colored tags that wrap at 75% width
    renderUrnTags(urn) {
        try {
            const parsed = TaggedUrn.fromString(urn);
            const scheme = parsed.prefix || 'cap';
            const tags = parsed.tags || {};
            const tagEntries = Object.entries(tags);

            if (tagEntries.length === 0) {
                return `<span class="urn-scheme">${this.escapeHtml(scheme)}:</span>`;
            }

            const tagColors = ['tag-color-1', 'tag-color-2', 'tag-color-3', 'tag-color-4'];
            const tagsHtml = tagEntries.map(([key, value], index) => {
                const colorClass = tagColors[index % tagColors.length];
                const separator = index < tagEntries.length - 1 ? '<span class="urn-tag-sep">;</span>' : '';
                return `<span class="urn-tag ${colorClass}"><span class="urn-tag-key">${this.escapeHtml(key)}</span>=<span class="urn-tag-value">${this.escapeHtml(value)}</span></span>${separator}`;
            }).join('');

            return `<span class="urn-scheme">${this.escapeHtml(scheme)}:</span>${tagsHtml}`;
        } catch (e) {
            return `<span class="urn-fallback">${this.escapeHtml(urn)}</span>`;
        }
    }

    // Build partial URN string from current breadcrumbs
    buildPartialUrnFromBreadcrumbs() {
        if (this.breadcrumbs.length === 0) return null;
        const parts = this.breadcrumbs.map(b => `${b.key}=${b.value}`);
        return `cap:${parts.join(';')}`;
    }

    renderContent() {
        if (this.isLoading) {
            return this.renderLoading();
        }

        if (this.errorMessage) {
            return this.renderError();
        }

        if (this.caps.length === 0) {
            return this.renderEmpty();
        }

        return this.renderNavigationContent();
    }

    renderNavigationContent() {
        const content = this.currentLevel.type === 'keySelection'
            ? this.renderKeySelection(this.currentLevel.data)
            : this.renderValueSelection(this.currentLevel.data.key, this.currentLevel.data.values);

        return content;
    }

    renderKeySelection(keys) {
        let navCards = '';

        if (keys.length > 0) {
            const keyCards = keys.map(key => {
                const valueCount = this.getUniqueValues(key, this.filteredCaps).length;
                return `<button class="nav-card" data-type="key" data-value="${key}">
                    <span class="nav-card-title">${this.escapeHtml(key)}</span>
                    <span class="nav-card-count">${valueCount}</span>
                </button>`;
            }).join('');

            navCards = `<div class="nav-grid">${keyCards}</div>`;
        }

        const capList = this.breadcrumbs.length > 0 ? this.renderCapList() : '';

        return `${navCards}${capList}`;
    }

    renderValueSelection(key, values) {
        const valueCards = values.map(value => {
            const matchingCount = this.filteredCaps.filter(cap =>
                this.getCapTags(cap)[key] === value
            ).length;
            return `<button class="nav-card" data-type="value" data-value="${value}" data-key="${key}">
                <span class="nav-card-title">${this.escapeHtml(value)}</span>
                <span class="nav-card-count">${matchingCount}</span>
            </button>`;
        }).join('');

        return `
            <div class="nav-grid">${valueCards}</div>
            ${this.renderCapList()}
        `;
    }

    renderCapList() {
        if (this.filteredCaps.length === 0) return '';

        const capItems = this.filteredCaps.map(cap => {
            const title = cap.title || 'Untitled';
            const urnString = this.getCapUrnString(cap);
            const inType = this.getInTypeBadge(cap);
            const outType = this.getOutTypeBadge(cap);

            return `<div class="cap-item" data-urn="${this.escapeHtml(urnString)}">
                <span class="cap-item-title">${this.escapeHtml(title)}</span>
                <span class="cap-item-cmd">${this.escapeHtml(cap.command || '')}</span>
                <span class="cap-item-io">${inType}→${outType}</span>
            </div>`;
        }).join('');

        return `<div class="cap-list">${capItems}</div>`;
    }
    
    renderCapDetail() {
        const cap = this.selectedCap;
        const argChips = this.renderArgChips(cap);

        const html = `
            <div class="cap-navigator">
                ${this.renderPanelHeader({ showBackButton: true, backAction: 'back', showJsonButton: true })}
                <div class="detail-compact">
                    <div class="detail-body">
                        <div class="detail-section">
                            <span class="detail-section-label">IO</span>
                            <div class="io-flow">
                                <span class="io-badge io-badge-in clickable" data-media-urn="${this.escapeHtml(this.getInMediaUrn(cap))}" title="Navigate to input type">${this.getInTypeBadge(cap)}</span>
                                <span class="io-arrow">→</span>
                                <span class="io-badge io-badge-out clickable" data-media-urn="${this.escapeHtml(this.getOutMediaUrn(cap))}" title="Navigate to output type">${this.getOutTypeBadge(cap)}</span>
                            </div>
                        </div>
                        <div class="detail-section">
                            <span class="detail-section-label">Arguments</span>
                            <div class="args-grid">${argChips}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachDetailEventListeners();
    }

    renderArgChips(cap) {
        if (!cap.args || !Array.isArray(cap.args) || cap.args.length === 0) {
            return '<span class="no-args">No arguments</span>';
        }

        const chips = [];

        cap.args.forEach((arg, index) => {
            const isRequired = arg.required !== undefined ? arg.required : false;
            const argName = this.getArgName(arg, index);
            const chipClass = isRequired ? 'arg-chip-req' : 'arg-chip-opt';

            // Show full media URN in tooltip
            const tooltip = `${arg.arg_description ? arg.arg_description + '\n' : ''}${arg.media_urn}`;

            chips.push(`<span class="arg-chip ${chipClass}" title="${this.escapeHtml(tooltip)}">
                <span class="arg-chip-name">${this.escapeHtml(argName)}</span>
            </span>`);
        });

        return chips.length > 0 ? chips.join('') : '<span class="no-args">No arguments</span>';
    }

    // Get compact display from a media URN (for badges/chips)
    // Uses canonical form from capdag, shows type if present, otherwise shows modifiers
    getFirstMediaTag(mediaUrn) {
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

            // Look for type= first (most specific)
            for (const tag of tags) {
                if (tag.startsWith('type=')) {
                    return tag.replace('type=', '');
                }
            }

            // No type=, show first non-version modifier
            for (const tag of tags) {
                if (!tag.startsWith('v=')) {
                    return tag;
                }
            }

            // Only version tag, show it
            return tags[0] || '';
        } catch (error) {
            throw new Error(`Cannot parse media URN '${mediaUrn}': ${error.message}`);
        }
    }

    getArgName(arg, index) {
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

    getInTypeBadge(cap) {
        try {
            const tags = this.getCapTags(cap);
            const inSpec = tags.in || '';
            return this.getFirstMediaTag(inSpec) || 'any';
        } catch {
            return 'any';
        }
    }

    getOutTypeBadge(cap) {
        try {
            const tags = this.getCapTags(cap);
            const outSpec = tags.out || '';
            return this.getFirstMediaTag(outSpec) || 'any';
        } catch {
            return 'any';
        }
    }

    // Get the full media URN for input spec
    getInMediaUrn(cap) {
        try {
            const tags = this.getCapTags(cap);
            return tags.in || '';
        } catch {
            return '';
        }
    }

    // Get the full media URN for output spec
    getOutMediaUrn(cap) {
        try {
            const tags = this.getCapTags(cap);
            return tags.out || '';
        } catch {
            return '';
        }
    }

    renderNodeDetail() {
        const node = this.selectedNode;

        // Get connected edges (capabilities) for this node
        // Use TaggedUrn matching for proper wildcard support
        const incomingCaps = this.caps.filter(cap => {
            try {
                const tags = this.getCapTags(cap);
                return this.mediaUrnsMatch(tags.out, node.id);
            } catch { return false; }
        });
        const outgoingCaps = this.caps.filter(cap => {
            try {
                const tags = this.getCapTags(cap);
                return this.mediaUrnsMatch(tags.in, node.id);
            } catch { return false; }
        });

        // Build compact capability pills
        const producerPills = incomingCaps.map(cap =>
            `<span class="cap-pill" data-urn="${this.escapeHtml(this.getCapUrnString(cap))}" title="${this.escapeHtml(cap.cap_description || '')}">${this.escapeHtml(cap.command || cap.title || 'cap')}</span>`
        ).join('') || '<span class="no-caps">None</span>';

        const consumerPills = outgoingCaps.map(cap =>
            `<span class="cap-pill" data-urn="${this.escapeHtml(this.getCapUrnString(cap))}" title="${this.escapeHtml(cap.cap_description || '')}">${this.escapeHtml(cap.command || cap.title || 'cap')}</span>`
        ).join('') || '<span class="no-caps">None</span>';

        const html = `
            <div class="cap-navigator">
                ${this.renderPanelHeader({ showBackButton: true, backAction: 'back-to-nav', showJsonButton: true })}
                <div class="detail-compact">
                    <div class="detail-body">
                        <div class="detail-section">
                            <span class="detail-section-label">Producers (${incomingCaps.length})</span>
                            <div class="caps-pills">${producerPills}</div>
                        </div>
                        <div class="detail-section">
                            <span class="detail-section-label">Consumers (${outgoingCaps.length})</span>
                            <div class="caps-pills">${consumerPills}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachNodeDetailEventListeners();
    }

    renderEdgeDetail() {
        const { edge, capability } = this.selectedEdge;
        const cap = capability;

        if (!cap) {
            // Show basic edge info if no capability data
            const html = `
                <div class="cap-navigator">
                    ${this.renderPanelHeader({ showBackButton: true, backAction: 'back-to-nav' })}
                    <div class="detail-compact">
                        <div class="detail-body">
                            <div class="detail-section">
                                <span class="detail-section-label">IO</span>
                                <div class="io-flow">
                                    <span class="io-badge io-badge-in clickable" data-media-urn="${this.escapeHtml(edge.source)}" title="Navigate to input type">${this.escapeHtml(this.getShortMediaType(edge.source))}</span>
                                    <span class="io-arrow">→</span>
                                    <span class="io-badge io-badge-out clickable" data-media-urn="${this.escapeHtml(edge.target)}" title="Navigate to output type">${this.escapeHtml(this.getShortMediaType(edge.target))}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            this.container.innerHTML = html;
            this.attachEdgeDetailEventListeners();
            return;
        }

        // Use the same compact layout as renderCapDetail
        const argChips = this.renderArgChips(cap);

        const html = `
            <div class="cap-navigator">
                ${this.renderPanelHeader({ showBackButton: true, backAction: 'back-to-nav', showJsonButton: true })}
                <div class="detail-compact">
                    <div class="detail-body">
                        <div class="detail-section">
                            <span class="detail-section-label">IO</span>
                            <div class="io-flow">
                                <span class="io-badge io-badge-in clickable" data-media-urn="${this.escapeHtml(this.getInMediaUrn(cap))}" title="Navigate to input type">${this.getInTypeBadge(cap)}</span>
                                <span class="io-arrow">→</span>
                                <span class="io-badge io-badge-out clickable" data-media-urn="${this.escapeHtml(this.getOutMediaUrn(cap))}" title="Navigate to output type">${this.getOutTypeBadge(cap)}</span>
                            </div>
                        </div>
                        <div class="detail-section">
                            <span class="detail-section-label">Arguments</span>
                            <div class="args-grid">${argChips}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEdgeDetailEventListeners();
    }

    attachNodeDetailEventListeners() {
        // Panel toggle and back button
        this.attachPanelToggleListener();

        // JSON button - open URN in new tab
        const jsonBtn = this.container.querySelector('.panel-json-btn');
        if (jsonBtn && this.selectedNode) {
            jsonBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const urn = this.selectedNode.id;
                window.open(this.buildCapDagUrl(urn), '_blank');
            });
        }

        // Cap pills (clickable capability references) - use navigateToEdge for history
        this.container.querySelectorAll('.cap-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const urn = pill.dataset.urn;
                this.navigateToEdge(urn);
            });
        });
    }

    attachEdgeDetailEventListeners() {
        // Panel toggle and back button
        this.attachPanelToggleListener();

        // JSON button - open URN in new tab
        const jsonBtn = this.container.querySelector('.panel-json-btn');
        const cap = this.selectedEdge?.capability;
        if (jsonBtn && cap) {
            jsonBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const urn = this.getCapUrnString(cap);
                window.open(this.buildCapDagUrl(urn), '_blank');
            });
        }

        // Clickable IO badges - navigate to media node
        this.attachClickableMediaBadges();
    }

    // Build capdag.com URL - encode URN body but not scheme prefix
    // e.g., "media:png" -> "https://capdag.com/media:type%3Dpng%3Bv%3D1"
    buildCapDagUrl(urn) {
        if (!urn) return 'https://capdag.com/';
        const colonIndex = urn.indexOf(':');
        if (colonIndex === -1) {
            return `https://capdag.com/${encodeURIComponent(urn)}`;
        }
        const scheme = urn.substring(0, colonIndex + 1); // e.g., "media:" or "cap:"
        const body = urn.substring(colonIndex + 1);
        return `https://capdag.com/${scheme}${encodeURIComponent(body)}`;
    }

    // Extract short display name from media URN
    // Get primary tag from media URN for compact display
    getShortMediaType(mediaUrn) {
        if (!mediaUrn || typeof mediaUrn !== 'string') {
            throw new Error('Invalid media URN: must be a non-empty string');
        }

        // Use getFirstMediaTag to get the primary tag
        const tag = this.getFirstMediaTag(mediaUrn);
        if (!tag) {
            throw new Error(`Cannot extract tag from media URN: ${mediaUrn}`);
        }
        return tag;
    }

    renderDetailInputs(cap) {
        if (!cap.args || !Array.isArray(cap.args) || cap.args.length === 0) {
            return '<div class="io-item io-empty">No inputs</div>';
        }

        const inputs = [];
        const mediaSpecs = cap.media_specs || {};

        // Process args array
        cap.args.forEach((arg, index) => {
            const isRequired = arg.required !== undefined ? arg.required : false;
            inputs.push(this.renderInputItem(arg, isRequired, mediaSpecs, index));
        });

        return inputs.length > 0 ? inputs.join('') : '<div class="io-item io-empty">No inputs</div>';
    }
    
    renderInputItem(arg, isRequired, mediaSpecs, index) {
        // Format media URN tags for display
        const mediaUrnDisplay = this.formatMediaUrnForDisplay(arg.media_urn);

        // Get schema from media_specs table
        const schema = this.getSchemaFromMediaSpecs(arg.media_urn, mediaSpecs);
        const hasSchema = schema !== null;
        const schemaIndicator = hasSchema ? '<span class="schema-indicator" title="Schema validated">S</span>' : '';

        // Generate argument name from sources
        const argName = this.getArgName(arg, index);

        return `
            <div class="io-item io-input ${isRequired ? 'required' : 'optional'}"
                 title="${this.escapeHtml(arg.arg_description || argName)}">
                <div class="io-type">
                    <div class="media-tags">${mediaUrnDisplay}</div>
                </div>
                <div class="io-name">${this.escapeHtml(argName)}</div>
                ${schemaIndicator}
                ${isRequired ? '<span class="required-indicator">REQ</span>' : '<span class="optional-indicator">OPT</span>'}
            </div>
        `;
    }
    
    renderDetailOutput(cap) {
        if (!cap.output) {
            return '<div class="io-item io-empty">No output defined</div>';
        }

        const mediaSpecs = cap.media_specs || {};

        // Format media URN tags for display
        const mediaUrnDisplay = this.formatMediaUrnForDisplay(cap.output.media_urn);

        // Get schema from media_specs table
        const schema = this.getSchemaFromMediaSpecs(cap.output.media_urn, mediaSpecs);
        const hasSchema = schema !== null;
        const schemaIndicator = hasSchema ? '<span class="schema-indicator" title="Schema validated">S</span>' : '';

        return `
            <div class="io-item io-output"
                 title="${this.escapeHtml(cap.output.output_description || '')}">
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
    formatMediaUrnForDisplay(mediaUrn) {
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
    getSchemaFromMediaSpecs(mediaSpec, mediaSpecs) {
        if (!mediaSpec) {
            return null;
        }

        // Use resolveMediaUrn from capdag-js - this handles both built-in and custom specs
        const resolved = resolveMediaUrn(mediaSpec, mediaSpecs || {});

        // Return the schema from the resolved MediaSpec (may be null for built-in specs)
        return resolved.schema || null;
    }
    
    renderCapDetailArguments(cap) {
        if (!cap.arguments) {
            return '';
        }

        const required = cap.arguments.required || [];
        const optional = cap.arguments.optional || [];

        if (required.length === 0 && optional.length === 0) {
            return '';
        }

        const mediaSpecs = cap.media_specs || {};

        const requiredArgs = required.map((arg, index) => {
            const firstTag = this.getFirstMediaTag(arg.media_urn);
            const argName = this.getArgName(arg, index);
            return `
            <div class="argument-item required">
                <span class="arg-name">${this.escapeHtml(argName)}</span>
                <span class="arg-type">${this.escapeHtml(firstTag)}</span>
                <span class="arg-required">REQ</span>
                ${arg.arg_description ? `<p class="arg-description">${this.escapeHtml(arg.arg_description)}</p>` : ''}
            </div>
        `}).join('');

        const optionalArgs = optional.map((arg, index) => {
            const firstTag = this.getFirstMediaTag(arg.media_urn);
            const argName = this.getArgName(arg, required.length + index);
            return `
            <div class="argument-item optional">
                <span class="arg-name">${this.escapeHtml(argName)}</span>
                <span class="arg-type">${this.escapeHtml(firstTag)}</span>
                <span class="arg-optional">OPT</span>
                ${arg.arg_description ? `<p class="arg-description">${this.escapeHtml(arg.arg_description)}</p>` : ''}
            </div>
        `}).join('');

        return `
            <div class="detail-section">
                <h4>Arguments</h4>
                <div class="arguments-list">
                    ${requiredArgs}
                    ${optionalArgs}
                </div>
            </div>
        `;
    }
    
    renderCapDetailOutput(cap) {
        if (!cap.output) {
            return '';
        }

        const mediaSpecs = cap.media_specs || {};

        const firstTag = this.getFirstMediaTag(cap.output.media_urn);
        return `
            <div class="detail-section">
                <h4>Output</h4>
                <div class="output-info">
                    <span class="output-type">${this.escapeHtml(firstTag)}</span>
                    ${cap.output.output_description ? `<p class="output-description">${this.escapeHtml(cap.output.output_description)}</p>` : ''}
                </div>
            </div>
        `;
    }
    
    renderCapAttribution(cap) {
        if (!cap.registered_by) {
            return '';
        }

        const username = cap.registered_by.username || 'unknown';
        const registeredAt = cap.registered_by.registered_at;
        const dateStr = registeredAt
            ? new Date(registeredAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })
            : '';

        return `
            <div class="cap-attribution">
                <span class="attribution-label">Registered by</span>
                <span class="attribution-user">@${this.escapeHtml(username)}</span>
                ${dateStr ? `<span class="attribution-date">${dateStr}</span>` : ''}
            </div>
        `;
    }

    renderLoading() {
        return `<div class="nav-loading"><div class="nav-spinner"></div>Loading...</div>`;
    }

    renderError() {
        return `<div class="nav-error">Error: ${this.escapeHtml(this.errorMessage)}</div>`;
    }

    renderEmpty() {
        return `<div class="nav-empty">No capabilities found</div>`;
    }
    
    // Attach panel header toggle listener - used by all views
    attachPanelToggleListener() {
        const panelHeader = this.container.querySelector('.panel-header');
        if (panelHeader) {
            panelHeader.addEventListener('click', (e) => {
                // Don't toggle if clicking on home or back button
                if (e.target.closest('.panel-back-btn') ||
                    e.target.closest('.panel-home-btn')) {
                    return;
                }
                const bottomPanel = document.getElementById('bottom-panel');
                if (bottomPanel) {
                    const isCurrentlyCollapsed = bottomPanel.classList.contains('collapsed');
                    bottomPanel.classList.toggle('collapsed');
                    // Track user's explicit collapse/expand action
                    this.isUserCollapsed = !isCurrentlyCollapsed;
                }
            });
        }

        // Handle back button in panel header
        const backBtn = this.container.querySelector('.panel-back-btn');
        if (backBtn) {
            const backAction = backBtn.dataset.action;
            backBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleBackAction(backAction);
            });
        }

        // Handle home button in panel header
        const homeBtn = this.container.querySelector('.panel-home-btn');
        if (homeBtn) {
            homeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.navigateToHome();
            });
        }
    }

    // Centralized back action handling - uses navigation history
    handleBackAction(action) {
        // Pop from navigation history if available
        if (this.navHistory.length > 0) {
            const previousState = this.navHistory.pop();
            this.restoreNavState(previousState);
            return;
        }

        // Fallback behavior when no history
        if (action === 'back') {
            // Cap detail back - use browser history or clear selection
            if (this.isBrowsePath) {
                window.history.back();
            } else {
                this.isGoingBack = true;
                this.selectedCap = null;
                if (this.graph) {
                    this.graph.clearSelection();
                }
                this.render();
            }
        } else if (action === 'back-to-nav') {
            // Node/edge detail back - clear graph selection
            this.selectedNode = null;
            this.selectedEdge = null;
            if (this.graph) {
                this.graph.clearSelection();
            }
            this.render();
        }
    }

    // Save current navigation state to history before navigating
    pushNavState() {
        const state = {
            selectedNode: this.selectedNode,
            selectedEdge: this.selectedEdge,
            selectedCap: this.selectedCap,
            breadcrumbs: [...this.breadcrumbs]
        };
        this.navHistory.push(state);
    }

    // Restore a previous navigation state
    restoreNavState(state) {
        this.isGoingBack = true;
        this.selectedNode = state.selectedNode;
        this.selectedEdge = state.selectedEdge;
        this.selectedCap = state.selectedCap;
        this.breadcrumbs = state.breadcrumbs;

        // Sync graph with restored state
        if (this.graph) {
            if (state.selectedNode) {
                this.graph.selectNodeById(state.selectedNode.id);
            } else if (state.selectedEdge) {
                const capUrn = this.getCapabilityUrnFromEdge(state.selectedEdge);
                if (capUrn) {
                    this.graph.selectEdgeByCapUrn(capUrn);
                }
            } else {
                this.graph.clearSelection();
            }
        }

        this.render();
    }

    // Get capability URN from edge data
    getCapabilityUrnFromEdge(selectedEdge) {
        if (!selectedEdge || !selectedEdge.capability) return null;
        const cap = selectedEdge.capability;
        if (typeof cap.urn === 'string') return cap.urn;
        if (cap.urn && cap.urn.tags) {
            try {
                return CapUrn.fromTags(cap.urn.tags).toString();
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    // Navigate to home - clear all selection and graph
    navigateToHome() {
        // Clear navigation history
        this.navHistory = [];
        this.isGoingBack = true;
        this.selectedNode = null;
        this.selectedEdge = null;
        this.selectedCap = null;
        this.breadcrumbs = [];

        // Clear graph selection and fit to show full graph
        if (this.graph) {
            this.graph.clearSelection();
            this.graph.fitAll();
        }

        // Reset to default navigation state
        this.setDefaultNavigationState();
        this.updateUrlState();
        this.render();
    }

    // Navigate to a media node (called from IO badges)
    navigateToNode(nodeId) {
        // Save current state before navigating
        this.pushNavState();

        // Find node data from graph or create minimal data
        const nodeData = this.graph ? this.graph.getNodeData(nodeId) : { id: nodeId };

        if (!nodeData) {
            console.warn('Node not found:', nodeId);
            return;
        }

        // Set navigator state
        this.selectedNode = nodeData;
        this.selectedEdge = null;
        this.selectedCap = null;

        // Tell graph to select this node (triggers zoom/highlight)
        if (this.graph) {
            this.graph.selectNodeById(nodeId);
        }

        this.render();
    }

    // Navigate to a capability/edge (called from cap pills)
    navigateToEdge(capUrn) {
        // Save current state before navigating
        this.pushNavState();

        const cap = this.findCapByUrn(capUrn);
        if (!cap) {
            console.warn('Capability not found:', capUrn);
            return;
        }

        // If we have a graph, get the edge data from it
        if (this.graph) {
            const edgeData = this.graph.getEdgeDataByCapUrn(capUrn);
            if (edgeData) {
                this.selectedEdge = { edge: edgeData, capability: cap };
                this.selectedNode = null;
                this.selectedCap = null;
                this.graph.selectEdgeByCapUrn(capUrn);
                this.render();
                return;
            }
        }

        // Fallback - just select the capability
        this.selectedCap = cap;
        this.selectedNode = null;
        this.selectedEdge = null;
        if (this.graph) {
            this.graph.highlightCapability(cap);
        }
        this.render();
    }

    attachEventListeners() {
        // Panel toggle - track user intent
        this.attachPanelToggleListener();

        // Navigation cards
        this.container.querySelectorAll('.nav-card').forEach(card => {
            card.addEventListener('click', () => {
                const type = card.dataset.type;
                const value = card.dataset.value;

                if (type === 'key') {
                    this.selectKey(value);
                } else if (type === 'value') {
                    const key = card.dataset.key;
                    this.selectValue(key, value);
                }
            });
        });

        // Cap items
        this.container.querySelectorAll('.cap-item').forEach(item => {
            item.addEventListener('click', () => {
                const urn = item.dataset.urn;
                const cap = this.findCapByUrn(urn);
                if (!cap) {
                    throw new Error(`Capability not found for URN: ${urn}`);
                }
                this.selectCap(cap);
            });
        });
    }

    attachDetailEventListeners() {
        // Panel toggle and back button
        this.attachPanelToggleListener();

        // JSON button - open URN in new tab
        const jsonBtn = this.container.querySelector('.panel-json-btn');
        if (jsonBtn && this.selectedCap) {
            jsonBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const urn = this.getCapUrnString(this.selectedCap);
                window.open(this.buildCapDagUrl(urn), '_blank');
            });
        }

        // Clickable IO badges - navigate to media node
        this.attachClickableMediaBadges();
    }

    // Attach click handlers for clickable media badges
    attachClickableMediaBadges() {
        this.container.querySelectorAll('.io-badge.clickable').forEach(badge => {
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                const mediaUrn = badge.dataset.mediaUrn;
                if (mediaUrn) {
                    this.navigateToNode(mediaUrn);
                }
            });
        });
    }
    
    // Navigation logic
    get filteredCaps() {
        let filtered = this.caps;
        
        for (const breadcrumb of this.breadcrumbs) {
            filtered = filtered.filter(cap => 
                this.getCapTags(cap)[breadcrumb.key] === breadcrumb.value
            );
        }
        
        return filtered;
    }
    
    selectKey(key) {
        this.isGoingBack = false;
        const availableValues = this.getUniqueValues(key, this.filteredCaps);
        this.currentLevel = { type: 'valueSelection', data: { key, values: availableValues } };
        // Key selection doesn't change breadcrumbs, so no URL update needed
        this.render();
    }

    selectValue(key, value) {
        this.isGoingBack = false;
        this.breadcrumbs.push({ key, value });

        // If only one capability remains, automatically show detail view
        if (this.filteredCaps.length === 1) {
            this.selectedCap = this.filteredCaps[0];
            this.updateUrlState();
            this.render();
            return;
        }

        const remainingKeys = this.getAvailableKeys(this.filteredCaps);

        // If only one key remains, automatically select it
        if (remainingKeys.length === 1) {
            const autoKey = remainingKeys[0];
            const availableValues = this.getUniqueValues(autoKey, this.filteredCaps);
            this.currentLevel = { type: 'valueSelection', data: { key: autoKey, values: availableValues } };
        } else {
            this.currentLevel = { type: 'keySelection', data: remainingKeys };
        }

        this.updateUrlState();
        this.render();
    }

    resetToHome() {
        this.isGoingBack = true;
        this.breadcrumbs = [];
        this.selectedCap = null;

        // If only one capability total, automatically show detail view
        if (this.caps.length === 1) {
            this.selectedCap = this.caps[0];
            this.updateUrlState();
            this.render();
            return;
        }

        const allKeys = this.getAvailableKeys(this.caps);

        // If only one key available at start, automatically select it
        if (allKeys.length === 1) {
            const autoKey = allKeys[0];
            const availableValues = this.getUniqueValues(autoKey, this.caps);
            this.currentLevel = { type: 'valueSelection', data: { key: autoKey, values: availableValues } };
        } else {
            this.currentLevel = { type: 'keySelection', data: allKeys };
        }

        this.updateUrlState();
        this.render();
    }

    jumpToBreadcrumb(targetIndex) {
        // If clicking the last breadcrumb, do nothing
        if (targetIndex === this.breadcrumbs.length - 1) {
            return;
        }

        this.isGoingBack = true;

        // Remove breadcrumbs after the target
        this.breadcrumbs = this.breadcrumbs.slice(0, targetIndex + 1);

        const remainingKeys = this.getAvailableKeys(this.filteredCaps);

        // If only one key remains after jumping back, automatically select it
        if (remainingKeys.length === 1) {
            const autoKey = remainingKeys[0];
            const availableValues = this.getUniqueValues(autoKey, this.filteredCaps);
            this.currentLevel = { type: 'valueSelection', data: { key: autoKey, values: availableValues } };
        } else {
            this.currentLevel = { type: 'keySelection', data: remainingKeys };
        }

        this.updateUrlState();
        this.render();
    }

    selectCap(cap) {
        this.isGoingBack = false;
        this.selectedCap = cap;
        this.selectedNode = null;
        this.selectedEdge = null;
        this.updateUrlState();
        this.render();

        // Notify graph to highlight the corresponding edge
        if (this.graph) {
            this.graph.highlightCapability(cap);
        }
    }
    
    // Cap parsing - use TaggedUrn for flexibility (doesn't require in/out tags)
    getCapUrnString(cap) {
        if (!cap.urn) {
            throw new Error('Capability is missing URN');
        }

        // If urn is an object with tags, build using TaggedUrnBuilder
        if (typeof cap.urn === 'object' && cap.urn.tags) {
            let builder = new TaggedUrnBuilder('cap');
            for (const [key, value] of Object.entries(cap.urn.tags)) {
                // Skip empty/whitespace values - they shouldn't be in the URN
                if (!value || (typeof value === 'string' && value.trim() === '')) {
                    console.log('[DEBUG] Skipping empty tag:', key, '=', JSON.stringify(value), 'in cap:', cap.title);
                    continue;
                }
                builder = builder.tag(key, value);
            }
            const result = builder.build().toString();
            console.log('[DEBUG] getCapUrnString result:', result, 'from tags:', JSON.stringify(cap.urn.tags));
            return result;
        }

        // If urn is a string, parse and re-serialize for canonical form
        if (typeof cap.urn === 'string') {
            console.log('[DEBUG] getCapUrnString from string:', cap.urn);
            const taggedUrn = TaggedUrn.fromString(cap.urn);
            return taggedUrn.toString();
        }

        throw new Error(`Invalid URN format: ${JSON.stringify(cap.urn)}`);
    }

    getCapTags(cap) {
        if (!cap.urn) {
            throw new Error('Capability is missing URN');
        }

        // If urn is an object with tags, return the tags (filtering out empty values)
        if (typeof cap.urn === 'object' && cap.urn.tags) {
            const filtered = {};
            for (const [key, value] of Object.entries(cap.urn.tags)) {
                if (value !== '' && value !== null && value !== undefined) {
                    filtered[key] = value;
                }
            }
            return filtered;
        }

        // If urn is a string, parse it using TaggedUrn
        if (typeof cap.urn === 'string') {
            const taggedUrn = TaggedUrn.fromString(cap.urn);
            return taggedUrn.tags;
        }

        throw new Error(`Unknown URN format: ${JSON.stringify(cap.urn)}`);
    }
    
    getAvailableKeys(caps) {
        const allKeys = new Set();
        
        for (const cap of caps) {
            const tags = this.getCapTags(cap);
            Object.keys(tags).forEach(key => allKeys.add(key));
        }
        
        // Remove keys that are already selected in breadcrumbs
        const selectedKeys = new Set(this.breadcrumbs.map(b => b.key));
        selectedKeys.forEach(key => allKeys.delete(key));
        
        // Remove keys that have only one possible value (no filtering benefit)
        const keysWithMultipleValues = Array.from(allKeys).filter(key => {
            const uniqueValues = this.getUniqueValues(key, caps);
            return uniqueValues.length > 1;
        });
        
        return keysWithMultipleValues.sort();
    }
    
    getUniqueValues(key, caps) {
        const values = new Set();
        
        for (const cap of caps) {
            const tags = this.getCapTags(cap);
            if (tags[key]) {
                values.add(tags[key]);
            }
        }
        
        return Array.from(values).sort();
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        // innerHTML escapes < > & but not quotes - we need to escape " for use in attributes
        return div.innerHTML.replace(/"/g, '&quot;');
    }
    
    buildCurrentUrn() {
        // If no breadcrumbs, return just cap:
        if (this.breadcrumbs.length === 0) {
            return 'cap:';
        }

        // Use TaggedUrnBuilder for partial URNs (breadcrumbs don't have full in/out specs)
        let builder = new TaggedUrnBuilder('cap');
        for (const crumb of this.breadcrumbs) {
            builder = builder.tag(crumb.key, crumb.value);
        }
        return builder.build().toString();
    }
    
    // Schema visualization methods
    createSchemaPreview(schema) {
        if (!schema) return '';

        let fields = [];

        if (schema.type === 'object' && schema.properties) {
            const properties = schema.properties;
            const required = schema.required || [];

            for (const [fieldName, fieldDef] of Object.entries(properties)) {
                const isRequired = required.includes(fieldName);
                const fieldType = this.getFieldTypeLabel(fieldDef.type);
                const requiredMark = isRequired ? '*' : '';

                fields.push({
                    name: fieldName,
                    type: fieldType,
                    required: isRequired,
                    display: `${fieldName}${requiredMark}:${fieldType}`
                });
            }
        } else if (schema.type === 'array' && schema.items) {
            const itemType = this.getFieldTypeLabel(schema.items.type || 'any');
            fields.push({
                name: 'items',
                type: itemType,
                required: true,
                display: `[${itemType}]`
            });

            if (schema.items.type === 'object' && schema.items.properties) {
                const itemProps = Object.keys(schema.items.properties).slice(0, 3);
                if (itemProps.length > 0) {
                    const propsDisplay = itemProps.join(',');
                    fields[0].display = `[{${propsDisplay}${itemProps.length > 3 ? '...' : ''}}]`;
                }
            }
        }

        if (fields.length === 0) {
            return '';
        }

        const maxFields = 8;
        const displayFields = fields.slice(0, maxFields);
        const hasMore = fields.length > maxFields;

        const fieldsHtml = displayFields.map(field =>
            `<span class="struct-field ${field.required ? 'required-field' : 'optional-field'}"
                   title="${field.name}: ${field.type}${field.required ? ' (required)' : ' (optional)'}">${this.escapeHtml(field.display)}</span>`
        ).join('');

        const moreIndicator = hasMore ? `<span class="struct-more" title="+ ${fields.length - maxFields} more fields">+${fields.length - maxFields}</span>` : '';

        return `<div class="object-structure" title="Object structure: ${fields.length} field${fields.length !== 1 ? 's' : ''}">${fieldsHtml}${moreIndicator}</div>`;
    }
    
    getFieldTypeLabel(type) {
        const typeMap = {
            'string': 'str',
            'integer': 'int',
            'number': 'num',
            'boolean': 'bool',
            'object': 'obj',
            'array': 'arr',
            'null': 'null'
        };
        return typeMap[type] || 'any';
    }
    
    createDetailedSchemaView(schema) {
        if (schema.type === 'object' && schema.properties) {
            return this.createObjectSchemaView(schema);
        } else if (schema.type === 'array' && schema.items) {
            return this.createArraySchemaView(schema);
        }
        // Display raw schema for unhandled structures
        return `<pre class="detail-json">${this.escapeHtml(JSON.stringify(schema, null, 2))}</pre>`;
    }
    
    createObjectSchemaView(schema) {
        const properties = schema.properties || {};
        const required = schema.required || [];
        
        const fieldsHtml = Object.entries(properties).map(([name, fieldDef]) => {
            const isRequired = required.includes(name);
            const type = fieldDef.type || 'any';
            const description = fieldDef.description || '';
            const constraints = this.getFieldConstraints(fieldDef);
            
            return `
                <div class="detail-field ${isRequired ? 'required' : 'optional'}">
                    <div class="field-header">
                        <span class="field-name">${this.escapeHtml(name)}</span>
                        <span class="field-type">${type}</span>
                        ${isRequired ? '<span class="req-badge">REQ</span>' : '<span class="opt-badge">OPT</span>'}
                    </div>
                    ${description ? `<div class="field-desc">${this.escapeHtml(description)}</div>` : ''}
                    ${constraints ? `<div class="field-constraints">${this.escapeHtml(constraints)}</div>` : ''}
                </div>
            `;
        }).join('');
        
        return `<div class="object-details">${fieldsHtml}</div>`;
    }
    
    createArraySchemaView(schema) {
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
            const objectHtml = this.createObjectSchemaView(items);
            return `
                <div class="array-details">
                    <div class="array-header">Array of objects ${constraintsHtml}</div>
                    ${objectHtml}
                </div>
            `;
        } else {
            const itemConstraints = this.getFieldConstraints(items);
            return `
                <div class="array-details">
                    <div class="array-header">Array of ${itemType} ${constraintsHtml}</div>
                    ${itemConstraints ? `<div class="item-constraints">${this.escapeHtml(itemConstraints)}</div>` : ''}
                </div>
            `;
        }
    }
    
    getFieldConstraints(fieldDef) {
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
}

// Export for browser use
window.CapNavigator = CapNavigator;
