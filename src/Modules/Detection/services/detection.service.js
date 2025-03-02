import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const API_URL = process.env.API_URL;

export const detectDefects = async (imagePaths) => {
  try {
    if (!API_URL) {
      throw new Error("API_URL is not defined in environment variables");
    }

    const formData = new FormData();
    imagePaths.forEach((path) => {
      formData.append("images", fs.createReadStream(path));
    });

    const response = await axios.post(API_URL, formData, {
      headers: { ...formData.getHeaders() },
    });

    return response.data;
  } catch (error) {
    console.error("Error calling the detection API:", error.message);
    throw new Error("Detection API request failed");
  }
};
