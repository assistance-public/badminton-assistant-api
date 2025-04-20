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

const prisma = new PrismaClient();
const router = Router();

router.get('/user', auth.required, async (req, res, next) => {
  console.log(req.user, req.extendParams);
  const userId = _.get(req.user, 'id', 0);
  const user = await prisma.tbl_user.findFirst({
    where: {
      id: Number(userId),
    },
  });
  if (!user) {
    res.status(404).send('user not found');
    return;
  }
  return res.json({ user });
});

export default router;
