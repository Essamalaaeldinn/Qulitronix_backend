import axios from "axios";
import FormData from "form-data"; // Install using: npm install form-data
import fetch from "node-fetch"; // Install using: npm install node-fetch
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const API_URL = process.env.API_URL;

// Function to download an image from Cloudinary and save temporarily
const downloadImage = async (url, path) => {
  const response = await fetch(url);
  const buffer = await response.buffer();
  fs.writeFileSync(path, buffer);
};

// Function to send images to the detection API
export const detectDefects = async (imageUrls) => {
  try {
    if (!API_URL) {
      throw new Error("API_URL is not defined in environment variables");
    }

    console.log("🔹 Downloading images before sending to detection API...");

    const tempPaths = await Promise.all(
      imageUrls.map(async (url, index) => {
        const tempPath = `temp_image_${index}.jpg`;
        await downloadImage(url, tempPath);
        return tempPath;
      })
    );

    console.log("🔹 Images downloaded, preparing request...");

    const formData = new FormData();
    tempPaths.forEach((path, index) => {
      formData.append("images", fs.createReadStream(path));
    });

    const response = await axios.post(API_URL, formData, {
      headers: { 
        ...formData.getHeaders(), // Set correct headers
      },
    });

    console.log("✅ Detection API Response:", response.data);

    // Clean up temp files
    tempPaths.forEach((path) => fs.unlinkSync(path));

    return response.data;
  } catch (error) {
    console.error("❌ Error calling the detection API:", error.response?.data || error.message);
    throw new Error("Detection API request failed");
  }
};
