import { Router } from "express";
import multer from "multer";
import { detectDefects } from "./services/detection.service.js";
import DetectionResult from "../../DB/models/detectionResult.model.js";
import { authenticationMiddleware } from "../../Middleware/authentication.middleware.js";
import { errorHandler } from "../../Middleware/error-handler.middleware.js";
import cloudinary from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import dotenv from "dotenv";
import DailySummary from "../../DB/models/DailySummery.model.js";

dotenv.config();

const detectionController = Router();

const API_URL = process.env.API_URL || "";
const API_BASE_URL = API_URL.includes("/batch-predict")
  ? API_URL.split("/batch-predict")[0]
  : API_URL;

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary.v2,
  params: {
    folder: "pcb-defects",
    format: async () => "png",
    public_id: (req, file) => file.originalname.split(".")[0],
  },
});

const upload = multer({ storage });

detectionController.use(errorHandler(authenticationMiddleware()));

detectionController.post(
  "/upload",
  authenticationMiddleware(),
  upload.array("images"),
  errorHandler(async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No images uploaded" });
      }

      const imageUrls = req.files.map((file) => file.path);

      if (imageUrls.length !== req.files.length) {
        return res
          .status(500)
          .json({ message: "Some files failed to upload to Cloudinary" });
      }

      const detectionResults = await detectDefects(imageUrls);

      if (!detectionResults || !detectionResults.batch_results) {
        return res
          .status(500)
          .json({ message: "Detection API returned an invalid response" });
      }

      const savedResults = await Promise.all(
        detectionResults.batch_results.map(async (result) => {
          if (!result.error) {
            return await DetectionResult.create({
              userId: req.authUser._id,
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
      return res
        .status(500)
        .json({ message: "Error processing images", error: error.message });
    }
  })
);

detectionController.get(
  "/results",
  authenticationMiddleware(),
  errorHandler(async (req, res) => {
    try {
      const userId = req.authUser._id;
      const results = await DetectionResult.find({ userId }).sort({
        createdAt: -1,
      });

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

detectionController.get(
  "/dashboard",
  errorHandler(async (req, res) => {
    try {
      const userId = req.authUser._id;
      const results = await DetectionResult.find({ userId });

      let defectCounts = {};
      let defectivePCBs = 0;
      let goodPCBs = 0;
      let totalDefects = 0;

      results.forEach((result) => {
        if (result.predictions.length > 0) {
          defectivePCBs++;
          result.predictions.forEach((defect) => {
            defectCounts[defect.class_name] =
              (defectCounts[defect.class_name] || 0) + 1;
            totalDefects++;
          });
        } else {
          goodPCBs++;
        }
      });

      const defectPercentages = Object.entries(defectCounts).map(
        ([name, count]) => ({
          name,
          percentage: ((count / (totalDefects || 1)) * 100).toFixed(2),
        })
      );

      const recentDefects = results
        .slice(-3)
        .reverse()
        .map((result, index) => ({
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

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const rawWeeklySummary = await DailySummary.find({
        userId,
        date: { $gte: sevenDaysAgo.toISOString().split("T")[0] },
      }).sort({ date: 1 });

      const weeklySummary = rawWeeklySummary.map((entry) => {
        const dayName = new Date(entry.date).toLocaleDateString("en-US", {
          weekday: "short",
        });

        return {
          name: dayName,
          faultRate: parseFloat(entry.defective_percentage) || 0,
        };
      });

      const defectivePercentage = (
        (defectivePCBs / (goodPCBs + defectivePCBs || 1)) *
        100
      ).toFixed(2);

      await DailySummary.findOneAndUpdate(
        { userId, date: new Date().toISOString().split("T")[0] },
        { $set: { defective_percentage: defectivePercentage } },
        { upsert: true }
      );

      return res.status(200).json({
        summary: {
          defect_percentages: defectPercentages,
          defective_chart: [
            { name: "Good PCBs", value: goodPCBs },
            { name: "Defective PCBs", value: defectivePCBs },
          ],
          total_defects: totalDefects,
          recent_defects: recentDefects,
          weekly_summary: weeklySummary,
          message:
            "Dashboard data retrieved and daily summary saved successfully",
        },
      });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Error processing dashboard", error: error.message });
    }
  })
);

export default detectionController;
