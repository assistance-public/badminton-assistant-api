import { Router } from 'express';
import sendMailController from '../controllers/send-mail.controller.js';
import matchController from '../controllers/match.controller.js';
import userController from '../controllers/user.controller.js';
import attendanceController from '../controllers/attendance.controller.js';

const api = Router()
  .use(sendMailController)
  .use(matchController)
  .use(attendanceController)
  .use(userController);

export default Router().use('/api', api);
