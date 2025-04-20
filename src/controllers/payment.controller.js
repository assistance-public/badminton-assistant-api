/**
 * Các api dùng để handle trận đấu
 * 1. Tạo 1 trận đấu (pending)
 * 2. Gửi lời mời tham gia trận đấu -> send mail chứa 1 token
 * 3. Xác nhận lời mời (chấp nhận, huỷ)
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import _ from 'lodash';
import { auth } from '../middlewares/auth.js';
import PayOS from '@payos/node';
import { ENUM_PAYMENT_STATUS } from '../constants/index.js';

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
  // TODO: send mail to hostUser, attendance
  return res.json({ success: true });
});

export default router;
