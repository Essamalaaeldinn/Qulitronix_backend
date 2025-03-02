import { Router } from "express";
import multer from "multer";
import { detectDefects } from "./services/detection.service.js";
import DetectionResult from "../../DB/models/detectionResult.model.js";
import { authenticationMiddleware } from "../../Middleware/authentication.middleware.js";
import { errorHandler } from "../../Middleware/error-handler.middleware.js";

const detectionController = Router();
const upload = multer({ dest: "uploads/" });

// Apply authentication only to secured routes
detectionController.use(errorHandler(authenticationMiddleware()));

// 🟢 POST: Upload Images for Defect Detection
detectionController.post(
  "/upload",
  upload.array("images"),
  errorHandler(async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No images uploaded" });
      }

      const imagePaths = req.files.map((file) => file.path);
      const detectionResults = await detectDefects(imagePaths);

      const savedResults = await Promise.all(
        detectionResults.batch_results.map(async (result) => {
          if (!result.error) {
            return await DetectionResult.create(result);
          }
        })
      );

      return res.status(200).json({
        message: "Detection completed and results stored.",
        results: savedResults.filter(Boolean),
      });
    } catch (error) {
      return res.status(500).json({ message: "Error processing images", error: error.message });
    }
  })
);

// 🟢 FIXED: GET Detection Results (Now Correctly Placed)
detectionController.get(
  "/results",
  errorHandler(async (req, res) => {
    try {
      const results = await DetectionResult.find().sort({ createdAt: -1 });
      return res.status(200).json({ message: "Detection results retrieved", results });
    } catch (error) {
      return res.status(500).json({ message: "Error fetching results", error: error.message });
    }
  })
);

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

      return res.status(200).json({
        summary: {
          defect_percentages: defectPercentages,
          defective_chart: [
            { name: "Good PCBs", value: goodPCBs },
            { name: "Defective PCBs", value: defectivePCBs },
          ],
          recent_defects: results.slice(-3).map((result, index) => ({
            pcb_id: `PCB #${index + 1}`,
            defects: result.predictions.map((p) => p.class_name),
          })),
        },
      });
    } catch (error) {
      return res.status(500).json({ message: "Error generating summary", error: error.message });
    }
  })
);


export default detectionController;
