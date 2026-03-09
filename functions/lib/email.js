// Email Service using Brevo (formerly Sendinblue)
// Handles sending verification and password reset emails

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@capdag.com';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'CAPDAG Registry';
const SITE_URL = process.env.SITE_URL || 'https://capdag.com';

if (!BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY environment variable is required');
}

async function sendEmail({ to, subject, htmlContent, textContent }) {
    const response = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: {
                name: FROM_NAME,
                email: FROM_EMAIL
            },
            to: [{ email: to }],
            subject: subject,
            htmlContent: htmlContent,
            textContent: textContent
        })
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Brevo API error:', error);
        throw new Error('Failed to send email: ' + (error.message || response.statusText));
    }

    return response.json();
}

async function sendVerificationEmail(email, token) {
    const verifyUrl = `${SITE_URL}/dashboard?action=verify&token=${encodeURIComponent(token)}`;

    const subject = 'Verify your CAPDAG account';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="font-family: 'JetBrains Mono', monospace; color: #2563eb; margin: 0;">cap:</h1>
    </div>

    <h2 style="margin-bottom: 20px;">Verify your email address</h2>

    <p>Thank you for registering with CAPDAG Registry. Please click the button below to verify your email address:</p>

    <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 500;">Verify Email</a>
    </div>

    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; font-size: 14px; color: #2563eb;">${verifyUrl}</p>

    <p style="color: #666; font-size: 14px; margin-top: 30px;">This link will expire in 24 hours.</p>

    <p style="color: #666; font-size: 14px;">If you didn't create an account with CAPDAG, you can safely ignore this email.</p>

    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; text-align: center;">
        CAPDAG Registry - An addressing layer for computation<br>
        <a href="${SITE_URL}" style="color: #2563eb;">capdag.com</a>
    </p>
</body>
</html>
`;

    const textContent = `
Verify your CAPDAG account

Thank you for registering with CAPDAG Registry. Please visit the following link to verify your email address:

${verifyUrl}

This link will expire in 24 hours.

If you didn't create an account with CAPDAG, you can safely ignore this email.

---
CAPDAG Registry - An addressing layer for computation
${SITE_URL}
`;

    await sendEmail({ to: email, subject, htmlContent, textContent });
    console.log(`Verification email sent to ${email}`);
}

async function sendPasswordResetEmail(email, token) {
    const resetUrl = `${SITE_URL}/dashboard?action=reset-password&token=${encodeURIComponent(token)}`;

    const subject = 'Reset your CAPDAG password';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="font-family: 'JetBrains Mono', monospace; color: #2563eb; margin: 0;">cap:</h1>
    </div>

    <h2 style="margin-bottom: 20px;">Reset your password</h2>

    <p>We received a request to reset your CAPDAG account password. Click the button below to set a new password:</p>

    <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 500;">Reset Password</a>
    </div>

    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; font-size: 14px; color: #2563eb;">${resetUrl}</p>

    <p style="color: #666; font-size: 14px; margin-top: 30px;">This link will expire in 1 hour.</p>

    <p style="color: #666; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>

    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">

    <p style="color: #999; font-size: 12px; text-align: center;">
        CAPDAG Registry - An addressing layer for computation<br>
        <a href="${SITE_URL}" style="color: #2563eb;">capdag.com</a>
    </p>
</body>
</html>
`;

    const textContent = `
Reset your CAPDAG password

We received a request to reset your CAPDAG account password. Visit the following link to set a new password:

${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

---
CAPDAG Registry - An addressing layer for computation
${SITE_URL}
`;

    await sendEmail({ to: email, subject, htmlContent, textContent });
    console.log(`Password reset email sent to ${email}`);
}

module.exports = {
    sendEmail,
    sendVerificationEmail,
    sendPasswordResetEmail
};
