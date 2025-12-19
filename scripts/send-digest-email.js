import 'dotenv/config';
import nodemailer from 'nodemailer';
import prisma from '../src/lib/prismaClient.js';
import buildDigestViewModel from '../src/digest/viewModel.js';
import renderEmailHtml from '../src/digest/renderers/email.js';

/**
 * Send daily digest email to all users with email delivery configured.
 * Run this script at 5 AM daily via systemd timer or cron.
 * 
 * Iterates over all users, checks their email delivery settings,
 * builds a per-user digest, and sends an email using their SMTP config.
 */

const sendDigestEmail = async () => {
  try {
    await prisma.$connect();

    // Fetch all users with email delivery settings enabled
    const users = await prisma.user.findMany({
      where: {
        emailDelivery: {
          enabled: true,
        },
      },
      include: {
        emailDelivery: true,
      },
    });

    if (users.length === 0) {
      console.log('No users with email delivery enabled. Skipping digest email.');
      return;
    }

    console.log(`Found ${users.length} user(s) with email delivery enabled.`);

    for (const user of users) {
      try {
        const delivery = user.emailDelivery;
        if (!delivery) {
          console.log(`[${user.email}] No email delivery settings found, skipping.`);
          continue;
        }

        // Build digest for this user (last 24 hours)
        // TODO: Pass userId to buildDigestViewModel once it supports per-user filtering
        const vm = await buildDigestViewModel({ rangeHours: 24, userId: user.id });

        // Render email body
        const htmlBody = renderEmailHtml(vm);

        // Configure SMTP transport from user's settings
        const transporter = nodemailer.createTransport({
          host: delivery.host,
          port: delivery.port,
          secure: delivery.secure,
          auth: {
            user: delivery.username,
            pass: delivery.password,
          },
        });

        // Send email
        const info = await transporter.sendMail({
          from: delivery.fromName ? `${delivery.fromName} <${delivery.fromEmail}>` : delivery.fromEmail,
          to: user.email || delivery.fromEmail,
          replyTo: delivery.replyTo || delivery.fromEmail,
          subject: delivery.digestSubject || `Daily Digest — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          html: htmlBody,
        });

        console.log(`[${user.email}] Digest email sent: ${info.messageId}`);

        // Update lastSentAt
        await prisma.userEmailDelivery.update({
          where: { userId: user.id },
          data: { lastSentAt: new Date() },
        });
      } catch (userError) {
        console.error(`[${user.email}] Failed to send digest:`, userError.message);
        // Continue to next user instead of failing the entire job
      }
    }

    console.log('Digest email job completed.');
  } catch (error) {
    console.error('Failed to send digest emails:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

sendDigestEmail();
