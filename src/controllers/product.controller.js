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

router.get('/product', auth.optional, async (req, res, next) => {
  const products = await prisma.tbl_product.findMany({});
  return res.json({ products });
});

export default router;
