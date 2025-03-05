import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_URL = process.env.API_URL;


export const detectDefects = async (imageUrls) => {
  try {
    if (!API_URL) {
      throw new Error("API_URL is not defined in environment variables");
    }

    console.log("🔹 Preparing JSON payload with image URLs...");

    // Create a JSON payload with the image URLs
    const payload = {
      images: imageUrls, // Array of URLs, e.g., ["https://res.cloudinary.com/.../image.png"]
    };

    console.log("🔹 Payload:", payload);

    const response = await axios.post(API_URL, payload, {
      headers: {
        "Content-Type": "application/json", // Set the content type to JSON
      },
    });

    console.log("✅ Detection API Response:", response.data);

    return response.data;
  } catch (error) {
    console.error("❌ Error calling the detection API:", error.response ? error.response : error.message);
    throw new Error("Detection API request failed");
  }
};