/**
 * UserCapGraph - Embedded capability graph for dashboard
 * Simplified version of CapGraphVisualization for user's own caps
 */
class UserCapGraph {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container element '${containerId}' not found`);
        }
        this.options = {
            height: options.height || 300,
            ...options
        };
        this.cy = null;
        this.nodes = [];
        this.edges = [];
        this.capabilities = [];
        this.isFullscreen = false;
        this.tooltip = null;

        // Theme change handling
        this.themeObserver = null;
        this.setupThemeObserver();
        this.createTooltip();
    }

    /**
     * Create tooltip element for hover display
     */
    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'graph-tooltip';
        this.tooltip.style.cssText = `
            position: fixed;
            display: none;
            background: var(--bg-elevated, #1e293b);
            border: 1px solid var(--border-primary, #334155);
            border-radius: 6px;
            padding: 6px 10px;
            font-family: var(--font-mono, monospace);
            font-size: 11px;
            color: var(--text-secondary, #94a3b8);
            max-width: 400px;
            word-break: break-all;
            z-index: 10000;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        document.body.appendChild(this.tooltip);
    }

    showTooltip(content, x, y) {
        if (!this.tooltip) return;
        this.tooltip.textContent = content;
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = (x + 12) + 'px';
        this.tooltip.style.top = (y + 12) + 'px';

        const rect = this.tooltip.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.tooltip.style.left = (x - rect.width - 12) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            this.tooltip.style.top = (y - rect.height - 12) + 'px';
        }
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
    }

    /**
     * Get a CSS custom property value from the document
     */
    getCssVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    /**
     * Set up observer for theme changes
     */
    setupThemeObserver() {
        this.themeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.attributeName === 'data-theme') {
                    this.updateStylesForTheme();
                }
            }
        });

        this.themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    /**
     * Update graph styles when theme changes
     */
    updateStylesForTheme() {
        if (!this.cy) return;

        // Update node colors based on new theme
        this.cy.nodes().forEach(node => {
            const namespace = node.data('namespace');
            node.data('color', this.getNamespaceColor(namespace));
        });

        // Apply new stylesheet
        this.cy.style(this.buildStylesheet());
    }

    destroy() {
        if (this.themeObserver) {
            this.themeObserver.disconnect();
            this.themeObserver = null;
        }
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip);
            this.tooltip = null;
        }
        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
        }
    }

    /**
     * Build graph from user's capabilities
     */
    buildFromCapabilities(capabilities) {
        this.capabilities = capabilities;
        const nodesMap = new Map();
        const edges = [];

        for (const capData of capabilities) {
            try {
                let urn;
                if (typeof capData.urn === 'string') {
                    urn = CapUrn.fromString(capData.urn);
                } else if (capData.urn && capData.urn.tags) {
                    urn = CapUrn.fromTags(capData.urn.tags);
                } else {
                    throw new Error('Invalid URN format');
                }

                const inSpec = urn.getInSpec();
                const outSpec = urn.getOutSpec();

                if (!nodesMap.has(inSpec)) {
                    nodesMap.set(inSpec, this.parseSpecId(inSpec));
                }
                if (!nodesMap.has(outSpec)) {
                    nodesMap.set(outSpec, this.parseSpecId(outSpec));
                }

                const tags = urn.tags;
                const op = tags.op || tags.operation || '';
                const edgeId = `edge-${edges.length}`;

                edges.push({
                    id: edgeId,
                    source: inSpec,
                    target: outSpec,
                    op: op,
                    title: capData.title || capData.name || op || 'Capability',
                    capability: capData
                });
            } catch (e) {
                console.warn('Skipping invalid capability:', capData.urn, e);
            }
        }

        this.nodes = Array.from(nodesMap.values());
        this.edges = edges;

        // Assign colors to edges using golden angle distribution
        const goldenAngle = 137.508;
        this.edges.forEach((edge, i) => {
            const hue = (i * goldenAngle) % 360;
            edge.color = `hsl(${hue}, 60%, 55%)`;
        });

        return this;
    }

    parseSpecId(specId) {
        const match = specId.match(/^([^:]+):([^.]+)(?:\.(.+))?$/);
        if (match) {
            return { id: specId, namespace: match[1], name: match[2], version: match[3] || '' };
        }
        return { id: specId, namespace: '', name: specId, version: '' };
    }

    getNamespaceColor(namespace) {
        const colorMap = {
            'std': this.getCssVar('--graph-ns-std'),
            'capdag': this.getCssVar('--graph-ns-capdag'),
            'machfab': this.getCssVar('--graph-ns-machfab')
        };
        return colorMap[namespace] || this.getCssVar('--graph-ns-default');
    }

    render() {
        if (!this.container || !this.nodes || this.nodes.length === 0) {
            this.container.innerHTML = '<div class="graph-empty"><p>No conversion graph available</p></div>';
            return;
        }

        // Clear container
        this.container.innerHTML = '';

        // Create Cytoscape elements
        const elements = this.buildCytoscapeElements();
        const self = this;

        // Initialize Cytoscape with elkjs layout
        this.cy = cytoscape({
            container: this.container,
            elements: elements,
            layout: {
                name: 'elk',
                elk: {
                    algorithm: 'layered',
                    'elk.direction': 'RIGHT',
                    'elk.layered.spacing.nodeNodeBetweenLayers': 100,
                    'elk.spacing.nodeNode': 40,
                    'elk.edgeRouting': 'POLYLINE',
                    'elk.layered.spacing.edgeEdgeBetweenLayers': 15,
                    'elk.layered.spacing.edgeNodeBetweenLayers': 20,
                    'elk.spacing.edgeEdge': 10,
                    'elk.spacing.edgeNode': 15,
                    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
                    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX'
                },
                stop: function() {
                    self.cy.resize();
                    self.cy.fit(undefined, 30);
                }
            },
            style: this.buildStylesheet(),
            minZoom: 0.2,
            maxZoom: 3,
            wheelSensitivity: 0.3,
            boxSelectionEnabled: false
        });

        // Resize handlers
        const resizeGraph = () => {
            this.cy.resize();
            this.cy.fit(undefined, 30);
        };

        this.cy.on('ready', resizeGraph);
        requestAnimationFrame(resizeGraph);
        setTimeout(resizeGraph, 100);

        // Hover effects with tooltips
        this.cy.on('mouseover', 'node', function(evt) {
            evt.target.addClass('highlighted');
            const fullUrn = evt.target.data('fullUrn') || evt.target.data('id');
            self.showTooltip(fullUrn, evt.originalEvent.clientX, evt.originalEvent.clientY);
        });
        this.cy.on('mouseout', 'node', function(evt) {
            evt.target.removeClass('highlighted');
            self.hideTooltip();
        });
        this.cy.on('mousemove', 'node', function(evt) {
            const fullUrn = evt.target.data('fullUrn') || evt.target.data('id');
            self.showTooltip(fullUrn, evt.originalEvent.clientX, evt.originalEvent.clientY);
        });
        this.cy.on('mouseover', 'edge', function(evt) {
            evt.target.addClass('highlighted');
            evt.target.source().addClass('highlighted');
            evt.target.target().addClass('highlighted');
            const fullUrn = evt.target.data('fullUrn');
            if (fullUrn) {
                self.showTooltip(fullUrn, evt.originalEvent.clientX, evt.originalEvent.clientY);
            }
        });
        this.cy.on('mouseout', 'edge', function(evt) {
            evt.target.removeClass('highlighted');
            evt.target.source().removeClass('highlighted');
            evt.target.target().removeClass('highlighted');
            self.hideTooltip();
        });
        this.cy.on('mousemove', 'edge', function(evt) {
            const fullUrn = evt.target.data('fullUrn');
            if (fullUrn) {
                self.showTooltip(fullUrn, evt.originalEvent.clientX, evt.originalEvent.clientY);
            }
        });

        // Double-click to reset view
        this.cy.on('dbltap', function(evt) {
            if (evt.target === self.cy) {
                self.cy.fit(undefined, 30);
            }
        });
    }

    buildCytoscapeElements() {
        const nodeElements = this.nodes.map(node => ({
            group: 'nodes',
            data: {
                id: node.id,
                label: this.formatNodeLabel(node),
                fullUrn: node.id,  // Store full URN for tooltip
                namespace: node.namespace,
                name: node.name,
                version: node.version,
                color: this.getNamespaceColor(node.namespace)
            }
        }));

        const edgeElements = this.edges.map(edge => ({
            group: 'edges',
            data: {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                label: edge.title || edge.op,  // Prefer title over op
                op: edge.op,
                title: edge.title,
                fullUrn: this.getCapabilityUrn(edge.capability),  // Store full URN for tooltip
                color: edge.color
            }
        }));

        return [...nodeElements, ...edgeElements];
    }

    /**
     * Get the full URN string from a capability
     */
    getCapabilityUrn(capability) {
        if (!capability || !capability.urn) return '';
        if (typeof capability.urn === 'string') return capability.urn;
        if (capability.urn.tags) {
            try {
                return CapUrn.fromTags(capability.urn.tags).toString();
            } catch (e) {
                return '';
            }
        }
        return '';
    }

    /**
     * Extract short type name from media URN
     * e.g., "media:video;bytes" -> "video"
     */
    extractTypeName(mediaUrn) {
        if (!mediaUrn || typeof mediaUrn !== 'string') return 'unknown';
        const typeMatch = mediaUrn.match(/type=([^;]+)/);
        return typeMatch ? typeMatch[1] : 'unknown';
    }

    formatNodeLabel(node) {
        // Show just the type name for cleaner display
        return this.extractTypeName(node.id);
    }

    buildStylesheet() {
        const nodeText = this.getCssVar('--graph-node-text');
        const nodeBorder = this.getCssVar('--graph-node-border');
        const nodeBorderHighlighted = this.getCssVar('--graph-node-border-highlighted');
        const edgeTextBg = this.getCssVar('--graph-edge-text-bg');
        const edgeTextBgOpacity = parseFloat(this.getCssVar('--graph-edge-text-bg-opacity')) || 0.9;

        return [
            // Node styles
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-family': '"JetBrains Mono", monospace',
                    'font-size': '9px',
                    'font-weight': '500',
                    'color': nodeText,
                    'background-color': 'data(color)',
                    'shape': 'round-rectangle',
                    'width': 'label',
                    'height': '24px',
                    'padding': '10px',
                    'border-width': '1px',
                    'border-color': nodeBorder,
                    'border-opacity': 0.8,
                    'transition-property': 'border-color, border-width',
                    'transition-duration': '0.15s'
                }
            },
            {
                selector: 'node.highlighted',
                style: {
                    'border-width': '2px',
                    'border-color': nodeBorderHighlighted
                }
            },
            // Edge styles
            {
                selector: 'edge',
                style: {
                    'label': 'data(label)',
                    'font-family': '"JetBrains Mono", monospace',
                    'font-size': '8px',
                    'font-weight': '500',
                    'color': 'data(color)',
                    'text-background-color': edgeTextBg,
                    'text-background-opacity': edgeTextBgOpacity,
                    'text-background-padding': '2px',
                    'text-background-shape': 'roundrectangle',
                    'text-rotation': 'autorotate',
                    'text-margin-y': -6,
                    'curve-style': 'bezier',
                    'control-point-step-size': 30,
                    'width': 1.5,
                    'line-color': 'data(color)',
                    'target-arrow-color': 'data(color)',
                    'target-arrow-shape': 'triangle',
                    'arrow-scale': 0.7,
                    'transition-property': 'width',
                    'transition-duration': '0.15s'
                }
            },
            {
                selector: 'edge.highlighted',
                style: {
                    'width': 2.5
                }
            }
        ];
    }

    toggleFullscreen() {
        this.isFullscreen = !this.isFullscreen;
        const btn = document.getElementById('graph-fullscreen-btn');

        if (this.isFullscreen) {
            this.container.classList.add('fullscreen');
            document.body.classList.add('fullscreen-graph-mode');
            if (btn) btn.textContent = 'Collapse';
        } else {
            this.container.classList.remove('fullscreen');
            document.body.classList.remove('fullscreen-graph-mode');
            if (btn) btn.textContent = 'Expand';
        }

        // Resize graph after fullscreen toggle
        if (this.cy) {
            setTimeout(() => {
                this.cy.resize();
                this.cy.fit(undefined, this.isFullscreen ? 50 : 30);
            }, 100);
        }
    }
}

window.UserCapGraph = UserCapGraph;
