import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

async function test() {
  try {
    console.log("Testing Gemini API with key:", process.env.GEMINI_API_KEY ? "Loaded" : "Missing");
    const result = await model.generateContent("Say 'API Key is working!'");
    console.log("Success! Gemini response:", result.response.text().trim());
  } catch (error) {
    console.error("Error calling Gemini API:", error);
  }
}
test();
