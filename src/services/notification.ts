// This is a stub for SMS integration. 
// In a real app, you would use Twilio, Arkesel, or similar.

export const sendSMS = async (phoneNumber: string, message: string) => {
    console.log(`[SMS STUB] Sending to ${phoneNumber}: ${message}`);
    // TODO: Integrate actual SMS provider here
    return true;
};

export const generateTicketCode = (orderCount: number): string => {
    // Simple ticket generation: A-101, A-102, etc.
    // Reset daily logic would be handled by the caller (counting orders for the day)
    const paddedNumber = orderCount.toString().padStart(3, '0');
    return `A-${paddedNumber}`;
};
