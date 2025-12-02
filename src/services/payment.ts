import axios from 'axios';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_xxxxxxxxxxxxxxxxxxxx'; // Replace with env var in production

export const initializeTransaction = async (email: string, amount: number, reference: string) => {
    try {
        // Amount is in kobo (multiply by 100)
        const response = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email,
                amount: amount * 100,
                reference,
                channels: ['mobile_money', 'card']
            },
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
