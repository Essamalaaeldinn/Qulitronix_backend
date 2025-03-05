import { Router } from "express";
import multer from "multer";
import { detectDefects } from "./services/detection.service.js";
import DetectionResult from "../../DB/models/detectionResult.model.js";
import { authenticationMiddleware } from "../../Middleware/authentication.middleware.js";
import { errorHandler } from "../../Middleware/error-handler.middleware.js";
import cloudinary from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import dotenv from "dotenv";

dotenv.config();

const detectionController = Router();

// 🔹 Derive the base URL from API_URL (remove /batch-predict path)
const API_URL = process.env.API_URL; // e.g., http://ec2-51-20-245-170.eu-north-1.compute.amazonaws.com/batch-predict
const API_BASE_URL = API_URL.split("/batch-predict")[0]; // e.g., http://ec2-51-20-245-170.eu-north-1.compute.amazonaws.com

// 🔹 Configure Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 🔹 Setup Multer with Cloudinary Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary.v2,
  params: {
    folder: "pcb-defects", // Cloudinary folder where images will be stored
    format: async (req, file) => "png", // Convert all images to PNG
    public_id: (req, file) => file.originalname.split(".")[0], // Keep original file name
  },
});

const upload = multer({ storage });

// Apply authentication only to secured routes
detectionController.use(errorHandler(authenticationMiddleware()));

// 🟢 POST: Upload Images for Defect Detection
detectionController.post(
  "/upload",
  upload.array("images"),
  errorHandler(async (req, res) => {
    try {
      console.log("Files received:", req.files); // ✅ Debugging step

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No images uploaded" });
      }

      // 🔹 Ensure Cloudinary uploaded all images
      const imageUrls = req.files.map((file) => file.path);
      console.log("Cloudinary URLs:", imageUrls); // ✅ Debugging step

      if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length !== req.files.length) {
        return res.status(500).json({ message: "Some files failed to upload to Cloudinary" });
      }

      // 🔹 Pass Cloudinary URLs to the detection model
      const detectionResults = await detectDefects(imageUrls);

      if (!detectionResults || !detectionResults.batch_results) {
        return res.status(500).json({ message: "Detection API returned an invalid response" });
      }

      console.log("Detection API Response:", detectionResults); // ✅ Debugging step

      // 🔹 Store detection results in MongoDB with full URLs
      const savedResults = await Promise.all(
        detectionResults.batch_results.map(async (result) => {
          if (!result.error) {
            // Prepend the base URL to heatmap_url and annotated_image_url before saving
            const updatedResult = {
              ...result,
              heatmap_url: result.heatmap_url ? `${API_BASE_URL}${result.heatmap_url}` : undefined,
              annotated_image_url: result.annotated_image_url
                ? `${API_BASE_URL}${result.annotated_image_url}`
                : undefined,
            };
            return await DetectionResult.create(updatedResult);
          }
        })
      );

      return res.status(200).json({
        message: "Detection completed and results stored.",
        results: savedResults.filter(Boolean),
      });
    } catch (error) {
      console.error("Error processing images:", error.message); // ✅ Debugging step
      return res.status(500).json({ message: "Error processing images", error: error.message });
    }
  })
);

// 🟢 GET Detection Results
detectionController.get(
  "/results",
  errorHandler(async (req, res) => {
    try {
      const results = await DetectionResult.find().sort({ createdAt: -1 });

      // 🔹 Ensure full URLs are returned (in case they weren't saved with full URLs previously)
      const updatedResults = results.map((result) => {
        const resultObj = result.toObject();
        return {
          ...resultObj,
          heatmap_url: resultObj.heatmap_url?.startsWith("http")
            ? resultObj.heatmap_url
            : resultObj.heatmap_url
            ? `${API_BASE_URL}${resultObj.heatmap_url}`
            : undefined,
          annotated_image_url: resultObj.annotated_image_url?.startsWith("http")
            ? resultObj.annotated_image_url
            : resultObj.annotated_image_url
            ? `${API_BASE_URL}${resultObj.annotated_image_url}`
            : undefined,
        };
      });

      return res.status(200).json({
        message: "Detection results retrieved",
        results: updatedResults,
      });
    } catch (error) {
      return res.status(500).json({ message: "Error fetching results", error: error.message });
    }
  })
);

// 🟢 GET Summary of Defect Analysis
detectionController.get(
  "/summary",
  errorHandler(async (req, res) => {
    try {
      const results = await DetectionResult.find();

      // Calculate defect statistics
      let defectCounts = {};
      let defectivePCBs = 0;
      let goodPCBs = 0;

      results.forEach((result) => {
        if (result.predictions.length > 0) {
          defectivePCBs++;
          result.predictions.forEach((defect) => {
            defectCounts[defect.class_name] = (defectCounts[defect.class_name] || 0) + 1;
          });
        } else {
          goodPCBs++;
        }
      });

      const totalPCBs = goodPCBs + defectivePCBs;
      const defectPercentages = Object.keys(defectCounts).map((key) => ({
        name: key,
        percentage: ((defectCounts[key] / (totalPCBs || 1)) * 100).toFixed(2),
      }));

      // 🔹 Ensure recent_defects includes full URLs
      const recentDefects = results.slice(-3).map((result, index) => ({
        pcb_id: `PCB #${index + 1}`,
        defects: result.predictions.map((p) => p.class_name),
        image_url: result.image_url,
        heatmap_url: result.heatmap_url?.startsWith("http")
          ? result.heatmap_url
          : result.heatmap_url
          ? `${API_BASE_URL}${result.heatmap_url}`
          : undefined,
        annotated_image_url: result.annotated_image_url?.startsWith("http")
          ? result.annotated_image_url
          : result.annotated_image_url
          ? `${API_BASE_URL}${result.annotated_image_url}`
          : undefined,
      }));

      return res.status(200).json({
        summary: {
          defect_percentages: defectPercentages,
          defective_chart: [
            { name: "Good PCBs", value: goodPCBs },
            { name: "Defective PCBs", value: defectivePCBs },
          ],
          recent_defects: recentDefects,
        },
      });
    } catch (error) {
      return res.status(500).json({ message: "Error generating summary", error: error.message });
    }
  })
);

export default detectionController;