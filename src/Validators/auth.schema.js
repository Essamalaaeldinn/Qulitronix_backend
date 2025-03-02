import Joi from "joi"



// validate() only works with => Joi.object({}) 

export const signUpSchema = {
    body: Joi.object({
        username: Joi.string().alphanum().messages({
            'string.alphanum': 'Username must be alphanumeric should contain only a-z , A-Z , 0-9'
        }),
        email: Joi.string().email({
            tlds:{
                allow: ['com', 'net'] ,
                // deny: ['yahoo']
            },
            // minDomainSegments: 2,
            maxDomainSegments: 2        // gmail.com
        }),
        password: Joi.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*])[A-Za-z\d@$!%*]{8,}$/ ),
        confirmPassword: Joi.string().valid(Joi.ref('password')),
        phone: Joi.string(),
    })
    .options({presence: 'required'})      // all keys values are required 
}



export const signInSchema = {
    body: Joi.object({
        email: Joi.string().email({
            tlds:{
                allow: ['com', 'net'] ,
            },
            maxDomainSegments: 2        
        }),
        password: Joi.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*])[A-Za-z\d@$!%*]{8,}$/ )
    })
    .options({presence: 'required'})
}


export const forgetPasswordSchema = {
    body: Joi.object({
        email: Joi.string().email({
            tlds:{
                allow: ['com', 'net'] ,
            },
            maxDomainSegments: 2        
        })
    })
    .options({presence: 'required'})
}



export const resetPasswordSchema = {
    body: Joi.object({
        email: Joi.string().email({
            tlds:{
                allow: ['com', 'net'] ,
            },
            maxDomainSegments: 2        
        }),
        password: Joi.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*])[A-Za-z\d@$!%*]{8,}$/ ),
        confirmPassword: Joi.string().valid(Joi.ref('password')),
        otp: Joi.number()
    })
    .options({presence: 'required'})
}