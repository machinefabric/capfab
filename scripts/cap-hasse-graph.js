/**
 * Cap Hasse Diagram Visualization using Cytoscape.js + elkjs
 * Nodes are capabilities. Edges are cover relations in the accepts-poset.
 * Rank-based layering via CapUrn.specificity() for proper graded structure.
 */

class CapHasseVisualization {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container element '${containerId}' not found`);
    }

    this.options = {
      width: options.width || window.innerWidth,
      height: options.height || window.innerHeight,
      ...options
    };

    this.cy = null;
    this.nodes = [];
    this.edges = [];
    this.forwardAdj = new Map();
    this.reverseAdj = new Map();
    this.selectedNodeId = null;
    this.hiddenHubs = [];
    this.minRank = 0;
    this.maxRank = 0;

    this.tooltip = null;
    this.themeObserver = null;

    this.setupThemeObserver();
    this.createTooltip();
  }

  getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

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

  updateStylesForTheme() {
    if (!this.cy) return;
    this.cy.nodes().forEach((node) => {
      node.data('color', this.getNamespaceColor(node.data('namespace')));
    });
    this.cy.style(this.buildStylesheet());
  }

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
      max-width: 560px;
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
    this.tooltip.style.left = `${x + 12}px`;
    this.tooltip.style.top = `${y + 12}px`;

    const rect = this.tooltip.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.tooltip.style.left = `${x - rect.width - 12}px`;
    }
    if (rect.bottom > window.innerHeight) {
      this.tooltip.style.top = `${y - rect.height - 12}px`;
    }
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
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

  getCapabilityUrn(capability) {
    if (!capability || !capability.urn) return '';
    if (typeof capability.urn === 'string') {
      return CapUrn.fromString(capability.urn).toString();
    }
    if (capability.urn.tags) {
      return CapUrn.fromTags(capability.urn.tags).toString();
    }
    return '';
  }

  getNamespaceColor(namespace) {
    const colorMap = {
      std: this.getCssVar('--graph-ns-std'),
      capdag: this.getCssVar('--graph-ns-capdag'),
      machfab: this.getCssVar('--graph-ns-machfab')
    };
    return colorMap[namespace] || this.getCssVar('--graph-ns-default');
  }

  capAccepts(generalUrn, specificUrn) {
    try {
      const general = CapUrn.fromString(generalUrn);
      const specific = CapUrn.fromString(specificUrn);
      return general.accepts(specific);
    } catch {
      return false;
    }
  }

  parseNamespace(urn) {
    const match = urn.match(/^cap:([^;]+)/);
    return match ? match[1] : 'cap';
  }

  getLabel(capability, urn) {
    const title = (capability.title || capability.name || '').trim();
    if (title) return title;

    try {
      const parsed = CapUrn.fromString(urn);
      const op = parsed.tags.op || parsed.tags.operation;
      if (op) return op;
    } catch {
      // Fall through to default.
    }

    return urn.replace(/^cap:/, '');
  }

  getSpecificity(urn) {
    try {
      const parsed = CapUrn.fromString(urn);
      if (typeof parsed.specificity === 'function') {
        return parsed.specificity();
      }
    } catch {
      // Fall through.
    }
    return 0;
  }

  computeRanks() {
    this.nodeRanks = new Map();

    for (const node of this.nodes) {
      const rank = this.getSpecificity(node.urn);
      this.nodeRanks.set(node.id, rank);
    }

    const ranks = Array.from(this.nodeRanks.values());
    this.minRank = Math.min(...ranks);
    this.maxRank = Math.max(...ranks);
  }

  filterHubNodes() {
    const n = this.nodes.length;
    if (n < 4) return;

    const threshold = Math.floor(n * 0.5);
    const hubIds = new Set();

    for (const node of this.nodes) {
      const outDegree = (this.forwardAdj.get(node.id) || new Set()).size;
      const inDegree = (this.reverseAdj.get(node.id) || new Set()).size;
      if (outDegree >= threshold || inDegree >= threshold) {
        hubIds.add(node.id);
      }
    }

    if (hubIds.size === 0) return;

    this.hiddenHubs = this.nodes.filter((n) => hubIds.has(n.id));
    this.nodes = this.nodes.filter((n) => !hubIds.has(n.id));
    this.edges = this.edges.filter(
      (e) => !hubIds.has(e.source) && !hubIds.has(e.target)
    );

    // Rebuild adjacency after filtering.
    this.forwardAdj = new Map();
    this.reverseAdj = new Map();
    for (const node of this.nodes) {
      this.forwardAdj.set(node.id, new Set());
      this.reverseAdj.set(node.id, new Set());
    }
    for (const edge of this.edges) {
      this.forwardAdj.get(edge.source).add(edge.target);
      this.reverseAdj.get(edge.target).add(edge.source);
    }
  }

  parseOpTag(urn) {
    try {
      const parsed = CapUrn.fromString(urn);
      return parsed.tags.op || null;
    } catch {
      return null;
    }
  }

  buildFromCapabilities(capabilities) {
    const parsedCaps = [];

    for (const cap of capabilities) {
      try {
        const urn = this.getCapabilityUrn(cap);
        if (!urn) continue;
        parsedCaps.push({ cap, urn });
      } catch {
        // Skip invalid cap entries.
      }
    }

    // Deduplicate by canonical URN.
    const uniqueByUrn = new Map();
    for (const entry of parsedCaps) {
      if (!uniqueByUrn.has(entry.urn)) {
        uniqueByUrn.set(entry.urn, entry);
      }
    }

    const all = Array.from(uniqueByUrn.values());
    this.nodes = all.map((entry, idx) => ({
      id: `cap-${idx}`,
      urn: entry.urn,
      label: this.getLabel(entry.cap, entry.urn),
      namespace: this.parseNamespace(entry.urn),
      capability: entry.cap
    }));

    const n = this.nodes.length;
    const candidateEdges = [];

    // Relation: specific -> general if general.accepts(specific).
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;

        const a = this.nodes[i];
        const b = this.nodes[j];

        const bAcceptsA = this.capAccepts(b.urn, a.urn);
        if (!bAcceptsA) continue;

        const aAcceptsB = this.capAccepts(a.urn, b.urn);
        if (aAcceptsB) continue; // Ignore equivalent/mutual matches.

        candidateEdges.push({ source: a.id, target: b.id });
      }
    }

    // Transitive reduction: keep only cover relations.
    const adjacency = new Map();
    for (const node of this.nodes) {
      adjacency.set(node.id, new Set());
    }
    for (const edge of candidateEdges) {
      adjacency.get(edge.source).add(edge.target);
    }

    const hasPathWithoutDirect = (source, target) => {
      const visited = new Set([source]);
      const queue = [];

      const firstNeighbors = adjacency.get(source) || new Set();
      for (const neighbor of firstNeighbors) {
        if (neighbor === target) continue;
        queue.push(neighbor);
        visited.add(neighbor);
      }

      while (queue.length > 0) {
        const current = queue.shift();
        if (current === target) return true;

        const neighbors = adjacency.get(current) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      return false;
    };

    const reducedEdges = [];
    for (const edge of candidateEdges) {
      if (!hasPathWithoutDirect(edge.source, edge.target)) {
        reducedEdges.push(edge);
      }
    }

    this.edges = reducedEdges.map((edge, idx) => ({
      id: `cover-${idx}`,
      source: edge.source,
      target: edge.target
    }));

    this.forwardAdj = new Map();
    this.reverseAdj = new Map();
    for (const node of this.nodes) {
      this.forwardAdj.set(node.id, new Set());
      this.reverseAdj.set(node.id, new Set());
    }
    for (const edge of this.edges) {
      this.forwardAdj.get(edge.source).add(edge.target);
      this.reverseAdj.get(edge.target).add(edge.source);
    }

    // Filter universal hubs (Identity, Discard) that connect to most nodes.
    this.filterHubNodes();

    // Compute specificity-based ranks for layering.
    this.computeRanks();

    return this;
  }

  buildStylesheet() {
    const nodeText = this.getCssVar('--graph-node-text');
    const nodeBorder = this.getCssVar('--graph-node-border');
    const nodeBorderHighlighted = this.getCssVar('--graph-node-border-highlighted');
    const nodeBorderActive = this.getCssVar('--graph-node-border-active');
    const fadedOpacity = parseFloat(this.getCssVar('--graph-faded-opacity')) || 0.15;
    const fadedEdgeOpacity = parseFloat(this.getCssVar('--graph-faded-edge-opacity')) || 0.1;

    return [
      {
        selector: 'node[!isGroup]',
        style: {
          label: 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'text-wrap': 'wrap',
          'text-max-width': '140px',
          'line-height': 1.2,
          'font-family': '"JetBrains Mono", monospace',
          'font-size': '8px',
          'font-weight': '500',
          color: nodeText,
          'background-color': 'data(color)',
          shape: 'round-rectangle',
          width: 'label',
          height: 'label',
          padding: '6px',
          'border-width': 'mapData(degree, 1, 15, 1.5, 3)',
          'border-color': nodeBorder,
          'border-opacity': 0.7
        }
      },
      {
        selector: 'node[?isGroup]',
        style: {
          label: 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-family': '"Inter", sans-serif',
          'font-size': '9px',
          'font-weight': '600',
          color: nodeText,
          'background-color': 'data(color)',
          'background-opacity': 0.06,
          'border-width': '1px',
          'border-color': 'data(color)',
          'border-opacity': 0.25,
          'border-style': 'dashed',
          shape: 'round-rectangle',
          padding: '16px',
          'text-margin-y': -6
        }
      },
      {
        selector: 'node.highlighted',
        style: {
          'border-width': '2.5px',
          'border-color': nodeBorderHighlighted
        }
      },
      {
        selector: 'node.active',
        style: {
          'border-width': '2.5px',
          'border-color': nodeBorderActive,
          'z-index': 999
        }
      },
      {
        selector: 'node.faded',
        style: {
          opacity: fadedOpacity
        }
      },
      {
        selector: 'edge',
        style: {
          width: 1,
          'line-color': '#64748b',
          'line-opacity': 0.3,
          'target-arrow-shape': 'none',
          'curve-style': 'bezier',
          'control-point-step-size': 40
        }
      },
      {
        selector: 'edge.highlighted',
        style: {
          width: 2,
          'line-color': '#f59e0b',
          'line-opacity': 1
        }
      },
      {
        selector: 'edge.faded',
        style: {
          opacity: fadedEdgeOpacity
        }
      }
    ];
  }

  buildElements() {
    // Build operation groups for compound nodes.
    const opGroups = new Map();
    for (const node of this.nodes) {
      const op = this.parseOpTag(node.urn);
      if (op) {
        if (!opGroups.has(op)) opGroups.set(op, []);
        opGroups.get(op).push(node);
      }
    }

    const parentElements = [];
    const childParentMap = new Map();

    for (const [op, members] of opGroups) {
      if (members.length >= 2) {
        const parentId = `group-${op}`;
        const ns = members[0].namespace;
        parentElements.push({
          group: 'nodes',
          data: {
            id: parentId,
            label: op.replace(/_/g, ' '),
            namespace: ns,
            color: this.getNamespaceColor(ns),
            isGroup: true
          }
        });
        for (const member of members) {
          childParentMap.set(member.id, parentId);
        }
      }
    }

    // Compute degree for each node.
    const degreeMap = new Map();
    for (const node of this.nodes) {
      const outDeg = (this.forwardAdj.get(node.id) || new Set()).size;
      const inDeg = (this.reverseAdj.get(node.id) || new Set()).size;
      degreeMap.set(node.id, outDeg + inDeg);
    }

    const nodeElements = this.nodes.map((node) => {
      const rank = this.nodeRanks.get(node.id) || 0;
      // Invert: most general (lowest specificity) gets highest partition (top in UP layout).
      const partition = this.maxRank - rank;
      const parentId = childParentMap.get(node.id);

      const data = {
        id: node.id,
        label: node.label,
        fullUrn: node.urn,
        namespace: node.namespace,
        color: this.getNamespaceColor(node.namespace),
        degree: degreeMap.get(node.id) || 0,
        partition: partition
      };

      if (parentId) {
        data.parent = parentId;
      }

      return { group: 'nodes', data };
    });

    const edgeElements = this.edges.map((edge) => ({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target
      }
    }));

    return [...parentElements, ...nodeElements, ...edgeElements];
  }

  getUpwardClosure(nodeId) {
    const seen = new Set([nodeId]);
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift();
      const next = this.forwardAdj.get(current) || new Set();
      for (const n of next) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }

    return seen;
  }

  getDownwardClosure(nodeId) {
    const seen = new Set([nodeId]);
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift();
      const prev = this.reverseAdj.get(current) || new Set();
      for (const p of prev) {
        if (!seen.has(p)) {
          seen.add(p);
          queue.push(p);
        }
      }
    }

    return seen;
  }

  clearHighlighting() {
    if (!this.cy) return;
    this.cy.elements().removeClass('highlighted active faded');
    this.selectedNodeId = null;
  }

  highlightNodeClosure(nodeId) {
    if (!this.cy) return;

    const up = this.getUpwardClosure(nodeId);
    const down = this.getDownwardClosure(nodeId);
    const visible = new Set([...up, ...down]);

    this.cy.elements().removeClass('highlighted active faded');
    this.cy.elements().addClass('faded');

    this.cy.nodes().forEach((node) => {
      if (visible.has(node.id())) {
        node.removeClass('faded').addClass('highlighted');
      }
    });

    this.cy.edges().forEach((edge) => {
      if (visible.has(edge.source().id()) && visible.has(edge.target().id())) {
        edge.removeClass('faded').addClass('highlighted');
      }
    });

    const selected = this.cy.getElementById(nodeId);
    if (selected && selected.length > 0) {
      selected.removeClass('faded').addClass('active');
    }

    this.selectedNodeId = nodeId;
  }

  setupEventHandlers() {
    this.cy.on('tap', 'node[!isGroup]', (evt) => {
      evt.stopPropagation();
      const node = evt.target;
      this.highlightNodeClosure(node.id());
      this.cy.animate({
        fit: { eles: this.cy.nodes().filter((n) => !n.hasClass('faded')), padding: 80 },
        duration: 350,
        easing: 'ease-out-cubic'
      });
    });

    this.cy.on('tap', (evt) => {
      if (evt.target === this.cy) {
        this.clearHighlighting();
      }
    });

    this.cy.on('dbltap', (evt) => {
      if (evt.target === this.cy) {
        this.clearHighlighting();
        this.cy.fit(undefined, 60);
      }
    });

    this.cy.on('mouseover', 'node[!isGroup]', (evt) => {
      const node = evt.target;
      this.showTooltip(node.data('fullUrn') || node.id(), evt.originalEvent.clientX, evt.originalEvent.clientY);
      if (!this.selectedNodeId) {
        this.highlightNodeClosure(node.id());
      }
    });

    this.cy.on('mousemove', 'node[!isGroup]', (evt) => {
      const node = evt.target;
      this.showTooltip(node.data('fullUrn') || node.id(), evt.originalEvent.clientX, evt.originalEvent.clientY);
    });

    this.cy.on('mouseout', 'node[!isGroup]', () => {
      this.hideTooltip();
      if (!this.selectedNodeId) {
        this.clearHighlighting();
      }
    });
  }

  render() {
    if (!this.container || !this.nodes || this.nodes.length === 0) {
      this.container.innerHTML = '<div class="cap-graph-empty"><p>No capabilities registered yet</p></div>';
      return;
    }

    this.container.innerHTML = '';
    this.container.style.width = `${window.innerWidth}px`;
    this.container.style.height = `${window.innerHeight}px`;

    const self = this;

    this.cy = cytoscape({
      container: this.container,
      elements: this.buildElements(),
      layout: {
        name: 'elk',
        nodeLayoutOptions: function (node) {
          const partition = node.data('partition');
          if (partition !== undefined && !node.data('isGroup')) {
            return { 'partitioning.partition': String(partition) };
          }
          return {};
        },
        elk: {
          algorithm: 'layered',
          'elk.direction': 'UP',
          'elk.partitioning.activate': 'true',
          'elk.aspectRatio': '0.5',
          'elk.layered.spacing.nodeNodeBetweenLayers': 80,
          'elk.spacing.nodeNode': 50,
          'elk.edgeRouting': 'SPLINES',
          'elk.layered.spacing.edgeEdgeBetweenLayers': 15,
          'elk.layered.spacing.edgeNodeBetweenLayers': 25,
          'elk.spacing.edgeEdge': 10,
          'elk.spacing.edgeNode': 20,
          'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
          'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
          'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
          'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
          'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
          'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH'
        },
        stop: () => {
          self.cy.resize();
          self.cy.fit(undefined, 60);
        }
      },
      style: this.buildStylesheet(),
      minZoom: 0.1,
      maxZoom: 4,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false
    });

    this.setupEventHandlers();
  }
}

window.CapHasseVisualization = CapHasseVisualization;
