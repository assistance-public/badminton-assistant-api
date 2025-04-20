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
import { nanoid } from 'nanoid';
import { ENUM_PAYMENT_STATUS } from '../constants/index.js';
import { generateCode } from '../utils/index.js';

const prisma = new PrismaClient();
const router = Router();

router.post('/attendance', auth.required, async (req, res, next) => {
  const status = req.body.status;
  const matchId = _.get(req.extendParams, 'matchId', 0);
  const userId = _.get(req.user, 'id', 0);

  if (!status || !matchId || !userId) {
    return res.status(400).send('invalid data');
  }

  const attendance = await prisma.tbl_attendance.findFirst({
    where: {
      user_id: Number(userId),
      match_id: Number(matchId),
    },
  });
  if (!attendance) {
    // create new
    await prisma.tbl_attendance.create({
      data: {
        attend_status: status,
        created_at: new Date(),
        created_by: 'system',
        code: generateCode(), // unique, dùng cho payment
        payment_status: ENUM_PAYMENT_STATUS.PENDING,
        total_amount: 0,
        tbl_user: {
          connect: { id: Number(userId) },
        },
        tbl_match: {
          connect: { id: Number(matchId) },
        },
      },
    });
  } else {
    await prisma.tbl_attendance.update({
      where: {
        id: attendance.id,
      },
      data: {
        attend_status: status,
        updated_at: new Date(),
        updated_by: 'system',
      },
    });
  }
  return res.json({ success: true });
});

export default router;
