import { signAccessToken, signRefreshToken, verifyAccessToken } from './jwt';
import jwt from 'jsonwebtoken';

// Mock environment variables for testing if they aren't set
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';

async function testAuthModule() {
    console.log('--- Starting Auth Module Test ---\n');

    // 1. Test Access Token Generation
    const userPayload = { id: 'user_123', role: 'admin' };
    console.log('1. Generating Access Token for:', userPayload);
    const accessToken = signAccessToken(userPayload);
    console.log('   [PASS] Access Token generated:', accessToken.substring(0, 20) + '...');

    // 2. Test Access Token Verification
    console.log('\n2. Verifying Access Token...');
    try {
        const decoded = verifyAccessToken(accessToken) as any;
        if (decoded.id === userPayload.id && decoded.role === userPayload.role) {
            console.log('   [PASS] Token verified successfully. Payload matches.');
        } else {
            console.error('   [FAIL] Payload mismatch.');
        }
    } catch (error) {
        console.error('   [FAIL] Verification failed:', error);
    }

    // 3. Test Refresh Token Generation
    console.log('\n3. Generating Refresh Token...');
    const refreshToken = signRefreshToken(userPayload);
    console.log('   [PASS] Refresh Token generated:', refreshToken.substring(0, 20) + '...');

    // 4. Manual Verification of Refresh Token (since verifyRefreshToken isn't exported yet)
    console.log('\n4. Inspecting Refresh Token structure...');
    try {
        const decodedRefresh = jwt.verify(refreshToken, REFRESH_SECRET) as any;

        // Check if it has a JTI (Unique ID)
        if (decodedRefresh.jti) {
            console.log('   [PASS] Refresh Token has unique ID (jti):', decodedRefresh.jti);
        } else {
            console.error('   [FAIL] Refresh Token missing jti.');
        }

        // Check expiration (approx 30 days)
        const now = Math.floor(Date.now() / 1000);
        const thirtyDaysSeconds = 30 * 24 * 60 * 60;
        // Allow small time difference buffer
        if (decodedRefresh.exp - now > thirtyDaysSeconds - 100) {
            console.log('   [PASS] Refresh Token expiration is set correctly (~30 days).');
        } else {
            console.warn('   [WARN] Refresh Token expiration might be incorrect.');
        }

    } catch (error) {
        console.error('   [FAIL] Refresh Token verification failed:', error);
    }

    console.log('\n--- Test Complete ---');
}

testAuthModule();