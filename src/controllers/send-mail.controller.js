import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import _ from 'lodash';
import { genToken, getRandomNumberByLength } from '../utils/index.js';
import { auth } from '../middlewares/auth.js';
import { ENUM_PAYMENT_STATUS } from '../constants/index.js';
import PayOS from '@payos/node';
import axios from 'axios';

/**
 * Sends an email using the Brevo API.
 * @param {string} email - The recipient's email address.
 * @param {string} subject - The subject of the email.
 * @param {string} link - The link to include in the email.
 * @param {string} templateId - The template ID for the email.
 */
const sendEmail = async (email, subject, link, templateId) => {
  const emailData = {
    sender: {
      email: 'no-reply@hieunt.org',
    },
    subject: subject,
    templateId: templateId,
    to: [
      {
        email: email,
      },
    ],
    params: {
      url: link,
    },
  };

  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', emailData, {
      headers: {
        accept: 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
    });
    console.log(`Email sent to ${email}`);
  } catch (error) {
    console.error('Error sending email to', email, ':', error);
    throw error; // Re-throw the error to handle it in the calling function
  }
};

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
    return res.status(400).send('Chỉ được gửi mail khi trận đấu chưa bắt đầu');
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
    users.map(async (user) => {
      const payload = {
        userId: user.id,
        extendParams: {
          matchId,
        },
      };
      const token = genToken(payload);
      const webUrl = `${process.env.WEB_URL_INVITE_MATCH}?token=${token}`;
      console.log(webUrl);

      try {
        await sendEmail(user.email, 'Vote lịch đánh cầu đê!', webUrl, 7);
      } catch (error) {
        console.error('Error sending email to', user.email, ':', error);
      }
    }),
  );
  return res.json({ success: true });
});

router.post(
  '/send-mail/payment/:matchId',
  auth.required,
  async (req, res, next) => {
    try {
      const matchId = req.params.matchId;
      const userId = req.user.id;
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

      //#region gen QR
      const payos = new PayOS(
        process.env.PAYOS_CLIENT_ID,
        process.env.PAYOS_API_KEY,
        process.env.PAYOS_CHECKSUM_KEY,
        process.env.PAYOS_PARTNER_CODE,
      );
      let processGenOrderCode = true;
      let countError = 0;
      const MAX_ERROR_GEN_ORDER_CODE = 5;
      let paymentLink = _.get(attendance, 'params.paymentLink');

      if (!paymentLink) {
        while (processGenOrderCode) {
          try {
            const newOrderCode = getRandomNumberByLength();
            const requestData = {
              orderCode: newOrderCode,
              amount: totalAmount,
              description: 'badminton lotus cost',
              cancelUrl: 'https://hieunt.org',
              returnUrl: 'https://hieunt.org',
            };
            paymentLink = await payos.createPaymentLink(requestData);
            console.log(paymentLink);

            processGenOrderCode = false;
          } catch (error) {
            ++countError;
            if (countError == MAX_ERROR_GEN_ORDER_CODE) {
              processGenOrderCode = false;
              throw new Error(error);
            }
            console.log(error);
          }
        }
      }

      if (_.isEmpty(paymentLink)) {
        throw new Error('Không tạo được paymentLink');
      }

      console.log(paymentLink);

      await prisma.tbl_attendance.update({
        where: {
          id: attendance.id,
        },
        data: {
          total_amount: Number(totalAmount),
          params: {
            paymentLink,
          },
          code: paymentLink?.orderCode,
          updated_at: new Date(),
          updated_by: 'system',
        },
      });
      //#endregion

      //#region send mail
      try {
        await sendEmail(
          attendance.tbl_match.email,
          'Trả tiền cầu đê!',
          paymentLink,
          8,
        );
      } catch (error) {
        console.error(
          'Error sending email to',
          attendance.tbl_match.email,
          ':',
          error,
        );
      }

      //#endregion

      return res.json({ success: true });
    } catch (error) {
      next(error);
      return res.json({ success: false });
    }
  },
);

export default router;
