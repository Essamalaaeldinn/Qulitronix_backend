import jwt from 'jsonwebtoken'
import BlackListTokens from '../DB/models/black-list-tokens.model.js'
import User from '../DB/models/users.model.js'




//  use this form of middleware if a parameter is needed, a normal function with parameter and should return another function with (req, res, next) so the router can use it, should execute() it when calling it in the router

export const authenticationMiddleware = () => {
    return async (req, res, next) =>  {
        const accesstoken = req.headers.authorization?.split(" ")[1] || req.headers.accesstoken;
        
        if (!accesstoken) {
            return res.status(400).json({ message: "No access token found, please login" });
        }

        try {
            const decodedData = jwt.verify(accesstoken, process.env.JWT_SECRET_LOGIN);

            const isTokenBlackListed = await BlackListTokens.findOne({ tokenId: decodedData.jti });
            if (isTokenBlackListed) {
                return res.status(401).json({ message: "Token is blacklisted, please login" });
            }

            const user = await User.findById(decodedData._id, "-password -__v");
            if (!user) {
                return res.status(401).json({ message: "User not found, please sign up" });
            }

            req.authUser = {
                ...user._doc,
                token: {
                    tokenId: decodedData.jti,
                    expiryDate: decodedData.exp,
                },
            };

            next();
        } catch (error) {
            return res.status(401).json({ message: "Invalid or expired access token" });
        }
    };
};



// middleware to verify refresh token and send it with the req object
export const checkRefreshToken = () => {
    return async (req, res, next) => {
        
        const {refreshtoken} = req.headers
        if(!refreshtoken) return res.status(401).json({message: 'Refresh token required, please login'})
        
        const decodedData = jwt.verify(refreshtoken, process.env.JWT_SECRET_REFRESH)

        const isTokenBlackListed = await BlackListTokens.findOne({tokenId: decodedData.jti})
        if(isTokenBlackListed){
            return res.status(401).json({message: 'Refresh token is blacklisted, please login'})
        }

        // send refresh token with the req object
        req.refreshtoken = {
            tokenId: decodedData.jti, 
            expiryDate: decodedData.exp
        }
        console.log(req.refreshtoken);
        
        next()
    }
} 


// allowedRoles = ['user', 'admin'] >>> array of allowed roles for a specific router send as parameter
// authUser role = 'user' 
// the role is sent with the user data from the auth mw to check if the role is allowed to perform this action or not

export const authorizationMiddleware = (allowedRoles = []) => {
    return async (req, res, next) => {
        
        const {role} = req.authUser

        const isRoleAllowed = allowedRoles.includes(role)
        console.log({role, allowedRoles, isRoleAllowed});
        
        if(!isRoleAllowed){
            return res.status(401).json({message: 'Unauthorized role'})
        }
        next()
    }
} 

