import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import _ from 'lodash';
import { genToken } from '../utils/index.js';
import { auth } from '../middlewares/auth.js';
import { ENUM_PAYMENT_STATUS } from '../constants/index.js';
import PayOS from '@payos/node';

const prisma = new PrismaClient();
const router = Router();

router.post('/send-mail/invite-match/:matchId', async (req, res, next) => {
  const matchId = req.params.matchId;
  if (!matchId) {
    return res.status(400).send('matchId not found');
  }
  // find active match
  const now = new Date();
  const activeMatchById = await prisma.tbl_match.findFirst({
    where: {
      start_date: {
        gte: now, // start_date >= now
      },
      end_date: {
        gte: now, // end_date >= now
      },
    },
  });
  if (!activeMatchById) {
    return res.status(400).send('active match not found');
  }

  const users = await prisma.tbl_user.findMany({
    where: {
      status: 'activated',
    },
  });
  if (_.isEmpty(users)) {
    return res.status(404).send('users not found');
  }
  // send-mail
  await Promise.all(
    users.map((user) => {
      const payload = {
        userId: user.id,
        extendParams: {
          matchId,
        },
      };
      const token = genToken(payload);
      const webUrl = `${process.env.WEB_URL_INVITE_MATCH}?token=${token}`;
      // TODO: process send mail to each user

      console.log(webUrl);
    }),
  );
  return res.json({ success: true });
});

router.post(
  '/send-mail/payment/:matchId/:userId',
  auth.required,
  async (req, res, next) => {
    try {
      const matchId = req.params.matchId;
      const userId = req.params.userId;
      if (!matchId || !userId) {
        return res.json(400).send('invalid data');
      }

      const attendance = await prisma.tbl_attendance.findFirst({
        where: {
          user_id: Number(userId),
          match_id: Number(matchId),
        },
        include: {
          tbl_match: true,
        },
      });
      if (!attendance) {
        return res.json(400).send('user này không tham gia trận hôm đó');
      }
      if (attendance.payment_status === ENUM_PAYMENT_STATUS.PAID) {
        return res.send('người này đã trả tiền cho bạn rồi');
      }

      //process payment
      let personalExpense = 0;
      let totalAmount = attendance.total_amount;
      if (!totalAmount) {
        const listCostByUser = await prisma.tbl_personal_expense.findMany({
          where: {
            user_id: Number(userId),
            match_id: Number(matchId),
          },
          include: {
            tbl_product: true, // 👈 Join sang bảng user
          },
        });
        if (listCostByUser.length) {
          // loop qua từng product để cộng lại xem đã ún, ăn những gì
          for (const cost of listCostByUser) {
            personalExpense +=
              Number(cost.quantity) * Number(cost.tbl_product.amount);
          }
        }

        // cộng thêm chi phí sân, cầu ~ cost-sharing chia trên đầu người tham gia
        const countAttendances = await prisma.tbl_attendance.count({
          where: {
            match_id: Number(matchId),
          },
        });
        totalAmount =
          personalExpense +
          Math.ceil(
            Number(attendance.tbl_match.cost_sharing) /
              Number(countAttendances),
          );
        console.log(totalAmount);
        // update db
        await prisma.tbl_attendance.update({
          where: {
            id: attendance.id,
          },
          data: {
            total_amount: Number(totalAmount),
            updated_at: new Date(),
            updated_by: 'system',
          },
        });
      }

      // process send QR payment
      const payos = new PayOS(
        process.env.PAYOS_CLIENT_ID,
        process.env.PAYOS_API_KEY,
        process.env.PAYOS_CHECKSUM_KEY,
        process.env.PAYOS_PARTNER_CODE,
      );
      const requestData = {
        orderCode: 5643,
        amount: totalAmount,
        description: 'badminton lotus cost',
        cancelUrl: 'https://hieunt.org',
        returnUrl: 'https://hieunt.org',
      };
      const paymentLink = await payos.createPaymentLink(requestData);
      console.log(paymentLink);
      return res.json({ success: true });
    } catch (error) {
      next(error);
      return res.json({success: false});
    }
  },
);

export default router;
