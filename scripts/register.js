// CAPDAG Registration Page

class RegisterPage {
    constructor() {
        this.auth = null;
        this.config = null;
        this.turnstileWidgetIds = {};
        this.pendingVerificationEmail = null;

        this.cards = {
            register: document.getElementById('register-card'),
            checkEmail: document.getElementById('check-email-card')
        };

        this.init();
    }

    async init() {
        try {
            // Fetch config
            this.config = await this.fetchConfig();

            // Initialize auth client
            this.auth = new AuthClient();

            // If already authenticated, redirect to dashboard
            if (this.auth.isAuthenticated()) {
                window.location.href = '/dashboard';
                return;
            }

            this.initializeTurnstile();
            this.setupEventListeners();
            this.setupHamburgerMenu();
            this.setupThemeToggle();

        } catch (error) {
            console.error('Registration page initialization failed:', error);
        }
    }

    async fetchConfig() {
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error('Failed to load configuration');
        }
        return response.json();
    }

    initializeTurnstile() {
        if (typeof turnstile === 'undefined' || !this.config?.turnstileSiteKey) {
            setTimeout(() => this.initializeTurnstile(), 100);
            return;
        }

        const containers = [
            { id: 'register-turnstile', key: 'register' },
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
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', e => this.handleRegister(e));
        }

        const resendBtn = document.getElementById('resend-verification-btn');
        if (resendBtn) {
            resendBtn.addEventListener('click', () => this.handleResendVerification());
        }
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

    showError(el, message) {
        if (el) {
            el.textContent = message;
            el.style.display = 'block';
        }
    }

    async handleRegister(e) {
        e.preventDefault();

        const emailInput = document.getElementById('register-email');
        const passwordInput = document.getElementById('register-password');
        const confirmInput = document.getElementById('register-confirm');
        const errorEl = document.getElementById('register-error');
        const statusEl = document.getElementById('register-status');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        errorEl.style.display = 'none';

        if (passwordInput.value !== confirmInput.value) {
            this.showError(errorEl, 'Passwords do not match');
            return;
        }

        submitBtn.disabled = true;

        const onProgress = (type, data) => {
            if (type === 'status') {
                this.showStatus(statusEl, data);
            } else if (type === 'pow') {
                this.showStatus(statusEl, `Verifying... (${Math.round(data.attempts / 1000)}k attempts)`);
            }
        };

        try {
            const widgetId = this.turnstileWidgetIds.register;
            const result = await this.auth.register(emailInput.value, passwordInput.value, onProgress, widgetId);
            this.hideStatus(statusEl);

            // Show check email view
            this.pendingVerificationEmail = result.email;
            document.getElementById('check-email-address').textContent = result.email;
            this.showCard('checkEmail');
            this.initializeTurnstile();
        } catch (error) {
            this.hideStatus(statusEl);
            this.showError(errorEl, error.message);
            submitBtn.disabled = false;
            if (typeof turnstile !== 'undefined' && this.turnstileWidgetIds.register) {
                turnstile.reset(this.turnstileWidgetIds.register);
            }
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new RegisterPage();
});
