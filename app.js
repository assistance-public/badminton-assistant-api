import express from 'express';
import routes from './src/routes/index.js';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
dotenv.config();

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(routes);

/* eslint-disable */
app.use((err, req, res, next) => {
  // @ts-ignore
  if (err && err.name === 'UnauthorizedError') {
    return res.status(401).json({
      status: 'error',
      message: 'missing authorization credentials',
    });
    // @ts-ignore
  } else if (err && err.errorCode) {
    // @ts-ignore
    res.status(err.errorCode).json(err.message);
  } else if (err) {
    res.status(500).json(err.message);
  }
});

const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Welcome to Badminton Assistant api 🚀🚀');
});

app.listen(port, () => {
  console.log(`Server listening on ${port}`);
});
