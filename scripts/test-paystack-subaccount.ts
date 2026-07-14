import dotenv from 'dotenv';
dotenv.config();

import { createPaystackSubaccount, initializeTransaction } from '../src/services/payment';

async function testSubaccountFlow() {
    console.log('--- 🧪 Testing Paystack Subaccount Split Payment (Option B) ---');
    const secretKey = process.env.PAYSTACK_SECRET_KEY || '';

    if (!secretKey || secretKey.includes('xxxxxxxx')) {
        console.log('⚠️ WARNING: You are using a placeholder PAYSTACK_SECRET_KEY in .env.');
        console.log('👉 To run this live test against Paystack servers, paste your Paystack Test Secret Key (sk_test_...) into D:/Zenran/zen-backend/.env and re-run:');
        console.log('   npx ts-node scripts/test-paystack-subaccount.ts');
        return;
    }

    try {
        console.log('\n1️⃣ Creating test Subaccount for "Zenran Test Kitchen" on Paystack...');
        // We use 'MTN' and a test 10-digit MoMo number
        const subaccount = await createPaystackSubaccount(
            'Zenran Test Kitchen',
            'MTN',
            '0551234987',
            15 // 15% to Zenran, 85% to vendor
        );

        console.log('✅ Subaccount successfully created on Paystack!');
        console.log(`   • Subaccount Code: ${subaccount.subaccount_code}`);
        console.log(`   • Settlement Bank: ${subaccount.settlement_bank}`);
        console.log(`   • Account Number: ${subaccount.account_number}`);
        console.log(`   • Percentage Retained by Zenran: ${subaccount.percentage_charge}%\n`);

        console.log('2️⃣ Initializing a test GHS 100 payment split to this Subaccount...');
        const ref = `TEST-SPLIT-${Date.now()}`;
        const transaction = await initializeTransaction(
            'testcustomer@zenran.com',
            100, // GHS 100
            ref,
            subaccount.subaccount_code
        );

        console.log('✅ Split Payment Transaction Initialized Successfully!');
        console.log(`   • Reference: ${transaction.reference}`);
        console.log(`   • Access Code: ${transaction.access_code}`);
        console.log(`   • Checkout URL: ${transaction.authorization_url}`);
        console.log('\n🎉 OPTION B IS FULLY FUNCTIONAL! You can open the Checkout URL above in your browser to complete a test payment and verify the 85%/15% split inside your Paystack Dashboard.');

    } catch (error: any) {
        console.error('❌ Test Failed:', error.message);
    }
}

testSubaccountFlow();
