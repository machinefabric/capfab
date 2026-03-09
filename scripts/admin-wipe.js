#!/usr/bin/env node

// Admin script to wipe all data from the CAPDAG registry
// Usage: node scripts/admin-wipe.js [--production]
//
// Loads environment variables from .env file automatically
// Or pass --production to use https://capdag.com

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load .env file
function loadEnv() {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex > 0) {
                    const key = trimmed.substring(0, eqIndex).trim();
                    const value = trimmed.substring(eqIndex + 1).trim();
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            }
        }
    }
}

loadEnv();

const args = process.argv.slice(2);
const isProduction = args.includes('--production');

const ADMIN_KEY = process.env.CAPDAG_ADMIN_KEY || process.env.ADMIN_PASSWORD;
const SITE_URL = isProduction
    ? 'https://capdag.com'
    : (process.env.SITE_URL || 'http://localhost:8888');

if (!ADMIN_KEY) {
    console.error('Error: ADMIN_PASSWORD not found');
    console.error('');
    console.error('Make sure ADMIN_PASSWORD is set in your .env file');
    process.exit(1);
}

async function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer);
        });
    });
}

async function wipeAllData() {
    console.log('');
    console.log('='.repeat(60));
    console.log('CAPDAG DATA WIPE');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Target: ${SITE_URL}`);
    console.log('');
    console.log('This will DELETE ALL DATA including:');
    console.log('  - All user accounts and credentials');
    console.log('  - All usernames');
    console.log('  - All registered capabilities');
    console.log('  - All authentication tokens');
    console.log('  - All verification and reset tokens');
    console.log('');
    console.log('THIS ACTION CANNOT BE UNDONE.');
    console.log('');

    const confirm1 = await prompt('Type "yes" to continue: ');
    if (confirm1.toLowerCase() !== 'yes') {
        console.log('Aborted.');
        process.exit(0);
    }

    const confirm2 = await prompt('Type "DELETE ALL DATA" to confirm: ');
    if (confirm2 !== 'DELETE ALL DATA') {
        console.log('Aborted.');
        process.exit(0);
    }

    console.log('');
    console.log('Wiping all data...');
    console.log('');

    try {
        const response = await fetch(`${SITE_URL}/api/admin/wipe-all`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ADMIN_KEY}`
            },
            body: JSON.stringify({
                confirm: 'DELETE_ALL_DATA'
            })
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('Error:', result.error || result.message);
            process.exit(1);
        }

        console.log('Success!');
        console.log('');
        console.log(`Total items deleted: ${result.totalDeleted}`);
        console.log('');
        console.log('By store:');
        Object.entries(result.stores).forEach(([store, count]) => {
            if (typeof count === 'number') {
                console.log(`  ${store}: ${count} items`);
            } else {
                console.log(`  ${store}: ERROR - ${count.error}`);
            }
        });
        console.log('');

    } catch (error) {
        console.error('Request failed:', error.message);
        process.exit(1);
    }
}

wipeAllData();
