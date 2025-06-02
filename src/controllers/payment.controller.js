import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import _ from 'lodash';
import { auth } from '../middlewares/auth.js';
import PayOS from '@payos/node';
import { ENUM_PAYMENT_STATUS } from '../constants/index.js';
import { sendEmail } from './send-mail.controller.js';
import {
  genToken,
  getRandomNumberByLength,
  numberWithCommas,
} from '../utils/index.js';

const prisma = new PrismaClient();
const router = Router();

router.post('/payos/webhook', auth.required, async (req, res, next) => {
  console.log(req.body);
  const payos = new PayOS(
    process.env.PAYOS_CLIENT_ID,
    process.env.PAYOS_API_KEY,
    process.env.PAYOS_CHECKSUM_KEY,
    process.env.PAYOS_PARTNER_CODE,
  );
  const paymentData = payos.verifyPaymentWebhookData(req.body);
  await prisma.tbl_webhooks.create({
    data: {
      order_code: paymentData.orderCode,
      amount: paymentData.amount,
      account_number: paymentData.accountNumber,
      meta_data: req.body,
      created_at: new Date(),
      created_by: 'payos',
    },
  });
  const { orderCode } = paymentData;
  const attendance = await prisma.tbl_attendance.findFirst({
    where: {
      code: Number(orderCode),
    },
    include: {
      tbl_user: true,
      tbl_match: true,
    },
  });
  if (!attendance) {
    return res.json({ success: false });
  }
  // update status
  await prisma.tbl_attendance.update({
    where: {
      id: attendance.id,
    },
    data: {
      payment_status: ENUM_PAYMENT_STATUS.PAID,
      updated_at: new Date(),
      updated_by: 'payos',
    },
  });

  await sendEmail({
    email: attendance.tbl_user.email,
    subject: `Đã thanh toán tiền cầu lông ${numberWithCommas(
      paymentData.amount,
    )} thành công`,
    templateId: process.env.TEMPLATE_ID_THANK_YOU_PAYMENT,
    params: {
      userName: attendance.tbl_user.name,
      amountPaid: numberWithCommas(paymentData.amount),
    },
  });

  const hostUser = await prisma.tbl_user.findFirst({
    where: {
      id: attendance.tbl_match.host_user,
    },
  });

  await sendEmail({
    email: hostUser.email,
    subject: `${attendance.tbl_user.mail}(${
      attendance.tbl_user.name
    }) Đã thanh toán tiền cầu lông ${numberWithCommas(
      paymentData.amount,
    )} thành công`,
    templateId: process.env.TEMPLATE_ID_NOTI_PAYMENT,
    params: {
      userName: attendance.tbl_user.name,
      amountPaid: numberWithCommas(paymentData.amount),
    },
  });

  return res.json({ success: true });
});

export default router;
