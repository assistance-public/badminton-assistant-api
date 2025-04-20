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

router.get('/match', auth.required, async (req, res, next) => {
  console.log(req.user, req.extendParams);
  const matchId = _.get(req.extendParams, 'matchId', 0);
  const match = await prisma.tbl_match.findFirst({
    where: {
      id: Number(matchId),
    },
    include: {
      tbl_user: true,
    },
  });
  if (!matchId) {
    return res.status(404).send('match not found');
  }
  return res.json({ match });
});

router.get('/match/list', auth.optional, async (req, res, next) => {
  const matches = await prisma.tbl_match.findMany({
    include: {
      tbl_user: true,
    },
  });
  return res.json({ matches });
});

export default router;
