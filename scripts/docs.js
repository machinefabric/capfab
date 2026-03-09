(function () {
  'use strict';

  var DOCS_TREE = [
    {
      title: 'Overview',
      path: '/docs/',
      sections: ['Scope', 'Primary Sections', 'Source Priority']
    },
    {
      title: 'URN Syntax',
      path: '/docs/syntax.html',
      sections: ['Contract', 'CAP Direction Tags: Parser vs Canonical Form', 'Algorithm', 'Errors', 'References']
    },
    {
      title: 'Matching',
      path: '/docs/matching.html',
      sections: ['Tagged URN Semantics', 'CAP Direction Matching', 'CAP Non-Direction Tag Semantics', 'References']
    },
    {
      title: 'Specificity',
      path: '/docs/specificity.html',
      sections: ['Tagged URN Score', 'CAP URN Score', 'Tie Behavior Matrix', 'References']
    },
    {
      title: 'Capability Schema',
      path: '/docs/definitions.html',
      sections: ['Top-Level Shape', 'Args and Sources', 'Output', 'Media Resolution', 'References']
    },
    {
      title: 'Validation Rules',
      path: '/docs/validation-rules.html',
      sections: ['RULE1..RULE12', 'Schema Validation Flow', 'Test Anchors', 'References']
    },
    {
      title: 'Bifaci Protocol',
      path: '/docs/runtime-protocol.html',
      sections: ['Frame Contract', 'Frame Types', 'Lifecycle', 'Identity and Integrity', 'References']
    },
    {
      title: 'Runtime Hosting',
      path: '/docs/runtime-hosting.html',
      sections: ['PluginRuntime', 'PluginHostRuntime', 'RelaySwitch', 'References']
    },
    {
      title: 'Integration Recipes',
      path: '/docs/integration-recipes.html',
      sections: ['Recipe: End-to-End Runtime Request', 'Recipe: Graph Execution (Macino)', 'Recipe: Missing Capability', 'Test Anchors']
    },
    {
      title: 'Libraries',
      path: '/docs/libraries.html',
      sections: ['Implementations', 'Semantics Boundaries', 'Rust Example (Direction Defaulting + Matching)', 'References']
    },
    {
      title: 'API Reference',
      path: '/docs/api.html',
      sections: ['Base URL', 'GET /cap:{urn}', 'GET /api/capabilities', 'Not Implemented', 'References']
    }
  ];

  function slug(text) {
    var base = (text || 'section')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    return base || 'section';
  }

  function normalizePath(path) {
    if (!path) return '/docs/';
    var out = path;
    if (out === '/docs' || out === '/docs/index.html' || out === '/docs.html') return '/docs/';
    return out.replace(/\/+$/, '') || '/';
  }

  function initThemeToggle() {
    var themeToggle = document.getElementById('theme-toggle');
    var mobileThemeToggle = document.getElementById('mobile-theme-toggle');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    var canUseStorage = true;

    try {
      window.localStorage.getItem('theme');
    } catch (e) {
      canUseStorage = false;
    }

    function setTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      if (canUseStorage) {
        localStorage.setItem('theme', theme);
      }
    }

    function getStoredTheme() {
      if (!canUseStorage) {
        return prefersDark.matches ? 'dark' : 'light';
      }
      var stored = localStorage.getItem('theme');
      if (stored === 'dark' || stored === 'light') return stored;
      return prefersDark.matches ? 'dark' : 'light';
    }

    setTheme(getStoredTheme());

    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        setTheme(current === 'dark' ? 'light' : 'dark');
      });
    }

    if (mobileThemeToggle) {
      mobileThemeToggle.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        setTheme(current === 'dark' ? 'light' : 'dark');
      });
    }

    if (prefersDark && typeof prefersDark.addEventListener === 'function') {
      prefersDark.addEventListener('change', function (e) {
        if (!canUseStorage || !localStorage.getItem('theme')) {
          setTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  function initMobileMenu() {
    var hamburgerBtn = document.getElementById('hamburger-btn');
    var mobileMenu = document.getElementById('mobile-menu');
    if (!hamburgerBtn || !mobileMenu) return;

    hamburgerBtn.addEventListener('click', function () {
      hamburgerBtn.classList.toggle('active');
      mobileMenu.classList.toggle('active');
    });

    document.addEventListener('click', function (e) {
      if (!hamburgerBtn.contains(e.target) && !mobileMenu.contains(e.target)) {
        hamburgerBtn.classList.remove('active');
        mobileMenu.classList.remove('active');
      }
    });
  }

  function ensureHeadingIds(headings) {
    var seen = new Set();
    headings.forEach(function (h) {
      if (h.id) {
        seen.add(h.id);
        return;
      }
      var base = slug(h.textContent);
      var candidate = base;
      var i = 2;
      while (seen.has(candidate) || document.getElementById(candidate)) {
        candidate = base + '-' + i++;
      }
      h.id = candidate;
      seen.add(candidate);
    });
  }

  function initDocsTree() {
    var root = document.getElementById('docs-global-tree');
    if (!root) return;

    var currentPath = normalizePath(location.pathname);
    var content = document.querySelector('.docs-content');
    var headings = content ? Array.prototype.slice.call(content.querySelectorAll('h2, h3')) : [];
    ensureHeadingIds(headings);

    var currentSectionLinks = new Map();

    DOCS_TREE.forEach(function (page) {
      var pagePath = normalizePath(page.path);
      var isCurrentPage = pagePath === currentPath;

      var pageLi = document.createElement('li');
      pageLi.className = 'docs-tree-page';

      var pageLink = document.createElement('a');
      pageLink.href = page.path;
      pageLink.className = 'docs-nav-link docs-tree-page-link' + (isCurrentPage ? ' active' : '');
      pageLink.textContent = page.title;
      pageLi.appendChild(pageLink);

      var children = document.createElement('ul');
      children.className = 'docs-nav-subtree docs-tree-children';

      page.sections.forEach(function (sectionTitle) {
        var sectionId = slug(sectionTitle);
        var sectionLi = document.createElement('li');
        sectionLi.className = 'docs-tree-section';

        var sectionLink = document.createElement('a');
        sectionLink.href = page.path + '#' + sectionId;
        sectionLink.className = 'docs-tree-section-link';
        sectionLink.textContent = sectionTitle;

        if (isCurrentPage) {
          currentSectionLinks.set(sectionId, sectionLink);
        }

        sectionLi.appendChild(sectionLink);
        children.appendChild(sectionLi);
      });

      pageLi.appendChild(children);
      root.appendChild(pageLi);
    });

    if (currentSectionLinks.size === 0 || headings.length === 0) {
      return;
    }

    function setActiveSection(id) {
      currentSectionLinks.forEach(function (link, linkId) {
        var active = linkId === id;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }

    function updateActiveFromScroll() {
      var offset = 140;
      var activeId = headings[0].id;

      for (var i = 0; i < headings.length; i++) {
        if (headings[i].getBoundingClientRect().top <= offset) {
          activeId = headings[i].id;
        } else {
          break;
        }
      }

      setActiveSection(activeId);
    }

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        updateActiveFromScroll();
        ticking = false;
      });
    }

    root.addEventListener('click', function (e) {
      var link = e.target.closest('a[href*="#"]');
      if (!link) return;
      var href = link.getAttribute('href');
      var hash = href.split('#')[1] || '';
      if (hash) setActiveSection(decodeURIComponent(hash));
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('hashchange', function () {
      var id = decodeURIComponent(location.hash.replace(/^#/, ''));
      if (id && currentSectionLinks.has(id)) setActiveSection(id);
    });

    var initialHashId = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (initialHashId && currentSectionLinks.has(initialHashId)) {
      var target = document.getElementById(initialHashId);
      if (target) {
        target.scrollIntoView({ block: 'start' });
      }
      setActiveSection(initialHashId);
    } else {
      updateActiveFromScroll();
    }
  }

  initThemeToggle();
  initMobileMenu();
  initDocsTree();
})();
