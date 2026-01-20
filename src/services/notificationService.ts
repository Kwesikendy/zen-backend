import axios from 'axios';

export const sendPushNotification = async (pushToken: string, title: string, body: string, data?: any) => {
    if (!pushToken) return;

    try {
        const message = {
            to: pushToken,
            sound: 'default',
            title,
            body,
            data,
        };

        await axios.post('https://exp.host/--/api/v2/push/send', message, {
            headers: {
                'Accept': 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
        });
        console.log(`Notification sent to ${pushToken}`);
    } catch (error) {
        // Expo often returns 200 even for errors (like invalid token), but axios throws on non-2xx logic.
        // We log it but don't crash.
        console.error('Error sending push notification:', error);
    }
};
