import axios from 'axios';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_xxxxxxxxxxxxxxxxxxxx'; // Replace with env var in production

export const initializeTransaction = async (email: string, amount: number, reference: string, subaccount?: string | null) => {
    try {
        // Amount is in kobo (multiply by 100)
        const payload: any = {
            email,
            amount: Math.round(amount * 100),
            reference,
            channels: ['mobile_money', 'card'],
            callback_url: process.env.PAYSTACK_CALLBACK_URL
        };

        if (subaccount) {
            payload.subaccount = subaccount;
        }

        const response = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            payload,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.data; // Contains authorization_url, access_code, reference
    } catch (error: any) {
        console.error('Paystack Initialize Error:', error.response?.data || error.message);
        throw new Error('Payment initialization failed');
    }
};

export const createPaystackSubaccount = async (businessName: string, settlementBank: string, accountNumber: string, percentageCharge: number = 15) => {
    try {
        const response = await axios.post(
            'https://api.paystack.co/subaccount',
            {
                business_name: businessName,
                settlement_bank: settlementBank,
                account_number: accountNumber,
                percentage_charge: percentageCharge
            },
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.data; // Contains subaccount_code (e.g., ACCT_xxxxxxx)
    } catch (error: any) {
        console.error('Paystack Subaccount Create Error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || 'Failed to create Paystack subaccount');
    }
};

export const verifyTransaction = async (reference: string) => {
    try {
        const response = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
                }
            }
        );
        return response.data.data; // Contains status, amount, etc.
    } catch (error: any) {
        console.error('Paystack Verify Error:', error.response?.data || error.message);
        throw new Error('Payment verification failed');
    }
};
