// Netlify Function: Authentication Endpoints
// Handles register, login, verify-email, forgot-password, reset-password, resend-verification

const {
    registerUser,
    loginUser,
    refreshAccessToken,
    revokeRefreshToken,
    verifyRequestAuth,
    verifyEmailToken,
    createPasswordResetToken,
    resetPasswordWithToken,
    resendVerificationToken
} = require('./lib/auth.js');

const { verifyAuthChallenge } = require('./lib/challenge.js');
const { sendVerificationEmail, sendPasswordResetEmail } = require('./lib/email.js');

const {
    jsonResponse,
    handlePreflight,
    getUsersStore
} = require('./lib/identity-auth.js');

exports.handler = async (event) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return handlePreflight();
    }

    // Parse the path to determine the action
    const path = event.path.replace(/^\/\.netlify\/functions\/api-auth\/?/, '').replace(/^\/api\/auth\/?/, '');

    try {
        switch (path) {
            case 'register':
                return await handleRegister(event);
            case 'login':
                return await handleLogin(event);
            case 'refresh':
                return await handleRefresh(event);
            case 'logout':
                return await handleLogout(event);
            case 'me':
                return await handleMe(event);
            case 'verify-email':
                return await handleVerifyEmail(event);
            case 'forgot-password':
                return await handleForgotPassword(event);
            case 'reset-password':
                return await handleResetPassword(event);
            case 'resend-verification':
                return await handleResendVerification(event);
            default:
                return jsonResponse(404, { error: 'Not found' });
        }
    } catch (error) {
        console.error('Auth error:', error);
        return jsonResponse(500, {
            error: 'Internal server error',
            message: error.message
        });
    }
};

// Get client IP from request
function getClientIp(event) {
    return event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           event.headers['x-real-ip'] ||
           event.headers['client-ip'] ||
           null;
}

async function handleRegister(event) {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return jsonResponse(400, { error: 'Invalid JSON' });
    }

    const { email, password, challengeId, nonce, turnstileToken } = body;

    // Verify challenge and Turnstile
    const clientIp = getClientIp(event);
    const challengeResult = await verifyAuthChallenge(challengeId, nonce, turnstileToken, clientIp);

    if (!challengeResult.valid) {
        return jsonResponse(400, {
            error: challengeResult.error,
            type: challengeResult.type
        });
    }

    const result = await registerUser(email, password);

    if (result.error) {
        return jsonResponse(result.status, { error: result.error });
    }

    // Send verification email
    try {
        await sendVerificationEmail(result.email, result.verificationToken);
    } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Don't fail registration if email fails - user can resend
    }

    return jsonResponse(201, {
        message: 'Registration successful. Please check your email to verify your account.',
        email: result.email,
        requiresVerification: true
    });
}

async function handleLogin(event) {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return jsonResponse(400, { error: 'Invalid JSON' });
    }

    const { email, password, challengeId, nonce, turnstileToken } = body;

    // Verify challenge and Turnstile
    const clientIp = getClientIp(event);
    const challengeResult = await verifyAuthChallenge(challengeId, nonce, turnstileToken, clientIp);

    if (!challengeResult.valid) {
        return jsonResponse(400, {
            error: challengeResult.error,
            type: challengeResult.type
        });
    }

    const result = await loginUser(email, password);

    if (result.error) {
        const response = { error: result.error };
        if (result.requiresVerification) {
            response.requiresVerification = true;
            response.email = result.email;
        }
        return jsonResponse(result.status, response);
    }

    return jsonResponse(200, {
        message: 'Login successful',
        userId: result.userId,
        email: result.email,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
    });
}

async function handleRefresh(event) {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return jsonResponse(400, { error: 'Invalid JSON' });
    }

    const { refreshToken } = body;

    if (!refreshToken) {
        return jsonResponse(400, { error: 'Refresh token is required' });
    }

    const result = await refreshAccessToken(refreshToken);

    if (result.error) {
        return jsonResponse(result.status, { error: result.error });
    }

    return jsonResponse(200, {
        accessToken: result.accessToken
    });
}

async function handleLogout(event) {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return jsonResponse(400, { error: 'Invalid JSON' });
    }

    const { refreshToken } = body;

    if (refreshToken) {
        await revokeRefreshToken(refreshToken);
    }

    return jsonResponse(200, { message: 'Logged out successfully' });
}

async function handleMe(event) {
    if (event.httpMethod !== 'GET') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    const authResult = await verifyRequestAuth(event);
    if (authResult.error) {
        return jsonResponse(authResult.status, { error: authResult.error });
    }

    const user = authResult.user;

    // Get profile from users store if it exists
    const usersStore = getUsersStore();
    const profileData = await usersStore.get(user.id);

    if (profileData) {
        const profile = JSON.parse(profileData);
        return jsonResponse(200, {
            id: user.id,
            email: user.email,
            username: profile.username,
            needs_username: !profile.username,
            registered_caps: profile.registered_caps || []
        });
    }

    return jsonResponse(200, {
        id: user.id,
        email: user.email,
        username: null,
        needs_username: true,
        registered_caps: []
    });
}

async function handleVerifyEmail(event) {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return jsonResponse(400, { error: 'Invalid JSON' });
    }

    const { token } = body;

    const result = await verifyEmailToken(token);

    if (result.error) {
        return jsonResponse(result.status, { error: result.error });
    }

    return jsonResponse(200, {
        message: 'Email verified successfully. You can now sign in.',
        email: result.email
    });
}

async function handleForgotPassword(event) {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return jsonResponse(400, { error: 'Invalid JSON' });
    }

    const { email, challengeId, nonce, turnstileToken } = body;

    // Verify challenge and Turnstile (to prevent abuse)
    const clientIp = getClientIp(event);
    const challengeResult = await verifyAuthChallenge(challengeId, nonce, turnstileToken, clientIp);

    if (!challengeResult.valid) {
        return jsonResponse(400, {
            error: challengeResult.error,
            type: challengeResult.type
        });
    }

    const result = await createPasswordResetToken(email);

    if (result.error) {
        return jsonResponse(result.status, { error: result.error });
    }

    // Send password reset email if token was created
    if (result.tokenCreated) {
        try {
            await sendPasswordResetEmail(result.email, result.token);
        } catch (emailError) {
            console.error('Failed to send password reset email:', emailError);
            // Don't fail the request - don't reveal if email exists
        }
    }

    // Always return success to not reveal if email exists
    return jsonResponse(200, {
        message: 'If an account exists with that email, you will receive a password reset link.'
    });
}

async function handleResetPassword(event) {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return jsonResponse(400, { error: 'Invalid JSON' });
    }

    const { token, password } = body;

    const result = await resetPasswordWithToken(token, password);

    if (result.error) {
        return jsonResponse(result.status, { error: result.error });
    }

    return jsonResponse(200, {
        message: 'Password reset successfully. You can now sign in with your new password.'
    });
}

async function handleResendVerification(event) {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (e) {
        return jsonResponse(400, { error: 'Invalid JSON' });
    }

    const { email, challengeId, nonce, turnstileToken } = body;

    // Verify challenge and Turnstile (to prevent abuse)
    const clientIp = getClientIp(event);
    const challengeResult = await verifyAuthChallenge(challengeId, nonce, turnstileToken, clientIp);

    if (!challengeResult.valid) {
        return jsonResponse(400, {
            error: challengeResult.error,
            type: challengeResult.type
        });
    }

    const result = await resendVerificationToken(email);

    if (result.error) {
        return jsonResponse(result.status, { error: result.error });
    }

    // Send verification email if token was created
    if (result.tokenCreated) {
        try {
            await sendVerificationEmail(result.email, result.verificationToken);
        } catch (emailError) {
            console.error('Failed to send verification email:', emailError);
        }
    }

    // Always return success to not reveal if email exists
    return jsonResponse(200, {
        message: 'If an account exists with that email and is not verified, you will receive a verification link.'
    });
}
