import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function test() {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview'
  });

  try {
    const result = await model.generateContent("Hello.");
    console.log("Success 2.5-flash:", result.response.text());
  } catch(e: any) {
    console.error("ERROR 2.5-flash:", e.message);
  }
}

test();
