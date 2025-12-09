import { Router } from 'express';
import { translateController } from './controllers';
import { validateTranslationRequest } from './validators';

export const translationRouter = Router();

/**
 * @route POST /api/ai/translation/translate
 * @desc 翻译内容
 * @access public
 */
translationRouter.post('/translate', validateTranslationRequest, translateController);