import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000, // 10s timeout
        });
        console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        console.error("===== FULL ERROR =====");
        console.dir(error, { depth: null });
        console.error("======================");
        // Don't exit — allow nodemon to keep running so you can fix the config
    }
};

export default connectDB;
