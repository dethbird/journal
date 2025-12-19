import 'dotenv/config';
import nodemailer from 'nodemailer';
import prisma from '../src/lib/prismaClient.js';
import buildDigestViewModel from '../src/digest/viewModel.js';
import { renderEmailDigest } from '../src/digest/renderers/email.js';

/**
 * Send daily digest email showing yesterday's journal entry + digest items.
 * Run this script at 5 AM daily via systemd timer or cron.
 */

const sendDigestEmail = async () => {
  try {
    await prisma.$connect();

    // Build digest for last 24 hours
    const vm = await buildDigestViewModel({ rangeHours: 24 });

    // Render email body
    const htmlBody = renderEmailDigest(vm);

    // Configure SMTP transport
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Send email
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.DIGEST_EMAIL_TO || process.env.SMTP_USER,
      subject: `Daily Digest — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      html: htmlBody,
    });

    console.log('Digest email sent:', info.messageId);
  } catch (error) {
    console.error('Failed to send digest email:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

sendDigestEmail();
