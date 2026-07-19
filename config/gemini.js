import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI = null;
let model = null;

const initGemini = () => {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
        console.warn('⚠️  GEMINI_API_KEY not configured. AI features will return fallback responses.');
        return;
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    console.log('✅ Gemini AI initialized');
};

export const getModel = () => model;
export const isGeminiReady = () => model !== null;

export default initGemini;
