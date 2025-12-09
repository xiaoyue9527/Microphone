import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';

// 翻译请求验证模式
const translationSchema = Joi.object({
    type: Joi.string().valid('product_to_tech', 'tech_to_product').required()
        .messages({
            'any.only': '翻译类型必须是 product_to_tech 或 tech_to_product',
            'any.required': '翻译类型是必填项'
        }),
    content: Joi.string().min(1).max(5000).required()
        .messages({
            'string.min': '翻译内容不能为空',
            'string.max': '翻译内容不能超过5000个字符',
            'any.required': '翻译内容是必填项'
        }),
    options: Joi.object({
        temperature: Joi.number().min(0).max(1).default(0.7),
        maxTokens: Joi.number().min(1024).max(32769),
    }).optional()
});

export const validateTranslationRequest = (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = translationSchema.validate(req.body);

    if (error) {
        return res.status(400).json({
            success: false,
            error: error.details[0].message
        });
    }

    // 将验证后的值赋回req.body
    req.body = value;
    next();
};