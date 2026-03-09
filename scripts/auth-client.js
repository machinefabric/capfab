// CAPDAG Authentication Client
// Handles user authentication with PoW challenge, Turnstile verification,
// email verification, and password reset

class AuthClient {
    constructor() {
        this.accessToken = null;
        this.refreshToken = null;
        this.user = null;
        this.refreshPromise = null;
        this.powSolver = null;

        // Load tokens from localStorage
        this.loadTokens();
    }

    loadTokens() {
        try {
            const storedAuth = localStorage.getItem('capdag_auth');
            if (storedAuth) {
                const auth = JSON.parse(storedAuth);
                this.accessToken = auth.accessToken;
                this.refreshToken = auth.refreshToken;
                this.user = auth.user;
            }
        } catch (e) {
            this.clearTokens();
        }
    }

    saveTokens() {
        try {
            localStorage.setItem('capdag_auth', JSON.stringify({
                accessToken: this.accessToken,
                refreshToken: this.refreshToken,
                user: this.user
            }));
        } catch (e) {
            console.error('Failed to save auth tokens:', e);
        }
    }

    clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        this.user = null;
        localStorage.removeItem('capdag_auth');
    }

    isAuthenticated() {
        return this.accessToken !== null && this.user !== null;
    }

    getUser() {
        return this.user;
    }

    // Get a new challenge from the server
    async getChallenge() {
        const response = await fetch('/api/challenge', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to get challenge');
        }

        return response.json();
    }

    // Solve a PoW challenge
    async solveChallenge(challenge, onProgress) {
        if (!this.powSolver) {
            this.powSolver = new PowSolver();
        }

        const solution = await this.powSolver.solve(
            challenge.challengeData,
            challenge.difficulty,
            onProgress
        );

        return {
            challengeId: challenge.challengeId,
            nonce: solution.nonce
        };
    }

    // Get Turnstile token from the widget
    getTurnstileToken(widgetId) {
        if (typeof turnstile === 'undefined') {
            throw new Error('Turnstile not loaded');
        }

        const token = widgetId ? turnstile.getResponse(widgetId) : turnstile.getResponse();
        if (!token) {
            throw new Error('Please complete the verification checkbox');
        }

        return token;
    }

    // Reset Turnstile widget
    resetTurnstile(widgetId) {
        if (typeof turnstile !== 'undefined') {
            if (widgetId) {
                turnstile.reset(widgetId);
            } else {
                turnstile.reset();
            }
        }
    }

    // Get challenge solution and Turnstile token
    async getChallengeAndSolve(onProgress, turnstileWidgetId) {
        if (onProgress) onProgress('status', 'Getting challenge...');
        const challenge = await this.getChallenge();

        if (onProgress) onProgress('status', 'Solving challenge...');
        const solution = await this.solveChallenge(challenge, (attempts, timeMs) => {
            if (onProgress) onProgress('pow', { attempts, timeMs });
        });

        const turnstileToken = this.getTurnstileToken(turnstileWidgetId);

        return {
            challengeId: solution.challengeId,
            nonce: solution.nonce,
            turnstileToken
        };
    }

    async register(email, password, onProgress, turnstileWidgetId) {
        const challenge = await this.getChallengeAndSolve(onProgress, turnstileWidgetId);

        if (onProgress) onProgress('status', 'Creating account...');

        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                password,
                ...challenge
            })
        });

        const result = await response.json();
        this.resetTurnstile(turnstileWidgetId);

        if (!response.ok) {
            throw new Error(result.error || 'Registration failed');
        }

        // Registration now requires email verification
        return {
            requiresVerification: true,
            email: result.email,
            message: result.message
        };
    }

    async login(email, password, onProgress, turnstileWidgetId) {
        const challenge = await this.getChallengeAndSolve(onProgress, turnstileWidgetId);

        if (onProgress) onProgress('status', 'Signing in...');

        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                password,
                ...challenge
            })
        });

        const result = await response.json();
        this.resetTurnstile(turnstileWidgetId);

        if (!response.ok) {
            if (result.requiresVerification) {
                const error = new Error(result.error || 'Email verification required');
                error.requiresVerification = true;
                error.email = result.email;
                throw error;
            }
            throw new Error(result.error || 'Login failed');
        }

        this.accessToken = result.accessToken;
        this.refreshToken = result.refreshToken;
        this.user = {
            id: result.userId,
            email: result.email
        };

        this.saveTokens();
        return this.user;
    }

    async verifyEmail(token) {
        const response = await fetch('/api/auth/verify-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Email verification failed');
        }

        return result;
    }

    async forgotPassword(email, onProgress, turnstileWidgetId) {
        const challenge = await this.getChallengeAndSolve(onProgress, turnstileWidgetId);

        if (onProgress) onProgress('status', 'Sending reset email...');

        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                ...challenge
            })
        });

        const result = await response.json();
        this.resetTurnstile(turnstileWidgetId);

        if (!response.ok) {
            throw new Error(result.error || 'Failed to send reset email');
        }

        return result;
    }

    async resetPassword(token, password) {
        const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token, password })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Password reset failed');
        }

        return result;
    }

    async resendVerification(email, onProgress, turnstileWidgetId) {
        const challenge = await this.getChallengeAndSolve(onProgress, turnstileWidgetId);

        if (onProgress) onProgress('status', 'Sending verification email...');

        const response = await fetch('/api/auth/resend-verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                ...challenge
            })
        });

        const result = await response.json();
        this.resetTurnstile(turnstileWidgetId);

        if (!response.ok) {
            throw new Error(result.error || 'Failed to resend verification email');
        }

        return result;
    }

    async logout() {
        if (this.refreshToken) {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ refreshToken: this.refreshToken })
                });
            } catch (e) {
                console.error('Logout request failed:', e);
            }
        }

        this.clearTokens();

        // Cleanup PoW solver
        if (this.powSolver) {
            this.powSolver.terminate();
            this.powSolver = null;
        }
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        // Prevent multiple simultaneous refresh requests
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        this.refreshPromise = this.doRefresh();

        try {
            await this.refreshPromise;
        } finally {
            this.refreshPromise = null;
        }
    }

    async doRefresh() {
        const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refreshToken: this.refreshToken })
        });

        const result = await response.json();

        if (!response.ok) {
            this.clearTokens();
            throw new Error(result.error || 'Token refresh failed');
        }

        this.accessToken = result.accessToken;
        this.saveTokens();
    }

    async getAccessToken() {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }

        // Check if token is expired by decoding it
        try {
            const payload = this.decodeToken(this.accessToken);
            const now = Math.floor(Date.now() / 1000);

            // Refresh if token expires in less than 5 minutes
            if (payload.exp && payload.exp - now < 300) {
                await this.refreshAccessToken();
            }
        } catch (e) {
            // If we can't decode, try to refresh
            try {
                await this.refreshAccessToken();
            } catch (refreshError) {
                throw new Error('Session expired');
            }
        }

        return this.accessToken;
    }

    decodeToken(token) {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid token format');
        }

        const payload = parts[1];
        const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(decoded);
    }
}

// Export as global
window.AuthClient = AuthClient;
