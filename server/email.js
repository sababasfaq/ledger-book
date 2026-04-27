import nodemailer from "nodemailer";

let transporter;
let fromAddr = '"Dept Expense" <no-reply@dept.local>';

export async function initMailer() {
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    fromAddr = process.env.MAIL_FROM || fromAddr;
    console.log("Mailer: using real SMTP");
  } else {
    const test = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: test.user, pass: test.pass },
    });
    console.log("Mailer: using Ethereal (dev). Preview links will be logged.");
  }
}

export async function sendOtpEmail(to, code) {
  if (!transporter) await initMailer();
  const info = await transporter.sendMail({
    from: fromAddr,
    to,
    subject: "Your verification code",
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your verification code is <b>${code}</b>. It expires in 10 minutes.</p>`,
  });
  if (nodemailer.getTestMessageUrl) {
    const url = nodemailer.getTestMessageUrl(info);
    if (url) console.log("Ethereal preview:", url);
  }
}
