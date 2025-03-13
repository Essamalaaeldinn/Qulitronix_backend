import jwt from "jsonwebtoken";
import BlackListTokens from "../DB/models/black-list-tokens.model.js";
import User from "../DB/models/users.model.js";

// Middleware to authenticate users
export const authenticationMiddleware = () => {
  return async (req, res, next) => {
    try {
      const accesstoken =
        req.headers.authorization?.split(" ")[1] || req.headers.accesstoken;

      if (!accesstoken) {
        return res
          .status(400)
          .json({ message: "No access token found, please login" });
      }

      // Verify token
      const decodedData = jwt.verify(accesstoken, process.env.JWT_SECRET_LOGIN);

      // Check if token is blacklisted
      const isTokenBlackListed = await BlackListTokens.findOne({
        tokenId: decodedData.jti,
      });

      if (isTokenBlackListed) {
        return res
          .status(401)
          .json({ message: "Token is blacklisted, please login" });
      }

      // Find user in database
      const user = await User.findById(decodedData._id).select(
        "-password -__v"
      );

      if (!user) {
        return res
          .status(401)
          .json({ message: "User not found, please sign up" });
      }

      // Attach user data to request object
      req.authUser = {
        _id: user._id, // Ensure the user ID is accessible
        email: user.email, // Include essential user details
        token: {
          tokenId: decodedData.jti,
          expiryDate: decodedData.exp,
        },
      };

      next();
    } catch (error) {
      return res
        .status(401)
        .json({ message: "Invalid or expired access token" });
    }
  };
};

// Middleware to verify refresh token
export const checkRefreshToken = () => {
  return async (req, res, next) => {
    try {
      const { refreshtoken } = req.headers;
      if (!refreshtoken) {
        return res
          .status(401)
          .json({ message: "Refresh token required, please login" });
      }

      // Verify refresh token
      const decodedData = jwt.verify(
        refreshtoken,
        process.env.JWT_SECRET_REFRESH
      );

      // Check if token is blacklisted
      const isTokenBlackListed = await BlackListTokens.findOne({
        tokenId: decodedData.jti,
      });

      if (isTokenBlackListed) {
        return res
          .status(401)
          .json({ message: "Refresh token is blacklisted, please login" });
      }

      // Attach refresh token data to request
      req.refreshtoken = {
        tokenId: decodedData.jti,
        expiryDate: decodedData.exp,
      };

      next();
    } catch (error) {
      return res
        .status(401)
        .json({ message: "Invalid or expired refresh token" });
    }
  };
};
