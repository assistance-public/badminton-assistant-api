import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import _ from 'lodash';
import { genToken } from '../utils/index.js';

const prisma = new PrismaClient();
const router = Router();

router.get('/send-mail/invite-match/:matchId', async (req, res, next) => {
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

export default router;
