import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

// Configure Cloudinary (Env vars should be set in production)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'demo',
    api_key: process.env.CLOUDINARY_API_KEY || '123456789',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'secret'
});

export const uploadImage = async (filePath: string): Promise<string> => {
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            folder: 'zenran-menus'
        });
        // Remove file from local storage after upload
        fs.unlinkSync(filePath);
        return result.secure_url;
    } catch (error) {
        console.error('Cloudinary Upload Error Details:', error);
        // Ensure file is deleted even on error
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        throw new Error('Image upload failed');
    }
};
