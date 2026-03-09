# Security Implementation - MachineFabric Admin

This document outlines the comprehensive security system implemented for the MachineFabric admin panel.

## Overview

The admin panel now uses a multi-layered security approach with:
- OK Server-side JWT authentication
- OK Rate limiting (5 attempts per 15 minutes)
- OK Token expiration (24 hours)
- OK Automatic token refresh
- OK Route protection
- OK Secure password storage via environment variables

## Security Features

### 1. JWT-Based Authentication
- **Server-side validation** - All auth logic happens in Netlify Functions
- **Secure tokens** - JWT tokens with expiration and IP binding
- **No client-side secrets** - Password validation only on server

### 2. Rate Limiting
- **Failed login attempts**: Maximum 5 attempts per IP per 15-minute window
- **Lockout mechanism**: Temporary blocking with countdown timer
- **Progressive delays**: Increasing delays for subsequent failures

### 3. Token Management
- **24-hour expiration**: Tokens automatically expire after 24 hours
- **Automatic refresh**: Tokens refresh 1 hour before expiration
- **Secure storage**: Tokens stored in localStorage with expiration tracking

### 4. Route Protection
- **Admin page protection**: Automatic redirect to login if unauthenticated
- **API endpoint protection**: All admin functions require valid JWT
- **Session validation**: Real-time token verification

### 5. Environment-Based Security
- **Password via ENV**: Admin password stored in environment variables
- **JWT secret via ENV**: Signing key stored securely
- **No hardcoded secrets**: All sensitive data externalized

## Implementation Details

### Authentication Flow
1. User submits credentials to `/api/auth`
2. Server validates against environment variable
3. JWT token generated with user info and expiration
4. Token sent to client and stored securely
5. All subsequent requests include JWT in Authorization header
6. Server validates token on each admin API call

### Files Modified
- `functions/auth.js` - Main authentication endpoint
- `functions/auth-middleware.js` - JWT validation middleware
- `functions/admin_actions.js` - Protected with auth middleware
- `scripts/auth.js` - Client-side authentication logic
- `scripts/admin.js` - Admin panel with auth protection
- `admin.html` - Added logout button and auth checks

### Security Headers
All API responses include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

## Setup Instructions

### 1. Environment Variables
Set these in Netlify environment variables:

```bash
# Required - Change these values!
JWT_SECRET=your-super-secret-jwt-key-here-minimum-64-chars
ADMIN_PASSWORD=your-secure-admin-password-here

# Optional - For enhanced security
NETLIFY_SITE_ID=your-site-id
NETLIFY_TOKEN=your-netlify-token
```

### 2. Generate Secure JWT Secret
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Local Development
1. Copy `.env.example` to `.env`
2. Fill in your environment variables
3. Run `netlify dev` for local testing

## Security Best Practices

### For Production:
1. **Use HTTPS only** - Ensure all traffic is encrypted
2. **Strong passwords** - Use a password manager for admin credentials
3. **Environment variables** - Never commit secrets to code
4. **Regular rotation** - Change passwords and JWT secrets periodically
5. **Monitor access** - Review login attempts and admin actions

### Token Security:
- Tokens are signed and verified server-side
- Include IP address for additional validation
- Automatic expiration prevents long-term compromise
- Refresh mechanism maintains security without interruption

## API Endpoints

### Authentication
- `POST /api/auth` - Login, verify, refresh tokens

### Protected Admin Functions
All require `Authorization: Bearer <token>` header:
- `POST /api/admin_actions` - All admin operations

## Rate Limiting Details

### Login Attempts:
- **Window**: 15 minutes
- **Max attempts**: 5 per IP
- **Lockout**: Until window expires
- **Reset**: Successful login clears attempts

### Error Responses:
```json
{
  "success": false,
  "message": "Too many failed attempts. Try again in 12 minutes.",
  "retryAfter": 720
}
```

## Client-Side Security

### Authentication Manager:
- Automatically checks existing tokens on page load
- Redirects to login if authentication fails
- Handles token refresh transparently
- Provides logout functionality

### API Helper:
- All admin API calls use authenticated endpoints
- Automatic redirect on 401 responses
- Error handling for network issues

## Troubleshooting

### Common Issues:

1. **"Invalid token" errors**
   - Check if JWT_SECRET matches between deployments
   - Ensure token hasn't expired
   - Clear localStorage and re-login

2. **"Too many attempts" lockout**
   - Wait for the lockout period to expire
   - Check for correct password
   - Verify ADMIN_PASSWORD environment variable

3. **Environment variables not working**
   - Ensure variables are set in Netlify dashboard
   - Redeploy site after changing environment variables
   - Check variable names match exactly

### Debugging:
- Check browser console for auth errors
- Review Netlify function logs for server errors
- Verify environment variables in Netlify dashboard

## Migration from Old System

The old hardcoded authentication has been completely replaced. 

### Breaking Changes:
- Old tokens (`"machinefabric-admin-2025"`) no longer work
- New login required for all existing sessions
- API calls now require proper JWT authentication

### Upgrade Steps:
1. Deploy new functions with environment variables
2. Clear all user sessions: `localStorage.clear()`
3. Users must re-authenticate with new system

## Security Monitoring

### Recommended Monitoring:
- Track failed login attempts
- Monitor admin action frequency
- Alert on unusual access patterns
- Log all administrative actions

### Log Formats:
```
[Auth] Failed login attempt from IP: 192.168.1.1
[Admin] User performed action: clear_analytics
[Security] Rate limit triggered for IP: 192.168.1.1
```

---

## Support

For security issues or questions:
1. Check this documentation first
2. Review Netlify function logs
3. Verify environment variable configuration
4. Test with fresh browser session

**Never share JWT secrets or admin passwords in support requests.**