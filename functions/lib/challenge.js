// Proof-of-Work Challenge Library
// Issues and verifies computational challenges to slow down automated attacks

const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

// Configuration
const CHALLENGE_DIFFICULTY = 4; // Number of leading zero hex chars required (4 = 16^4 = 65536 attempts average)
const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Get configured Netlify Blobs store
function getChallengesStore() {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_TOKEN;

    if (!siteID || !token) {
        throw new Error('NETLIFY_SITE_ID and NETLIFY_TOKEN environment variables are required');
    }

    return getStore({
        name: 'challenges',
        siteID: siteID,
        token: token
    });
}

// Generate a new challenge
async function generateChallenge() {
    const challengeId = crypto.randomBytes(16).toString('hex');
    const challengeData = crypto.randomBytes(32).toString('hex');
    const timestamp = Date.now();
    const expiresAt = timestamp + CHALLENGE_EXPIRY_MS;

    const challenge = {
        id: challengeId,
        data: challengeData,
        difficulty: CHALLENGE_DIFFICULTY,
        timestamp: timestamp,
        expiresAt: expiresAt,
        used: false
    };

    // Store challenge
    const store = getChallengesStore();
    await store.set(challengeId, JSON.stringify(challenge));

    return {
        id: challengeId,
        data: challengeData,
        difficulty: CHALLENGE_DIFFICULTY,
        expiresAt: expiresAt
    };
}

// Verify a PoW solution
async function verifyChallengeSolution(challengeId, nonce) {
    if (!challengeId || !nonce) {
        return { valid: false, error: 'Challenge ID and nonce are required' };
    }

    const store = getChallengesStore();
    const challengeData = await store.get(challengeId);

    if (!challengeData) {
        return { valid: false, error: 'Challenge not found or expired' };
    }

    const challenge = JSON.parse(challengeData);

    // Check if expired
    if (Date.now() > challenge.expiresAt) {
        await store.delete(challengeId);
        return { valid: false, error: 'Challenge expired' };
    }

    // Check if already used
    if (challenge.used) {
        return { valid: false, error: 'Challenge already used' };
    }

    // Verify the solution
    const solution = challenge.data + nonce;
    const hash = crypto.createHash('sha256').update(solution).digest('hex');
    const target = '0'.repeat(challenge.difficulty);

    if (!hash.startsWith(target)) {
        return { valid: false, error: 'Invalid solution' };
    }

    // Mark challenge as used
    challenge.used = true;
    await store.set(challengeId, JSON.stringify(challenge));

    // Schedule deletion (best effort)
    setTimeout(async () => {
        try {
            await store.delete(challengeId);
        } catch (e) {
            // Ignore cleanup errors
        }
    }, 1000);

    return { valid: true };
}

// Verify Cloudflare Turnstile token
async function verifyTurnstileToken(token, remoteIp) {
    if (!TURNSTILE_SECRET_KEY) {
        throw new Error('TURNSTILE_SECRET_KEY environment variable is required');
    }

    if (!token) {
        return { valid: false, error: 'Turnstile token is required' };
    }

    const formData = new URLSearchParams();
    formData.append('secret', TURNSTILE_SECRET_KEY);
    formData.append('response', token);
    if (remoteIp) {
        formData.append('remoteip', remoteIp);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
    });

    const result = await response.json();

    if (!result.success) {
        console.error('Turnstile verification failed:', result['error-codes']);
        return { valid: false, error: 'Turnstile verification failed' };
    }

    return { valid: true };
}

// Combined verification for auth requests
async function verifyAuthChallenge(challengeId, nonce, turnstileToken, remoteIp) {
    // Verify PoW first (cheaper check)
    const powResult = await verifyChallengeSolution(challengeId, nonce);
    if (!powResult.valid) {
        return { valid: false, error: powResult.error, type: 'pow' };
    }

    // Then verify Turnstile
    const turnstileResult = await verifyTurnstileToken(turnstileToken, remoteIp);
    if (!turnstileResult.valid) {
        return { valid: false, error: turnstileResult.error, type: 'turnstile' };
    }

    return { valid: true };
}

module.exports = {
    generateChallenge,
    verifyChallengeSolution,
    verifyTurnstileToken,
    verifyAuthChallenge,
    CHALLENGE_DIFFICULTY
};
