require('dotenv').config();
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (HTML, CSS, JS)
app.use(express.json()); // Enable parsing JSON request bodies

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Ensure this directory exists
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });



async function uploadToGemini(path, mimeType) {
  try {
    const uploadResult = await fileManager.uploadFile(path, {
      mimeType,
      displayName: path,
    });
    const file = uploadResult.file;
    console.log(`Uploaded file ${file.displayName} as: ${file.name}`);
    return file;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp", // or the model you prefer
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

async function runChat(userInput, uploadedFiles) {
  try {
    const files = [];
    if (uploadedFiles && uploadedFiles.length > 0) {
      for (const file of uploadedFiles) {
        const geminiFile = await uploadToGemini(file.path, file.mimetype);
        files.push(geminiFile);
      }
    }

    const chatHistory = [
      {
        role: "user",
        parts: [{ text: "You are Chirath, the virtual assistant for HyperClub https://srilankansclub.com/hyperclub/, an e-commerce website. Your job is to assist customers by answering their questions about products, orders, payments, delivery, returns, and promotions available on the website. Always provide accurate and helpful responses in a friendly and professional manner. If a customer asks something beyond your knowledge, kindly direct them to customer support or provide relevant contact details. Keep responses concise and informative while maintaining a welcoming tone." }],
      },
      {
        role: "model",
        parts: [{ text: "Okay, I understand! I'm Chirath, your virtual assistant for HyperClub at srilankansclub.com/hyperclub/. I'm here to help you with any questions you have about our products, orders, payments, delivery, returns, and promotions. Ask away, and I'll do my best to provide you with the information you need. Let's get started!\n" }],
      },
    ];

    if (files.length > 0) {
      chatHistory.push({
        role: "user",
        parts: files.map(file => ({
          fileData: {
            mimeType: file.mimeType,
            fileUri: file.uri,
          },
        })).concat({ text: "these are the products in the shop\nan the name of the products and prices\n" }), //Add this line to prompt Gemini to read the uploaded files
      });
       chatHistory.push({
        role: "model",
        parts: [{ text: "Okay, I see the products and their prices. Please let me know how I can assist you." }],
      });
    }

    chatHistory.push({
      role: "user",
      parts: [{ text: userInput }],
    });

    const chatSession = model.startChat({
      generationConfig,
      history: chatHistory,
    });

    const result = await chatSession.sendMessage(userInput);
    return result.response.text();
  } catch (error) {
    console.error("Error in chat:", error);
    return "An error occurred during the chat."; // Or a more user-friendly message
  } finally {
    // Clean up uploaded files after they've been sent to Gemini.
    if(uploadedFiles){
        uploadedFiles.forEach(file => {
            fs.unlinkSync(file.path);
        });
    }
  }
}


app.post('/api/chat', upload.array('files'), async (req, res) => {
    try {
      const userInput = req.body.message;
      const uploadedFiles = req.files;
      const response = await runChat(userInput, uploadedFiles);
      res.json({ response });
    } catch (error) {
      console.error("API Error:", error);
      res.status(500).json({ error: "An error occurred." }); // Send an error response
    }
  });

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});