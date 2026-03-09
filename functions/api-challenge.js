// Netlify Function: Challenge Endpoint
// Issues proof-of-work challenges for authentication

const { generateChallenge } = require('./lib/challenge.js');
const { jsonResponse, handlePreflight } = require('./lib/identity-auth.js');

exports.handler = async (event) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return handlePreflight();
    }

    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    try {
        const challenge = await generateChallenge();

        return jsonResponse(200, {
            challengeId: challenge.id,
            challengeData: challenge.data,
            difficulty: challenge.difficulty,
            expiresAt: challenge.expiresAt
        });
    } catch (error) {
        console.error('Challenge generation error:', error);
        return jsonResponse(500, {
            error: 'Failed to generate challenge',
            message: error.message
        });
    }
};
