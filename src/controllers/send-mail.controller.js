import PayOS from '@payos/node';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData.js';
import weekday from 'dayjs/plugin/weekday.js';
import { Router } from 'express';
import _ from 'lodash';
import { ENUM_PAYMENT_STATUS } from '../constants/index.js';
import { auth } from '../middlewares/auth.js';
import {
  genToken,
  getRandomNumberByLength,
  numberWithCommas,
} from '../utils/index.js';
import 'dayjs/locale/vi.js';

dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.locale('vi');

/**
 * Sends an email using the Brevo API.
 * @param {string} email - The recipient's email address.
 * @param {string} subject - The subject of the email.
 * @param {string} link - The link to include in the email.
 * @param {string} templateId - The template ID for the email.
 */
export const sendEmail = async ({ email, subject, params, templateId }) => {
  const emailData = {
    // sender: {
    //   email: 'no-reply@hieunt.org',
    // },
    subject: subject,
    templateId: Number(templateId),
    to: [
      {
        email: email,
      },
    ],
    params: params,
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
  const activeMatch = await prisma.tbl_match.findFirst({
    where: {
      id: matchId,
      start_date: {
        gte: now, // start_date >= now
      },
      end_date: {
        gte: now, // end_date >= now
      },
    },
  });
  if (!activeMatch) {
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
      await handleSendMailInviteMatchToUser({ user, match: activeMatch });
    }),
  );
  return res.json({ success: true });
});

router.post(
  '/send-mail/invite-match/:matchId/:userId',
  async (req, res, next) => {
    const matchId = req.params.matchId;
    const userId = req.params.userId;
    if (!matchId || !userId) {
      return res.status(400).send('invalid data');
    }

    const now = new Date();

    const activeMatch = await prisma.tbl_match.findFirst({
      where: {
        id: matchId,
        start_date: {
          gte: now, // start_date >= now
        },
        end_date: {
          gte: now, // end_date >= now
        },
      },
    });
    if (!activeMatch) {
      return res
        .status(400)
        .send('Chỉ được gửi mail khi trận đấu chưa bắt đầu');
    }
    const user = await prisma.tbl_user.findFirst({
      where: {
        status: 'activated',
        id: Number(userId),
      },
    });

    if (!user) {
      return res.status(400).send('user not found');
    }
    await handleSendMailInviteMatchToUser({ user, match: activeMatch });

    return res.json({ success: true });
  },
);

router.post(
  '/send-mail/payment/:matchId',
  auth.required,
  async (req, res, next) => {
    try {
      const matchId = req.params.matchId;
      if (!matchId) {
        return res.json(400).send('invalid data');
      }

      const attendances = await prisma.tbl_attendance.findMany({
        where: {
          match_id: Number(matchId),
        },
        include: {
          tbl_match: true,
          tbl_user: true,
        },
      });
      if (!attendances.length) {
        return res.json(400).send('không tìm thấy user tham gia trận hôm đó');
      }

      const attendancesNotPayment = attendances.filter(
        (item) => item.payment_status !== ENUM_PAYMENT_STATUS.PAID,
      );
      if (!attendancesNotPayment.length) {
        return res.json(400).send('Tất cả mọi người đều trả tiền rồi');
      }
      for (const attendance of attendancesNotPayment) {
        await handleProcessPaymentPerAttendance({
          attendance,
          matchId,
          listAttendance: attendancesNotPayment,
        });
      }

      return res.json({ success: true });
    } catch (error) {
      next(error);
      return res.json({ success: false });
    }
  },
);

const handleSendMailInviteMatchToUser = async ({ user, match }) => {
  const payload = {
    userId: user.id,
    extendParams: {
      matchId: match.id,
    },
  };
  const token = genToken(payload);
  const webUrl = `${process.env.WEB_URL_INVITE_MATCH}?token=${token}`;
  console.log(webUrl);

  try {
    await sendEmail({
      email: user.email,
      params: {
        userName: user.name,
        address: match.location,
        startDate: dayjs(match.start_date).format('dddd, DD/MM/YYYY HH:mm A'),
        link: webUrl,
      },
      templateId: process.env.TEMPLATE_ID_INVITE_MATCH,
      subject: `🔥 ${user.name} ơi, Lotus Badminton gọi tên bạn ra sân rồi đóooo 🏸💥`,
    });
  } catch (error) {
    console.error('Error sending email to', user.email, ':', error);
  }
};

const handleProcessPaymentPerAttendance = async ({
  attendance,
  matchId,
  listAttendance,
}) => {
  //process payment
  let personalExpense = 0;
  let totalAmount = attendance.total_amount;
  const listCostByUser = await prisma.tbl_personal_expense.findMany({
    where: {
      user_id: Number(attendance.user_id),
      match_id: Number(matchId),
    },
    include: {
      tbl_product: true, // 👈 Join sang bảng user
      tbl_user: true,
    },
  });
  const costSharingPerAttendance = Math.ceil(
    Number(attendance.tbl_match.cost_sharing) / Number(listAttendance.length),
  );

  if (listCostByUser.length) {
    // loop qua từng product để cộng lại xem đã ún, ăn những gì
    for (const cost of listCostByUser) {
      personalExpense +=
        Number(cost.quantity) * Number(cost.tbl_product.amount);
    }
  }

  // cộng thêm chi phí sân, cầu ~ cost-sharing chia trên đầu người tham gia

  totalAmount = personalExpense + costSharingPerAttendance;

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
    await sendEmail({
      email: attendance.tbl_user.email,
      params: {
        checkoutUrl: paymentLink.checkoutUrl,
        userName: attendance.tbl_user.name,
        totalAttendances: listAttendance.length,
        costSharing: numberWithCommas(costSharingPerAttendance),
        productDetail: _.join(
          listCostByUser.map((item) => {
            return `${item.tbl_product.name}(SL: ${
              item.quantity
            }): ${numberWithCommas(item.tbl_product.amount)}đ`;
          }),
          ',',
        ),
        totalAmount: numberWithCommas(totalAmount),
        startDate: dayjs(attendance.tbl_match.start_date).format(
          'dddd, DD/MM/YYYY',
        ),
      },
      templateId: process.env.TEMPLATE_ID_PAYMENT_MATCH,
      subject: `💸 Thanh toán nhẹ cho buổi đánh cầu ${dayjs(
        attendance.tbl_match.start_date,
      ).format('dddd')} của bạn nè 😎🏸`,
    });
  } catch (error) {
    console.error(
      'Error sending email to',
      attendance.tbl_user.email,
      ':',
      error,
    );
  }
  //#endregion
};

export default router;
