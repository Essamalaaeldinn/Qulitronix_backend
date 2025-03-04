import axios from "axios";
import FormData from "form-data"; // Ensure installed: npm install form-data
import fetch from "node-fetch"; // Ensure installed: npm install node-fetch
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const API_URL = process.env.API_URL;

// Function to download an image from Cloudinary and save it temporarily
const downloadImage = async (url, path) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download image: ${url}`);
  const buffer = await response.buffer();
  fs.writeFileSync(path, buffer);
};

// Function to send images to the detection API
export const detectDefects = async (imageUrls) => {
  try {
    if (!API_URL) throw new Error("❌ API_URL is not defined in environment variables");

    console.log("🔹 Downloading images before sending to detection API...");

    // Download images locally before sending
    const tempPaths = await Promise.all(
      imageUrls.map(async (url, index) => {
        const tempPath = `temp_image_${index}.jpg`;
        await downloadImage(url, tempPath);
        return tempPath;
      })
    );

    console.log("✅ Images downloaded successfully:", tempPaths);

    // Prepare FormData
    const formData = new FormData();
    tempPaths.forEach((path, index) => {
      console.log(`🔹 Attaching file: ${path}`); // Debugging
      formData.append("images", fs.createReadStream(path));
    });

    console.log("🔹 FormData Headers:", formData.getHeaders());

    // Send request to detection API
    const response = await axios.post(API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    console.log("✅ Detection API Response:", response.data);

    // Clean up temporary image files
    tempPaths.forEach((path) => {
      if (fs.existsSync(path)) fs.unlinkSync(path);
    });

    return response.data;
  } catch (error) {
    console.error("❌ Error calling the detection API:", error.response?.data || error.message);
    throw new Error("Detection API request failed");
  }
};
