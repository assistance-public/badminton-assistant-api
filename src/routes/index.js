import { Router } from 'express';
import sendMailController from '../controllers/send-mail.controller.js';
import matchController from '../controllers/match.controller.js';

const api = Router().use(sendMailController).use(matchController);

export default Router().use('/api', api);
