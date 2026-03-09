// Authentication Library
// Handles password hashing, JWT signing/verification, credential storage,
// email verification, and password reset

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getStore } = require('@netlify/blobs');

// Configuration from environment
const JWT_SECRET = process.env.JWT_SECRET;
const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;

// Token expiration times
const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY = '7d';
const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Bcrypt salt rounds
const SALT_ROUNDS = 12;

// Validate required environment variables at module load
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}
if (!NETLIFY_SITE_ID) {
    throw new Error('NETLIFY_SITE_ID environment variable is required');
}
if (!NETLIFY_TOKEN) {
    throw new Error('NETLIFY_TOKEN environment variable is required');
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password requirements
const MIN_PASSWORD_LENGTH = 8;

// Get configured Netlify Blobs store
function getConfiguredStore(storeName) {
    return getStore({
        name: storeName,
        siteID: NETLIFY_SITE_ID,
        token: NETLIFY_TOKEN
    });
}

// Get the credentials store (email -> hashed password + user id + emailVerified)
function getCredentialsStore() {
    return getConfiguredStore('credentials');
}

// Get the refresh tokens store
function getRefreshTokensStore() {
    return getConfiguredStore('refresh_tokens');
}

// Get the verification tokens store
function getVerificationTokensStore() {
    return getConfiguredStore('verification_tokens');
}

// Get the password reset tokens store
function getPasswordResetTokensStore() {
    return getConfiguredStore('password_reset_tokens');
}

// Hash a password
async function hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify a password against a hash
async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

// Generate a unique user ID
function generateUserId() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 15);
    return `user_${timestamp}${randomPart}`;
}

// Generate a secure random token
function generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Normalize email for storage (lowercase, trimmed)
function normalizeEmail(email) {
    return email.toLowerCase().trim();
}

// Validate email format
function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return { valid: false, error: 'Email is required' };
    }
    const normalized = normalizeEmail(email);
    if (!EMAIL_REGEX.test(normalized)) {
        return { valid: false, error: 'Invalid email format' };
    }
    return { valid: true, email: normalized };
}

// Validate password strength
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
    }
    return { valid: true };
}

// Create access token
function createAccessToken(userId, email) {
    const payload = {
        sub: userId,
        email: email,
        type: 'access'
    };
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
        issuer: 'capdag.com'
    });
}

// Create refresh token
function createRefreshToken(userId) {
    const payload = {
        sub: userId,
        type: 'refresh',
        jti: generateTokenId()
    };
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
        issuer: 'capdag.com'
    });
}

// Generate a unique token ID for refresh tokens
function generateTokenId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 15)}`;
}

// Verify access token
function verifyAccessToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: 'capdag.com',
            algorithms: ['HS256']
        });
        if (decoded.type !== 'access') {
            return { error: 'Invalid token type', status: 401 };
        }
        return {
            success: true,
            user: {
                id: decoded.sub,
                email: decoded.email
            }
        };
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return { error: 'Token expired', status: 401 };
        }
        if (err.name === 'JsonWebTokenError') {
            return { error: 'Invalid token', status: 401 };
        }
        return { error: 'Token verification failed', status: 401 };
    }
}

// Verify refresh token
function verifyRefreshToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: 'capdag.com',
            algorithms: ['HS256']
        });
        if (decoded.type !== 'refresh') {
            return { error: 'Invalid token type', status: 401 };
        }
        return {
            success: true,
            userId: decoded.sub,
            tokenId: decoded.jti
        };
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return { error: 'Refresh token expired', status: 401 };
        }
        if (err.name === 'JsonWebTokenError') {
            return { error: 'Invalid refresh token', status: 401 };
        }
        return { error: 'Refresh token verification failed', status: 401 };
    }
}

// Create verification token for email
async function createVerificationToken(email) {
    const token = generateSecureToken();
    const now = Date.now();
    const expiresAt = now + VERIFICATION_TOKEN_EXPIRY_MS;

    const tokenData = {
        email: email,
        createdAt: now,
        expiresAt: expiresAt
    };

    const store = getVerificationTokensStore();
    await store.set(token, JSON.stringify(tokenData));

    return token;
}

// Verify email verification token
async function verifyEmailToken(token) {
    if (!token) {
        return { error: 'Verification token is required', status: 400 };
    }

    const store = getVerificationTokensStore();
    const tokenData = await store.get(token);

    if (!tokenData) {
        return { error: 'Invalid or expired verification token', status: 400 };
    }

    const data = JSON.parse(tokenData);

    if (Date.now() > data.expiresAt) {
        await store.delete(token);
        return { error: 'Verification token has expired', status: 400 };
    }

    // Mark email as verified in credentials
    const credentialsStore = getCredentialsStore();
    const credentialData = await credentialsStore.get(data.email);

    if (!credentialData) {
        return { error: 'User not found', status: 404 };
    }

    const credential = JSON.parse(credentialData);
    credential.emailVerified = true;
    credential.emailVerifiedAt = new Date().toISOString();

    await credentialsStore.set(data.email, JSON.stringify(credential));

    // Delete the used token
    await store.delete(token);

    console.log(`Email verified: ${data.email}`);

    return {
        success: true,
        email: data.email,
        userId: credential.userId
    };
}

// Create password reset token
async function createPasswordResetToken(email) {
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        return { error: emailValidation.error, status: 400 };
    }
    const normalizedEmail = emailValidation.email;

    // Check if user exists
    const credentialsStore = getCredentialsStore();
    const credentialData = await credentialsStore.get(normalizedEmail);

    if (!credentialData) {
        // Don't reveal if email exists - return success anyway
        return { success: true, email: normalizedEmail, tokenCreated: false };
    }

    const token = generateSecureToken();
    const now = Date.now();
    const expiresAt = now + PASSWORD_RESET_TOKEN_EXPIRY_MS;

    const tokenData = {
        email: normalizedEmail,
        createdAt: now,
        expiresAt: expiresAt
    };

    const store = getPasswordResetTokensStore();
    await store.set(token, JSON.stringify(tokenData));

    console.log(`Password reset token created for: ${normalizedEmail}`);

    return {
        success: true,
        email: normalizedEmail,
        token: token,
        tokenCreated: true
    };
}

// Reset password with token
async function resetPasswordWithToken(token, newPassword) {
    if (!token) {
        return { error: 'Reset token is required', status: 400 };
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
        return { error: passwordValidation.error, status: 400 };
    }

    const store = getPasswordResetTokensStore();
    const tokenData = await store.get(token);

    if (!tokenData) {
        return { error: 'Invalid or expired reset token', status: 400 };
    }

    const data = JSON.parse(tokenData);

    if (Date.now() > data.expiresAt) {
        await store.delete(token);
        return { error: 'Reset token has expired', status: 400 };
    }

    // Update password
    const credentialsStore = getCredentialsStore();
    const credentialData = await credentialsStore.get(data.email);

    if (!credentialData) {
        return { error: 'User not found', status: 404 };
    }

    const credential = JSON.parse(credentialData);
    credential.passwordHash = await hashPassword(newPassword);
    credential.passwordChangedAt = new Date().toISOString();

    await credentialsStore.set(data.email, JSON.stringify(credential));

    // Delete the used token
    await store.delete(token);

    // Revoke all refresh tokens for this user (force re-login)
    await revokeAllUserRefreshTokens(credential.userId);

    console.log(`Password reset for: ${data.email}`);

    return {
        success: true,
        email: data.email
    };
}

// Revoke all refresh tokens for a user
async function revokeAllUserRefreshTokens(userId) {
    const store = getRefreshTokensStore();
    const tokens = await store.list();

    for await (const key of tokens.blobs) {
        const tokenData = await store.get(key.key);
        if (tokenData) {
            const data = JSON.parse(tokenData);
            if (data.userId === userId) {
                await store.delete(key.key);
            }
        }
    }
}

// Register a new user (does NOT issue tokens - requires email verification first)
async function registerUser(email, password) {
    // Validate inputs
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        return { error: emailValidation.error, status: 400 };
    }
    const normalizedEmail = emailValidation.email;

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
        return { error: passwordValidation.error, status: 400 };
    }

    const credentialsStore = getCredentialsStore();

    // Check if email already exists
    const existingCredential = await credentialsStore.get(normalizedEmail);
    if (existingCredential) {
        return { error: 'Email already registered', status: 409 };
    }

    // Create user
    const userId = generateUserId();
    const hashedPassword = await hashPassword(password);
    const now = new Date().toISOString();

    const credential = {
        userId: userId,
        email: normalizedEmail,
        passwordHash: hashedPassword,
        emailVerified: false,
        createdAt: now
    };

    // Store credential
    await credentialsStore.set(normalizedEmail, JSON.stringify(credential));

    // Create verification token
    const verificationToken = await createVerificationToken(normalizedEmail);

    console.log(`User registered (pending verification): ${normalizedEmail} (${userId})`);

    return {
        success: true,
        userId: userId,
        email: normalizedEmail,
        verificationToken: verificationToken,
        requiresVerification: true
    };
}

// Resend verification email
async function resendVerificationToken(email) {
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        return { error: emailValidation.error, status: 400 };
    }
    const normalizedEmail = emailValidation.email;

    const credentialsStore = getCredentialsStore();
    const credentialData = await credentialsStore.get(normalizedEmail);

    if (!credentialData) {
        // Don't reveal if email exists
        return { success: true, email: normalizedEmail, tokenCreated: false };
    }

    const credential = JSON.parse(credentialData);

    if (credential.emailVerified) {
        return { error: 'Email is already verified', status: 400 };
    }

    // Create new verification token
    const verificationToken = await createVerificationToken(normalizedEmail);

    return {
        success: true,
        email: normalizedEmail,
        verificationToken: verificationToken,
        tokenCreated: true
    };
}

// Login user (requires verified email)
async function loginUser(email, password) {
    // Validate inputs
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        return { error: emailValidation.error, status: 400 };
    }
    const normalizedEmail = emailValidation.email;

    if (!password) {
        return { error: 'Password is required', status: 400 };
    }

    const credentialsStore = getCredentialsStore();

    // Get credential
    const credentialData = await credentialsStore.get(normalizedEmail);
    if (!credentialData) {
        return { error: 'Invalid email or password', status: 401 };
    }

    const credential = JSON.parse(credentialData);

    // Verify password
    const passwordValid = await verifyPassword(password, credential.passwordHash);
    if (!passwordValid) {
        return { error: 'Invalid email or password', status: 401 };
    }

    // Check if email is verified
    if (!credential.emailVerified) {
        return {
            error: 'Please verify your email before signing in',
            status: 403,
            requiresVerification: true,
            email: normalizedEmail
        };
    }

    // Generate tokens
    const accessToken = createAccessToken(credential.userId, normalizedEmail);
    const refreshToken = createRefreshToken(credential.userId);

    // Store refresh token
    const refreshTokensStore = getRefreshTokensStore();
    const refreshTokenData = verifyRefreshToken(refreshToken);
    const now = new Date().toISOString();
    await refreshTokensStore.set(refreshTokenData.tokenId, JSON.stringify({
        userId: credential.userId,
        createdAt: now
    }));

    console.log(`User logged in: ${normalizedEmail}`);

    return {
        success: true,
        userId: credential.userId,
        email: normalizedEmail,
        accessToken: accessToken,
        refreshToken: refreshToken
    };
}

// Refresh access token
async function refreshAccessToken(refreshToken) {
    // Verify refresh token
    const verification = verifyRefreshToken(refreshToken);
    if (verification.error) {
        return verification;
    }

    // Check if refresh token is still valid in store
    const refreshTokensStore = getRefreshTokensStore();
    const storedToken = await refreshTokensStore.get(verification.tokenId);
    if (!storedToken) {
        return { error: 'Refresh token revoked', status: 401 };
    }

    const tokenData = JSON.parse(storedToken);
    if (tokenData.userId !== verification.userId) {
        return { error: 'Invalid refresh token', status: 401 };
    }

    // Get user email from credentials
    const credentialsStore = getCredentialsStore();
    const credentials = await credentialsStore.list();
    let userEmail = null;

    for await (const key of credentials.blobs) {
        const credData = await credentialsStore.get(key.key);
        if (credData) {
            const cred = JSON.parse(credData);
            if (cred.userId === verification.userId) {
                userEmail = cred.email;
                break;
            }
        }
    }

    if (!userEmail) {
        return { error: 'User not found', status: 401 };
    }

    // Generate new access token
    const accessToken = createAccessToken(verification.userId, userEmail);

    return {
        success: true,
        accessToken: accessToken
    };
}

// Revoke refresh token (logout)
async function revokeRefreshToken(refreshToken) {
    const verification = verifyRefreshToken(refreshToken);
    if (verification.error) {
        // Token is invalid anyway, consider it revoked
        return { success: true };
    }

    const refreshTokensStore = getRefreshTokensStore();
    await refreshTokensStore.delete(verification.tokenId);

    return { success: true };
}

// Extract token from authorization header
function extractBearerToken(event) {
    const authHeader = event.headers.authorization || event.headers.Authorization;

    if (!authHeader) {
        return { error: 'Missing authorization header', status: 401 };
    }

    if (!authHeader.startsWith('Bearer ')) {
        return { error: 'Invalid authorization header format - must be Bearer token', status: 401 };
    }

    const token = authHeader.substring(7);

    if (!token) {
        return { error: 'Empty token', status: 401 };
    }

    return { token: token };
}

// Verify request authentication
async function verifyRequestAuth(event) {
    const tokenResult = extractBearerToken(event);
    if (tokenResult.error) {
        return tokenResult;
    }

    return verifyAccessToken(tokenResult.token);
}

// Get user credential by email (for internal use)
async function getCredentialByEmail(email) {
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        return null;
    }

    const credentialsStore = getCredentialsStore();
    const credentialData = await credentialsStore.get(emailValidation.email);

    if (!credentialData) {
        return null;
    }

    return JSON.parse(credentialData);
}

module.exports = {
    hashPassword,
    verifyPassword,
    validateEmail,
    validatePassword,
    createAccessToken,
    createRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    createVerificationToken,
    verifyEmailToken,
    createPasswordResetToken,
    resetPasswordWithToken,
    resendVerificationToken,
    registerUser,
    loginUser,
    refreshAccessToken,
    revokeRefreshToken,
    extractBearerToken,
    verifyRequestAuth,
    getCredentialsStore,
    getRefreshTokensStore,
    getCredentialByEmail
};
