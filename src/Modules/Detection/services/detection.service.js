// services/detectionService.js OR controllers/detectionController.js

import axios from "axios";
import FormData from "form-data";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const API_URL = process.env.API_URL; // Ensure this is set in your .env

// Step 1: Modify `downloadImage` to Use Buffers
const downloadImage = async (url) => {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer(); // Store as buffer in memory
  return Buffer.from(buffer); // Convert to Buffer
};

// Step 2: Modify `detectDefects` to Use Buffers
export const detectDefects = async (imageUrls) => {
  try {
    if (!API_URL) {
      throw new Error("API_URL is not defined in environment variables");
    }

    console.log("🔹 Downloading images in memory before sending to detection API...");

    const formData = new FormData();

    await Promise.all(
      imageUrls.map(async (url, index) => {
        const imageBuffer = await downloadImage(url);
        formData.append("images", imageBuffer, { filename: `image_${index}.jpg` });
      })
    );

    console.log("🔹 Images added to FormData, preparing request...");

    const response = await axios.post(API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    console.log("✅ Detection API Response:", response.data);

    return response.data;
  } catch (error) {
    console.error("❌ Error calling the detection API:", error.response?.data || error.message);
    throw new Error("Detection API request failed");
  }
};
