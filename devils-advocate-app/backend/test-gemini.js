const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function test() {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 128,
      responseMimeType: 'application/json',
    }
  });

  try {
    const result = await model.generateContent(
      `Generate a single controversial, thought-provoking debate topic suitable for a challenging intensity debate. The AI persona is "devils_advocate". Return JSON: { "topic": "the topic text", "difficultyRating": <number 1-10> }`
    );
    console.log("Raw Response:");
    console.log(result.response.text());
    console.log("Parsed:", JSON.parse(result.response.text()));
  } catch(e) {
    console.error("ERROR:", e.message);
  }
}

test();
