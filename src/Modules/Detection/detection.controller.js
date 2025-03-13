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

// 🔹 Derive API Base URL safely
const API_URL = process.env.API_URL || "";
const API_BASE_URL = API_URL.includes("/batch-predict")
  ? API_URL.split("/batch-predict")[0]
  : API_URL; // Ensure it works even if `/batch-predict` is missing

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
    folder: "pcb-defects",
    format: async () => "png", // Convert all images to PNG
    public_id: (req, file) => file.originalname.split(".")[0],
  },
});

const upload = multer({ storage });

// Apply authentication only to secured routes
detectionController.use(errorHandler(authenticationMiddleware()));

// 🟢 POST: Upload Images for Defect Detection
detectionController.post(
  "/upload",
  authenticationMiddleware(),
  upload.array("images"),
  errorHandler(async (req, res) => {
    try {
      console.log("✅ Files received:", req.files);

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No images uploaded" });
      }

      // 🔹 Ensure Cloudinary uploaded all images
      const imageUrls = req.files.map((file) => file.path);
      console.log("✅ Cloudinary URLs:", imageUrls);

      if (imageUrls.length !== req.files.length) {
        return res
          .status(500)
          .json({ message: "Some files failed to upload to Cloudinary" });
      }

      // 🔹 Call detectDefects and Log API URL
      console.log("🔹 Calling detection API:", API_URL);
      const detectionResults = await detectDefects(imageUrls);

      if (!detectionResults || !detectionResults.batch_results) {
        return res
          .status(500)
          .json({ message: "Detection API returned an invalid response" });
      }

      console.log("✅ Detection API Response:", detectionResults);

      // 🔹 Store detection results in MongoDB
      const savedResults = await Promise.all(
        detectionResults.batch_results.map(async (result) => {
          if (!result.error) {
            return await DetectionResult.create({
              userId: req.user._id, // Store the user ID
              ...result,
              heatmap_url: result.heatmap_url
                ? `${API_BASE_URL}${result.heatmap_url}`
                : undefined,
              annotated_image_url: result.annotated_image_url
                ? `${API_BASE_URL}${result.annotated_image_url}`
                : undefined,
            });
          }
        })
      );

      return res.status(200).json({
        message: "Detection completed and results stored.",
        results: savedResults.filter(Boolean),
      });
    } catch (error) {
      console.error("❌ Error processing images:", error.message);
      return res
        .status(500)
        .json({ message: "Error processing images", error: error.message });
    }
  })
);

// 🟢 GET Detection Results
detectionController.get(
  "/results",
  authenticationMiddleware(),
  errorHandler(async (req, res) => {
    try {
      const userId = req.user._id; // Get user ID from the authenticated request
      const results = await DetectionResult.find({ userId }).sort({ createdAt: -1 });

      const updatedResults = results.map((result) => ({
        ...result.toObject(),
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
        message: "User-specific detection results retrieved",
        results: updatedResults,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Error fetching results", error: error.message });
    }
  })
);


// 🟢 GET Summary of Defect Analysis
detectionController.get(
  "/summary",
  errorHandler(async (req, res) => {
    try {
      const results = await DetectionResult.find();
      let defectCounts = {};
      let defectivePCBs = 0;
      let goodPCBs = 0;

      results.forEach((result) => {
        if (result.predictions.length > 0) {
          defectivePCBs++;
          result.predictions.forEach((defect) => {
            defectCounts[defect.class_name] =
              (defectCounts[defect.class_name] || 0) + 1;
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

      const recentDefects = results.slice(-3).map((result, index) => ({
        pcb_id: `PCB #${index + 1}`,
        defects: result.predictions.map((p) => p.class_name),
        image_url: result.image_url,
        heatmap_url: result.heatmap_url?.startsWith("http")
          ? result.heatmap_url
          : `${API_BASE_URL}${result.heatmap_url}`,
        annotated_image_url: result.annotated_image_url?.startsWith("http")
          ? result.annotated_image_url
          : `${API_BASE_URL}${result.annotated_image_url}`,
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
      return res
        .status(500)
        .json({ message: "Error generating summary", error: error.message });
    }
  })
);

export default detectionController;
