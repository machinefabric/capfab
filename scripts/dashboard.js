// CAPDAG Dashboard with Native Authentication

class Dashboard {
    constructor() {
        this.auth = null;
        this.user = null;
        this.profile = null;
        this.validatedCap = null;
        this.config = null;
        this.turnstileWidgetIds = {};
        this.pendingVerificationEmail = null;
        this.resetToken = null;
        this.userGraph = null;

        // DOM elements
        this.views = {
            loading: document.getElementById('loading-view'),
            login: document.getElementById('login-view'),
            username: document.getElementById('username-view'),
            dashboard: document.getElementById('dashboard-view')
        };

        this.cards = {
            login: document.getElementById('login-card'),
            forgotPassword: document.getElementById('forgot-password-card'),
            resetPassword: document.getElementById('reset-password-card'),
            checkEmail: document.getElementById('check-email-card'),
            emailVerified: document.getElementById('email-verified-card'),
            verificationError: document.getElementById('verification-error-card'),
            passwordResetSuccess: document.getElementById('password-reset-success-card'),
            forgotEmailSent: document.getElementById('forgot-email-sent-card')
        };

        this.authSection = document.getElementById('auth-section');

        this.init();
    }

    async init() {
        try {
            // Fetch config first
            this.config = await this.fetchConfig();

            // Initialize auth client
            this.auth = new AuthClient();

            // Check for URL actions (verify email, reset password)
            const urlAction = await this.handleUrlAction();
            if (urlAction) return;

            // Check authentication state
            if (this.auth.isAuthenticated()) {
                this.user = this.auth.getUser();
                await this.loadProfile();
            } else {
                this.showView('login');
                this.showCard('login');
                this.initializeTurnstile();
            }

            this.updateAuthSection();
            this.setupEventListeners();
            this.setupHamburgerMenu();
            this.setupThemeToggle();

        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            this.showError(null, 'Initialization failed: ' + error.message);
            this.showView('login');
            this.showCard('login');
        }
    }

    async fetchConfig() {
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error('Failed to load configuration');
        }
        return response.json();
    }

    async handleUrlAction() {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        const token = params.get('token');

        // Clear URL params
        if (action || token) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        if (action === 'verify' && token) {
            await this.processEmailVerification(token);
            return true;
        }

        if (action === 'reset-password' && token) {
            this.resetToken = token;
            this.showView('login');
            this.showCard('resetPassword');
            this.setupEventListeners();
            return true;
        }

        return false;
    }

    async processEmailVerification(token) {
        this.showView('loading');

        try {
            await this.auth.verifyEmail(token);
            this.showView('login');
            this.showCard('emailVerified');
            this.setupEventListeners();
        } catch (error) {
            document.getElementById('verification-error-message').textContent = error.message;
            this.showView('login');
            this.showCard('verificationError');
            this.setupEventListeners();
            this.initializeTurnstile();
        }
    }

    initializeTurnstile() {
        if (typeof turnstile === 'undefined' || !this.config?.turnstileSiteKey) {
            setTimeout(() => this.initializeTurnstile(), 100);
            return;
        }

        const containers = [
            { id: 'login-turnstile', key: 'login' },
            { id: 'forgot-turnstile', key: 'forgot' },
            { id: 'resend-turnstile', key: 'resend' }
        ];

        containers.forEach(({ id, key }) => {
            const container = document.getElementById(id);
            if (container && !this.turnstileWidgetIds[key]) {
                this.turnstileWidgetIds[key] = turnstile.render(container, {
                    sitekey: this.config.turnstileSiteKey,
                    theme: 'light',
                    size: 'normal'
                });
            }
        });
    }

    setupEventListeners() {
        // Login form
        this.addFormListener('login-form', e => this.handleLogin(e));

        // Forgot password form
        this.addFormListener('forgot-password-form', e => this.handleForgotPassword(e));

        // Reset password form
        this.addFormListener('reset-password-form', e => this.handleResetPassword(e));

        // Username form
        this.addFormListener('username-form', e => this.handleUsernameSubmit(e));

        // Register capability form
        this.addFormListener('register-form', e => this.handleCapRegisterSubmit(e));

        // Navigation links
        this.addClickListener('show-forgot-password', () => { this.showCard('forgotPassword'); this.initializeTurnstile(); });
        this.addClickListener('show-login-from-forgot', () => { this.showCard('login'); this.initializeTurnstile(); });
        this.addClickListener('back-to-login', () => { this.showCard('login'); this.initializeTurnstile(); });
        this.addClickListener('back-to-login-from-error', () => { this.showCard('login'); this.initializeTurnstile(); });
        this.addClickListener('back-to-login-from-forgot-sent', () => { this.showCard('login'); this.initializeTurnstile(); });

        // Success buttons
        this.addClickListener('go-to-login-btn', () => { this.showCard('login'); this.initializeTurnstile(); });
        this.addClickListener('go-to-login-after-reset-btn', () => { this.showCard('login'); this.initializeTurnstile(); });

        // Resend verification
        this.addClickListener('resend-verification-btn', () => this.handleResendVerification());

        // Validate button
        this.addClickListener('validate-btn', () => this.validateCapability());

        // JSON textarea changes
        const capJson = document.getElementById('cap-json');
        if (capJson) {
            capJson.addEventListener('input', () => this.clearValidation());
        }

        // File drop zone
        this.setupDropZone();
    }

    setupHamburgerMenu() {
        const hamburgerBtn = document.getElementById('hamburger-btn');
        const mobileMenu = document.getElementById('mobile-menu');

        if (hamburgerBtn && mobileMenu) {
            hamburgerBtn.addEventListener('click', () => {
                hamburgerBtn.classList.toggle('active');
                mobileMenu.classList.toggle('active');
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!hamburgerBtn.contains(e.target) && !mobileMenu.contains(e.target)) {
                    hamburgerBtn.classList.remove('active');
                    mobileMenu.classList.remove('active');
                }
            });
        }
    }

    setupThemeToggle() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

        const setTheme = (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        };

        const getStoredTheme = () => {
            return localStorage.getItem('theme') || (prefersDark.matches ? 'dark' : 'light');
        };

        // Apply stored theme on load
        setTheme(getStoredTheme());

        // Desktop theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme') || 'dark';
                setTheme(current === 'dark' ? 'light' : 'dark');
            });
        }

        // Mobile theme toggle
        const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
        if (mobileThemeToggle) {
            mobileThemeToggle.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme') || 'dark';
                setTheme(current === 'dark' ? 'light' : 'dark');
            });
        }
    }

    addFormListener(formId, handler) {
        const form = document.getElementById(formId);
        if (form) {
            form.addEventListener('submit', e => {
                e.preventDefault();
                handler(e);
            });
        }
    }

    addClickListener(elementId, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener('click', e => {
                e.preventDefault();
                handler();
            });
        }
    }

    setupDropZone() {
        const dropZone = document.getElementById('drop-zone');
        const dropOverlay = document.getElementById('drop-overlay');
        const capJson = document.getElementById('cap-json');

        if (!dropZone || !capJson) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, e => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropOverlay.style.display = 'flex';
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropOverlay.style.display = 'none';
            });
        });

        dropZone.addEventListener('drop', e => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                if (file.type === 'application/json' || file.name.endsWith('.json')) {
                    const reader = new FileReader();
                    reader.onload = event => {
                        capJson.value = event.target.result;
                        this.clearValidation();
                    };
                    reader.readAsText(file);
                }
            }
        });
    }

    showCard(cardName) {
        Object.values(this.cards).forEach(card => {
            if (card) card.style.display = 'none';
        });
        if (this.cards[cardName]) {
            this.cards[cardName].style.display = 'block';
        }
    }

    showStatus(statusEl, message) {
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.style.display = 'block';
        }
    }

    hideStatus(statusEl) {
        if (statusEl) {
            statusEl.style.display = 'none';
        }
    }

    async handleLogin(e) {
        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');
        const errorEl = document.getElementById('login-error');
        const statusEl = document.getElementById('login-status');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        errorEl.style.display = 'none';
        submitBtn.disabled = true;

        const onProgress = (type, data) => {
            if (type === 'status') {
                this.showStatus(statusEl, data);
            } else if (type === 'pow') {
                this.showStatus(statusEl, `Verifying... (${Math.round(data.attempts / 1000)}k attempts)`);
            }
        };

        try {
            const widgetId = this.turnstileWidgetIds.login;
            this.user = await this.auth.login(emailInput.value, passwordInput.value, onProgress, widgetId);
            this.hideStatus(statusEl);
            await this.loadProfile();
            this.updateAuthSection();
        } catch (error) {
            this.hideStatus(statusEl);

            if (error.requiresVerification) {
                this.pendingVerificationEmail = error.email;
                document.getElementById('check-email-address').textContent = error.email;
                this.showCard('checkEmail');
                this.initializeTurnstile();
            } else {
                this.showError(errorEl, error.message);
            }

            submitBtn.disabled = false;
            if (typeof turnstile !== 'undefined' && this.turnstileWidgetIds.login) {
                turnstile.reset(this.turnstileWidgetIds.login);
            }
        }
    }

    async handleForgotPassword(e) {
        const emailInput = document.getElementById('forgot-email');
        const errorEl = document.getElementById('forgot-error');
        const statusEl = document.getElementById('forgot-status');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        errorEl.style.display = 'none';
        submitBtn.disabled = true;

        const onProgress = (type, data) => {
            if (type === 'status') {
                this.showStatus(statusEl, data);
            } else if (type === 'pow') {
                this.showStatus(statusEl, `Verifying... (${Math.round(data.attempts / 1000)}k attempts)`);
            }
        };

        try {
            const widgetId = this.turnstileWidgetIds.forgot;
            await this.auth.forgotPassword(emailInput.value, onProgress, widgetId);
            this.hideStatus(statusEl);
            this.showCard('forgotEmailSent');
        } catch (error) {
            this.hideStatus(statusEl);
            this.showError(errorEl, error.message);
            submitBtn.disabled = false;
            if (typeof turnstile !== 'undefined' && this.turnstileWidgetIds.forgot) {
                turnstile.reset(this.turnstileWidgetIds.forgot);
            }
        }
    }

    async handleResetPassword(e) {
        const passwordInput = document.getElementById('reset-password');
        const confirmInput = document.getElementById('reset-confirm');
        const errorEl = document.getElementById('reset-error');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        errorEl.style.display = 'none';

        if (passwordInput.value !== confirmInput.value) {
            this.showError(errorEl, 'Passwords do not match');
            return;
        }

        if (!this.resetToken) {
            this.showError(errorEl, 'Invalid reset token');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Resetting...';

        try {
            await this.auth.resetPassword(this.resetToken, passwordInput.value);
            this.resetToken = null;
            this.showCard('passwordResetSuccess');
        } catch (error) {
            this.showError(errorEl, error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Reset Password';
        }
    }

    async handleResendVerification() {
        const errorEl = document.getElementById('resend-error');
        const successEl = document.getElementById('resend-success');
        const statusEl = document.getElementById('resend-status');
        const btn = document.getElementById('resend-verification-btn');

        errorEl.style.display = 'none';
        successEl.style.display = 'none';
        btn.disabled = true;

        const onProgress = (type, data) => {
            if (type === 'status') {
                this.showStatus(statusEl, data);
            } else if (type === 'pow') {
                this.showStatus(statusEl, `Verifying... (${Math.round(data.attempts / 1000)}k attempts)`);
            }
        };

        try {
            const widgetId = this.turnstileWidgetIds.resend;
            await this.auth.resendVerification(this.pendingVerificationEmail, onProgress, widgetId);
            this.hideStatus(statusEl);
            successEl.textContent = 'Verification email sent! Check your inbox.';
            successEl.style.display = 'block';
            btn.disabled = false;
        } catch (error) {
            this.hideStatus(statusEl);
            this.showError(errorEl, error.message);
            btn.disabled = false;
            if (typeof turnstile !== 'undefined' && this.turnstileWidgetIds.resend) {
                turnstile.reset(this.turnstileWidgetIds.resend);
            }
        }
    }

    async logout() {
        await this.auth.logout();
        this.user = null;
        this.profile = null;
        this.updateAuthSection();
        this.showView('login');
        this.showCard('login');
        this.initializeTurnstile();
    }

    async getAccessToken() {
        return await this.auth.getAccessToken();
    }

    updateAuthSection() {
        if (!this.authSection) return;

        if (this.user) {
            const displayName = this.profile?.username
                ? `@${this.profile.username}`
                : this.user.email;

            this.authSection.innerHTML = `
                <span class="auth-user">${this.escapeHtml(displayName)}</span>
                <button id="logout-btn" class="btn btn-ghost btn-small">Sign Out</button>
            `;

            document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        } else {
            this.authSection.innerHTML = `
                <a href="/dashboard" class="btn btn-primary btn-small">Sign In</a>
            `;
        }
    }

    async loadProfile() {
        this.showView('loading');

        try {
            const token = await this.getAccessToken();
            const response = await fetch('/api/user/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    await this.logout();
                    return;
                }
                throw new Error('Failed to load profile');
            }

            this.profile = await response.json();

            if (this.profile.needs_username) {
                this.showView('username');
            } else {
                this.showDashboard();
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            await this.logout();
        }
    }

    async handleUsernameSubmit(e) {
        const input = document.getElementById('username-input');
        const errorEl = document.getElementById('username-error');
        const username = input.value.trim();

        errorEl.style.display = 'none';

        if (username.length < 3 || username.length > 20) {
            this.showError(errorEl, 'Username must be 3-20 characters');
            return;
        }

        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(username)) {
            this.showError(errorEl, 'Username must start with a letter and contain only letters, numbers, and underscores');
            return;
        }

        try {
            const token = await this.getAccessToken();
            const response = await fetch('/api/user/profile', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username })
            });

            const result = await response.json();

            if (!response.ok) {
                this.showError(errorEl, result.message || result.error);
                return;
            }

            this.profile = result.profile;
            this.updateAuthSection();
            this.showDashboard();
        } catch (error) {
            console.error('Error setting username:', error);
            this.showError(errorEl, 'Failed to set username. Please try again.');
        }
    }

    showDashboard() {
        const displayUsername = document.getElementById('display-username');
        if (displayUsername && this.profile?.username) {
            displayUsername.textContent = `@${this.profile.username}`;
        }

        this.showView('dashboard');
        this.loadCapabilities();
        this.loadUserMedia();
    }

    async loadCapabilities() {
        try {
            const token = await this.getAccessToken();
            const response = await fetch('/api/user/capabilities', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load capabilities');
            }

            const data = await response.json();
            this.renderCapabilities(data.capabilities || []);
        } catch (error) {
            console.error('Error loading capabilities:', error);
        }
    }

    renderCapabilities(capabilities) {
        const capsCount = document.getElementById('caps-count');
        const capsList = document.getElementById('caps-list');

        if (capsCount) {
            capsCount.textContent = capabilities.length;
        }

        if (!capsList) return;

        if (capabilities.length === 0) {
            capsList.innerHTML = `
                <div class="caps-empty">
                    <p>You haven't registered any capabilities yet.</p>
                </div>
            `;
            // Also update graph to show empty state
            this.initUserGraph([]);
            return;
        }

        capsList.innerHTML = capabilities.map(cap => this.renderCapCard(cap)).join('');

        // Initialize graph with capabilities
        this.initUserGraph(capabilities);
    }

    renderCapCard(cap) {
        const urn = this.getCapUrnString(cap);
        const title = cap.title || 'Untitled';
        const description = cap.cap_description || '';
        const registeredAt = cap.registered_by?.registered_at
            ? new Date(cap.registered_by.registered_at).toLocaleDateString()
            : '';

        return `
            <a href="/browse/${encodeURIComponent(urn)}" class="cap-card">
                <div class="cap-card-header">
                    <h3 class="cap-card-title">${this.escapeHtml(title)}</h3>
                    <code class="cap-card-urn">${this.escapeHtml(urn)}</code>
                </div>
                ${description ? `<p class="cap-card-description">${this.escapeHtml(description)}</p>` : ''}
                ${registeredAt ? `<span class="cap-card-date">Registered ${registeredAt}</span>` : ''}
            </a>
        `;
    }

    validateCapability() {
        const capJson = document.getElementById('cap-json');
        const previewEl = document.getElementById('validation-preview');
        const registerBtn = document.getElementById('register-btn');

        if (!capJson || !previewEl) return;

        const jsonText = capJson.value.trim();

        if (!jsonText) {
            this.showValidationResult(false, 'Please enter capability JSON');
            return;
        }

        let capability;
        try {
            capability = JSON.parse(jsonText);
        } catch (e) {
            this.showValidationResult(false, `Invalid JSON: ${e.message}`);
            return;
        }

        const errors = this.validateCapabilityStructure(capability);

        if (errors.length > 0) {
            this.showValidationResult(false, 'Validation failed', errors);
            return;
        }

        let formattedUrn;
        try {
            formattedUrn = this.formatCapUrn(capability.urn);
        } catch (e) {
            this.showValidationResult(false, `Invalid URN: ${e.message}`);
            return;
        }

        this.validatedCap = capability;
        this.showValidationResult(true, 'Valid capability', [
            `URN: ${formattedUrn}`,
            `Title: ${capability.title}`,
            `Command: ${capability.command}`
        ]);

        registerBtn.disabled = false;
    }

    validateCapabilityStructure(cap) {
        const errors = [];

        if (!cap.urn || !cap.urn.tags) {
            errors.push('Missing urn.tags object');
        } else if (Object.keys(cap.urn.tags).length === 0) {
            errors.push('Must have at least one tag');
        }

        if (!cap.title || typeof cap.title !== 'string') {
            errors.push('Missing or invalid title');
        }

        if (!cap.command || typeof cap.command !== 'string') {
            errors.push('Missing or invalid command');
        }

        return errors;
    }

    showValidationResult(isValid, message, details = []) {
        const previewEl = document.getElementById('validation-preview');
        const iconEl = document.getElementById('validation-icon');
        const statusEl = document.getElementById('validation-status');
        const detailsEl = document.getElementById('validation-details');
        const registerBtn = document.getElementById('register-btn');

        previewEl.style.display = 'block';
        previewEl.className = `validation-preview ${isValid ? 'valid' : 'invalid'}`;

        iconEl.textContent = isValid ? '\u2713' : '\u2717';
        statusEl.textContent = message;

        if (details.length > 0) {
            detailsEl.innerHTML = details.map(d => `<div class="validation-detail">${this.escapeHtml(d)}</div>`).join('');
        } else {
            detailsEl.innerHTML = '';
        }

        registerBtn.disabled = !isValid;
    }

    clearValidation() {
        const previewEl = document.getElementById('validation-preview');
        const registerBtn = document.getElementById('register-btn');
        const errorEl = document.getElementById('cap-register-error');
        const successEl = document.getElementById('cap-register-success');

        if (previewEl) previewEl.style.display = 'none';
        if (registerBtn) registerBtn.disabled = true;
        if (errorEl) errorEl.style.display = 'none';
        if (successEl) successEl.style.display = 'none';

        this.validatedCap = null;
    }

    async handleCapRegisterSubmit(e) {
        if (!this.validatedCap) {
            return;
        }

        const errorEl = document.getElementById('cap-register-error');
        const successEl = document.getElementById('cap-register-success');
        const registerBtn = document.getElementById('register-btn');

        errorEl.style.display = 'none';
        successEl.style.display = 'none';
        registerBtn.disabled = true;
        registerBtn.textContent = 'Registering...';

        try {
            const token = await this.getAccessToken();
            const response = await fetch('/api/user/capabilities', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.validatedCap)
            });

            const result = await response.json();

            if (!response.ok) {
                this.showError(errorEl, result.message || result.error);
                registerBtn.disabled = false;
                registerBtn.textContent = 'Register Capability';
                return;
            }

            successEl.textContent = `Capability registered successfully: ${result.capurn}`;
            successEl.style.display = 'block';

            document.getElementById('cap-json').value = '';
            this.clearValidation();
            this.loadCapabilities();

            registerBtn.textContent = 'Register Capability';
        } catch (error) {
            console.error('Error registering capability:', error);
            this.showError(errorEl, 'Failed to register capability. Please try again.');
            registerBtn.disabled = false;
            registerBtn.textContent = 'Register Capability';
        }
    }

    // Helpers
    showView(viewName) {
        Object.entries(this.views).forEach(([name, el]) => {
            if (el) {
                el.style.display = name === viewName ? 'flex' : 'none';
            }
        });
    }

    showError(el, message) {
        if (el) {
            el.textContent = message;
            el.style.display = 'block';
        }
    }

    getCapUrnString(cap) {
        if (!cap.urn) return 'cap:unknown';

        if (typeof cap.urn === 'string') {
            return cap.urn;
        }

        if (cap.urn.tags) {
            try {
                const capUrn = CapUrn.fromTags(cap.urn.tags);
                return capUrn.toString();
            } catch (e) {
                return 'cap:unknown';
            }
        }

        return 'cap:unknown';
    }

    formatCapUrn(urn) {
        if (typeof urn === 'string') {
            const parsed = CapUrn.fromString(urn);
            return parsed.toString();
        }

        if (urn && urn.tags) {
            const capUrn = CapUrn.fromTags(urn.tags);
            return capUrn.toString();
        }

        throw new Error('Invalid URN format');
    }

    // Media Specs Methods
    async loadUserMedia() {
        try {
            const token = await this.getAccessToken();
            const response = await fetch('/api/user/media', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load media specs');
            }

            const data = await response.json();
            this.renderMediaSpecs(data.media_specs || []);
        } catch (error) {
            console.error('Error loading media specs:', error);
        }
    }

    renderMediaSpecs(mediaSpecs) {
        const countEl = document.getElementById('media-count');
        const listEl = document.getElementById('media-list');

        if (countEl) {
            countEl.textContent = mediaSpecs.length;
        }

        if (!listEl) return;

        if (mediaSpecs.length === 0) {
            listEl.innerHTML = `
                <div class="media-empty">
                    <p>You haven't defined any custom media specifications yet.</p>
                    <p class="media-hint">Media specs are registered when you register capabilities with custom <code>media_specs</code>.</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = mediaSpecs.map(spec => this.renderMediaCard(spec)).join('');
    }

    renderMediaCard(spec) {
        const title = spec.title || 'Custom Media Type';
        const registeredAt = spec.registered_by?.registered_at
            ? new Date(spec.registered_by.registered_at).toLocaleDateString()
            : '';
        const fromCap = spec.registered_by?.from_capability
            ? `<span class="media-card-source">From: <code>${this.escapeHtml(this.truncateUrn(spec.registered_by.from_capability))}</code></span>`
            : '';

        return `
            <div class="media-card">
                <div class="media-card-header">
                    <code class="media-card-urn">${this.escapeHtml(spec.urn)}</code>
                </div>
                <div class="media-card-body">
                    <h3 class="media-card-title">${this.escapeHtml(title)}</h3>
                    ${spec.media_type ? `<span class="media-card-type">${this.escapeHtml(spec.media_type)}</span>` : ''}
                </div>
                <div class="media-card-footer">
                    ${registeredAt ? `<span class="media-card-date">Defined ${registeredAt}</span>` : ''}
                    ${fromCap}
                </div>
            </div>
        `;
    }

    truncateUrn(urn, maxLen = 50) {
        if (!urn || urn.length <= maxLen) return urn;
        return urn.substring(0, maxLen - 3) + '...';
    }

    // User Graph Methods
    initUserGraph(capabilities) {
        const graphContainer = document.getElementById('user-cap-graph');
        if (!graphContainer) return;

        if (capabilities.length === 0) {
            graphContainer.innerHTML = `
                <div class="graph-empty">
                    <p>Register capabilities to see your conversion graph.</p>
                </div>
            `;
            return;
        }

        // Destroy previous graph if exists
        if (this.userGraph) {
            this.userGraph.destroy();
        }

        // Check if UserCapGraph is available
        if (typeof UserCapGraph === 'undefined') {
            console.warn('UserCapGraph not loaded');
            return;
        }

        this.userGraph = new UserCapGraph('user-cap-graph', { height: 300 });
        this.userGraph.buildFromCapabilities(capabilities);
        this.userGraph.render();

        // Setup fullscreen button
        const fullscreenBtn = document.getElementById('graph-fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.onclick = () => this.userGraph.toggleFullscreen();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});
