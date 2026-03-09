/**
 * CapGraph Visualization using Cytoscape.js + elkjs
 * Hierarchical layered layout for capability DAG visualization
 */

class CapGraphVisualization {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container element '${containerId}' not found`);
    }
    this.options = {
      width: options.width || 900,
      height: options.height || 500,
      ...options
    };
    this.cy = null;
    this.nodes = [];
    this.edges = [];
    this.adjacency = new Map();
    this.reverseAdj = new Map();
    this.navigator = null;
    this.selectedElement = null;
    this.capabilitiesByEdgeId = new Map();
    this.tooltip = null;  // Tooltip element

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

  /**
   * Show tooltip at position with content
   */
  showTooltip(content, x, y) {
    if (!this.tooltip) return;
    this.tooltip.textContent = content;
    this.tooltip.style.display = 'block';
    // Position slightly offset from cursor
    this.tooltip.style.left = (x + 12) + 'px';
    this.tooltip.style.top = (y + 12) + 'px';

    // Adjust if off-screen
    const rect = this.tooltip.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.tooltip.style.left = (x - rect.width - 12) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      this.tooltip.style.top = (y - rect.height - 12) + 'px';
    }
  }

  /**
   * Hide tooltip
   */
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
   * Set up observer for theme changes (data-theme attribute on html)
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

  setNavigator(navigator) {
    this.navigator = navigator;
  }

  /**
   * Highlight an edge corresponding to a capability (called by navigator)
   */
  highlightCapability(cap) {
    if (!this.cy) return;

    // Get capability URN - handle both string and object formats
    const capUrn = this.getCapabilityUrn(cap);
    if (!capUrn) return;

    // Look through our capability map to find the edge
    for (const [edgeId, edgeCap] of this.capabilitiesByEdgeId) {
      const edgeCapUrn = this.getCapabilityUrn(edgeCap);
      if (this.capUrnsMatch(edgeCapUrn, capUrn)) {
        const edge = this.cy.getElementById(edgeId);
        if (edge && edge.length > 0) {
          // Clear previous selection and highlight this edge
          this.selectedElement = { type: 'edge', element: edge };
          this.highlightEdge(edge, false);
          edge.addClass('active');

          // Zoom to fit the edge and its connected nodes
          const sourceNode = edge.source();
          const targetNode = edge.target();
          this.cy.animate({
            fit: { eles: edge.union(sourceNode).union(targetNode), padding: 100 },
            duration: 400,
            easing: 'ease-out-cubic'
          });
        }
        return;
      }
    }
  }

  buildFromCapabilities(capabilities) {
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

        this.capabilitiesByEdgeId.set(edgeId, capData);
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

    // Build adjacency maps for reachability
    this.adjacency = new Map();
    this.reverseAdj = new Map();
    edges.forEach(e => {
      if (!this.adjacency.has(e.source)) this.adjacency.set(e.source, new Set());
      this.adjacency.get(e.source).add(e.target);
      if (!this.reverseAdj.has(e.target)) this.reverseAdj.set(e.target, new Set());
      this.reverseAdj.get(e.target).add(e.source);
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

  findReachableFrom(startId) {
    const reachable = new Set([startId]);
    const queue = [startId];
    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = this.adjacency.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!reachable.has(neighbor)) {
            reachable.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }
    return reachable;
  }

  findReachableTo(targetId) {
    const canReach = new Set([targetId]);
    const queue = [targetId];
    while (queue.length > 0) {
      const current = queue.shift();
      const predecessors = this.reverseAdj.get(current);
      if (predecessors) {
        for (const pred of predecessors) {
          if (!canReach.has(pred)) {
            canReach.add(pred);
            queue.push(pred);
          }
        }
      }
    }
    return canReach;
  }

  findConnected(nodeId) {
    const reachableFrom = this.findReachableFrom(nodeId);
    const reachableTo = this.findReachableTo(nodeId);
    return new Set([...reachableFrom, ...reachableTo]);
  }

  render() {
    if (!this.container || !this.nodes || this.nodes.length === 0) {
      this.container.innerHTML = '<div class="cap-graph-empty"><p>No conversion graph available</p></div>';
      return;
    }

    // Clear container - it serves as the viewport
    this.container.innerHTML = '';

    // Set explicit dimensions to viewport size
    this.container.style.width = window.innerWidth + 'px';
    this.container.style.height = window.innerHeight + 'px';

    const viewport = this.container;

    // Create Cytoscape elements
    const elements = this.buildCytoscapeElements();

    // Store reference to self for callbacks
    const self = this;

    // Initialize Cytoscape with elkjs layout
    this.cy = cytoscape({
      container: viewport,
      elements: elements,
      layout: {
        name: 'elk',
        elk: {
          algorithm: 'layered',
          'elk.direction': 'RIGHT',
          'elk.layered.spacing.nodeNodeBetweenLayers': 150,
          'elk.spacing.nodeNode': 50,
          'elk.edgeRouting': 'POLYLINE',
          'elk.layered.spacing.edgeEdgeBetweenLayers': 20,
          'elk.layered.spacing.edgeNodeBetweenLayers': 30,
          'elk.spacing.edgeEdge': 15,
          'elk.spacing.edgeNode': 25,
          'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
          'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
          'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
          'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED'
        },
        // Callback when layout finishes - resize and fit
        stop: function() {
          self.cy.resize();
          self.cy.fit(undefined, 50);
        }
      },
      style: this.buildStylesheet(),
      minZoom: 0.1,
      maxZoom: 4,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false
    });

    // Ensure resize happens after initial render and layout
    const resizeGraph = () => {
      this.cy.resize();
      this.cy.fit(undefined, 50);
    };

    // Listen for Cytoscape ready event
    this.cy.on('ready', resizeGraph);

    // Multiple resize attempts to handle async CSS/layout updates
    requestAnimationFrame(resizeGraph);
    setTimeout(resizeGraph, 100);
    setTimeout(resizeGraph, 300);

    this.setupEventHandlers();
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

    const normalEdgeElements = this.edges.map(edge => ({
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

    console.log('[CapGraph] Building elements:', nodeElements.length, 'nodes,', normalEdgeElements.length, 'edges');

    return [...nodeElements, ...normalEdgeElements];
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
   * Check if two cap URNs match using CapUrn matching semantics
   * @param {string} urn1 - First cap URN string
   * @param {string} urn2 - Second cap URN string
   * @returns {boolean} Whether the URNs match
   */
  capUrnsMatch(urn1, urn2) {
    if (!urn1 || !urn2) return false;
    if (urn1 === urn2) return true; // Fast path for exact match
    try {
      const parsed1 = CapUrn.fromString(urn1);
      const parsed2 = CapUrn.fromString(urn2);
      // Check both directions since matching is directional (handler vs request)
      return parsed1.accepts(parsed2) || parsed2.accepts(parsed1);
    } catch {
      return false;
    }
  }

  /**
   * Format media URN for node label - show all tags on separate lines
   * Omit media: prefix, change = to :, use \n for line breaks
   * e.g., "media:video;bytes" -> "type: video\nv: 1\nbinary"
   */
  formatNodeLabel(node) {
    const mediaUrn = node.id;
    if (!mediaUrn || typeof mediaUrn !== 'string') {
      throw new Error('Invalid media URN for node');
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

      // Join with \n for multi-line display in Cytoscape
      return formattedTags.join('\n');
    } catch (error) {
      throw new Error(`Cannot parse media URN '${mediaUrn}': ${error.message}`);
    }
  }

  buildStylesheet() {
    // Read all CSS variables for current theme
    const nodeText = this.getCssVar('--graph-node-text');
    const nodeBorder = this.getCssVar('--graph-node-border');
    const nodeBorderHighlighted = this.getCssVar('--graph-node-border-highlighted');
    const nodeBorderActive = this.getCssVar('--graph-node-border-active');
    const edgeTextBg = this.getCssVar('--graph-edge-text-bg');
    const edgeTextBgOpacity = parseFloat(this.getCssVar('--graph-edge-text-bg-opacity')) || 0.9;
    const graphOverlay = this.getCssVar('--graph-overlay');
    const fadedOpacity = parseFloat(this.getCssVar('--graph-faded-opacity')) || 0.15;
    const fadedEdgeOpacity = parseFloat(this.getCssVar('--graph-faded-edge-opacity')) || 0.1;

    return [
      // Node styles
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'text-wrap': 'wrap',
          'text-max-width': '150px',
          'line-height': 1.3,
          'font-family': '"JetBrains Mono", monospace',
          'font-size': '9px',
          'font-weight': '500',
          'color': nodeText,
          'text-outline-color': 'data(color)',
          'text-outline-width': '0px',
          'background-color': 'data(color)',
          'shape': 'round-rectangle',
          'width': 'label',
          'height': 'label',
          'padding': '12px',
          'border-width': '2px',
          'border-color': nodeBorder,
          'border-opacity': 0.8,
          'transition-property': 'opacity, border-color, border-width',
          'transition-duration': '0.2s'
        }
      },
      {
        selector: 'node:active',
        style: {
          'overlay-opacity': 0.1,
          'overlay-color': nodeText
        }
      },
      {
        selector: 'node.highlighted',
        style: {
          'border-width': '3px',
          'border-color': nodeBorderHighlighted
        }
      },
      {
        selector: 'node.active',
        style: {
          'border-width': '3px',
          'border-color': nodeBorderActive,
          'z-index': 999
        }
      },
      {
        selector: 'node.faded',
        style: {
          'opacity': fadedOpacity
        }
      },
      // Edge styles
      {
        selector: 'edge',
        style: {
          'label': 'data(label)',
          'font-family': '"JetBrains Mono", monospace',
          'font-size': '9px',
          'font-weight': '500',
          'color': 'data(color)',
          'text-background-color': edgeTextBg,
          'text-background-opacity': edgeTextBgOpacity,
          'text-background-padding': '3px',
          'text-background-shape': 'roundrectangle',
          'text-rotation': 'autorotate',
          'text-margin-y': -8,
          'curve-style': 'bezier',
          'control-point-step-size': 40,
          'width': 1.5,
          'line-color': 'data(color)',
          'target-arrow-color': 'data(color)',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.8,
          'transition-property': 'opacity, width',
          'transition-duration': '0.2s'
        }
      },
      {
        selector: 'edge:active',
        style: {
          'overlay-opacity': 0
        }
      },
      {
        selector: 'edge.highlighted',
        style: {
          'width': 2.5,
          'z-index': 999
        }
      },
      {
        selector: 'edge.active',
        style: {
          'width': 3,
          'z-index': 1000
        }
      },
      {
        selector: 'edge.faded',
        style: {
          'opacity': fadedEdgeOpacity
        }
      }
    ];
  }

  setupEventHandlers() {
    const self = this;

    // Click on node - highlight connected subgraph and show info
    this.cy.on('tap', 'node', function(evt) {
      evt.stopPropagation();
      const node = evt.target;
      self.selectNode(node);
    });

    // Click on edge - highlight edge and endpoints, show info
    this.cy.on('tap', 'edge', function(evt) {
      evt.stopPropagation();
      const edge = evt.target;
      self.selectEdge(edge);
    });

    // Click on background - clear selection
    this.cy.on('tap', function(evt) {
      if (evt.target === self.cy) {
        self.clearSelection();
      }
    });

    // Double-click on background - reset view
    this.cy.on('dbltap', function(evt) {
      if (evt.target === self.cy) {
        self.clearSelection();
        self.cy.fit(undefined, 50);
      }
    });

    // Hover on node - temporary highlight and show tooltip
    this.cy.on('mouseover', 'node', function(evt) {
      const node = evt.target;
      const fullUrn = node.data('fullUrn') || node.data('id');
      self.showTooltip(fullUrn, evt.originalEvent.clientX, evt.originalEvent.clientY);

      if (!self.hasActiveSelection()) {
        self.highlightConnected(node.id(), true);
      }
    });

    this.cy.on('mouseout', 'node', function() {
      self.hideTooltip();
      if (!self.hasActiveSelection()) {
        self.clearHighlighting();
      }
    });

    // Track mouse movement for tooltip positioning
    this.cy.on('mousemove', 'node', function(evt) {
      const node = evt.target;
      const fullUrn = node.data('fullUrn') || node.data('id');
      self.showTooltip(fullUrn, evt.originalEvent.clientX, evt.originalEvent.clientY);
    });

    // Hover on edge - highlight edge and endpoints, show tooltip
    this.cy.on('mouseover', 'edge', function(evt) {
      const edge = evt.target;
      const fullUrn = edge.data('fullUrn');
      if (fullUrn) {
        self.showTooltip(fullUrn, evt.originalEvent.clientX, evt.originalEvent.clientY);
      }

      if (!self.hasActiveSelection()) {
        self.highlightEdge(edge, true);
      }
    });

    this.cy.on('mouseout', 'edge', function() {
      self.hideTooltip();
      if (!self.hasActiveSelection()) {
        self.clearHighlighting();
      }
    });

    // Track mouse movement for tooltip positioning
    this.cy.on('mousemove', 'edge', function(evt) {
      const edge = evt.target;
      const fullUrn = edge.data('fullUrn');
      if (fullUrn) {
        self.showTooltip(fullUrn, evt.originalEvent.clientX, evt.originalEvent.clientY);
      }
    });
  }

  hasActiveSelection() {
    return this.selectedElement !== null;
  }

  selectNode(node, skipNavigatorUpdate = false) {
    this.selectedElement = { type: 'node', element: node };
    const nodeId = node.id();
    this.highlightConnected(nodeId, false);
    node.addClass('active');

    // Use navigator for details panel (skip if call originated from navigator)
    if (this.navigator && !skipNavigatorUpdate) {
      const nodeData = node.data();
      this.navigator.showNodeDetail(nodeData);
    }

    // Zoom to fit connected subgraph
    const connected = this.findConnected(nodeId);
    const connectedElements = this.cy.nodes().filter(n => connected.has(n.id()));
    if (connectedElements.length > 0) {
      this.cy.animate({
        fit: { eles: connectedElements, padding: 60 },
        duration: 400,
        easing: 'ease-out-cubic'
      });
    }
  }

  // Select a node by its ID (used when navigating from navigator)
  // skipNavigatorUpdate: true when called from navigator to prevent circular updates
  selectNodeById(nodeId, skipNavigatorUpdate = true) {
    const node = this.cy.getElementById(nodeId);
    if (node && node.length > 0) {
      this.selectNode(node, skipNavigatorUpdate);
    }
  }

  // Get node data by ID (for navigator sync)
  getNodeData(nodeId) {
    if (!this.cy) return null;
    const node = this.cy.getElementById(nodeId);
    if (node && node.length > 0) {
      return node.data();
    }
    return null;
  }

  // Get edge data by capability URN (for navigator sync)
  getEdgeDataByCapUrn(capUrn) {
    if (!this.cy || !capUrn) return null;

    // Look through our capability map to find the edge
    for (const [edgeId, edgeCap] of this.capabilitiesByEdgeId) {
      const edgeCapUrn = this.getCapabilityUrn(edgeCap);
      if (this.capUrnsMatch(edgeCapUrn, capUrn)) {
        const edge = this.cy.getElementById(edgeId);
        if (edge && edge.length > 0) {
          return edge.data();
        }
      }
    }
    return null;
  }

  // Select an edge by capability URN (like selectEdge but by URN)
  // skipNavigatorUpdate: true when called from navigator to prevent circular updates
  selectEdgeByCapUrn(capUrn, skipNavigatorUpdate = true) {
    if (!this.cy || !capUrn) return;

    // Look through our capability map to find the edge
    for (const [edgeId, edgeCap] of this.capabilitiesByEdgeId) {
      const edgeCapUrn = this.getCapabilityUrn(edgeCap);
      if (this.capUrnsMatch(edgeCapUrn, capUrn)) {
        const edge = this.cy.getElementById(edgeId);
        if (edge && edge.length > 0) {
          this.selectEdge(edge, skipNavigatorUpdate);
          return;
        }
      }
    }
  }

  selectEdge(edge, skipNavigatorUpdate = false) {
    this.selectedElement = { type: 'edge', element: edge };
    this.highlightEdge(edge, false);
    edge.addClass('active');

    const edgeId = edge.id();
    const capability = this.capabilitiesByEdgeId.get(edgeId);

    // Use navigator for details panel (skip if call originated from navigator)
    if (this.navigator && !skipNavigatorUpdate) {
      const edgeData = edge.data();
      this.navigator.showEdgeDetail(edgeData, capability);
    }

    // Zoom to fit the edge and its connected nodes
    const sourceNode = edge.source();
    const targetNode = edge.target();
    this.cy.animate({
      fit: { eles: edge.union(sourceNode).union(targetNode), padding: 100 },
      duration: 400,
      easing: 'ease-out-cubic'
    });
  }

  highlightEdge(edge, isHover = false) {
    // Clear previous state
    this.cy.elements().removeClass('highlighted active faded');

    // Fade all elements
    this.cy.elements().addClass('faded');

    // Highlight the edge
    edge.removeClass('faded').addClass('highlighted');

    // Highlight source and target nodes
    const sourceNode = edge.source();
    const targetNode = edge.target();
    sourceNode.removeClass('faded').addClass('highlighted');
    targetNode.removeClass('faded').addClass('highlighted');
  }

  highlightConnected(nodeId, isHover = false) {
    const connected = this.findConnected(nodeId);

    // Clear previous state
    this.cy.elements().removeClass('highlighted active faded');

    // Fade all elements first
    this.cy.elements().addClass('faded');

    // Un-fade and highlight connected nodes
    this.cy.nodes().forEach(node => {
      if (connected.has(node.id())) {
        node.removeClass('faded').addClass('highlighted');
      }
    });

    // Un-fade edges that connect two connected nodes
    this.cy.edges().forEach(edge => {
      const sourceId = edge.source().id();
      const targetId = edge.target().id();

      if (connected.has(sourceId) && connected.has(targetId)) {
        edge.removeClass('faded').addClass('highlighted');
      }
    });
  }

  clearSelection() {
    this.selectedElement = null;
    this.clearHighlighting();

    // Notify navigator to clear its graph-related selection
    if (this.navigator) {
      this.navigator.clearGraphSelection();
    }
  }

  // Fit the view to show all elements
  fitAll() {
    if (!this.cy) return;
    this.cy.animate({
      fit: { eles: this.cy.elements(), padding: 50 },
      duration: 400,
      easing: 'ease-out-cubic'
    });
  }

  clearHighlighting() {
    this.cy.elements().removeClass('highlighted active faded');
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

window.CapGraphVisualization = CapGraphVisualization;
