const nodemailer = require('nodemailer');

// Create transporter (re-uses SMTP config from .env)
const createTransporter = () => {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    // Check if defaults or missing
    if (!host || !user || !pass ||
        user === 'your-email@gmail.com' ||
        pass === 'your-app-password') {
        return null;
    }

    return nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user, pass }
    });
};

const FROM = () => process.env.FROM_EMAIL || 'noreply@tutionmeet.com';
const BRAND_COLOR = '#f27c07';

const wrapHtml = (content) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:'Inter',Arial,sans-serif;background:#f8f9fa;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,${BRAND_COLOR},#ff9d42);padding:32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:1.5rem;">🎓 Tuition Meet</h1>
    </div>
    <div style="padding:32px;">${content}</div>
    <div style="padding:20px 32px;background:#f8f9fa;text-align:center;font-size:0.8rem;color:#94a3b8;">
      © ${new Date().getFullYear()} Tuition Meet. All rights reserved.
    </div>
  </div>
</body>
</html>`;

const sendEmail = async (to, subject, htmlContent) => {
    const transporter = createTransporter();
    if (!transporter) {
        console.log('\n--- 📧 [DEV MODE] EMAIL SIMULATED ---');
        console.log(`To: ${to}\nSubject: ${subject}`);
        console.log('Content Preview:', htmlContent.replace(/<[^>]*>/g, '').substring(0, 250).trim() + '...');
        console.log('--- Config SMTP credentials in .env to send real emails ---\n');
        return { dev: true };
    }
    try {
        const info = await transporter.sendMail({
            from: `"Tuition Meet" <${FROM()}>`,
            to, subject, html: wrapHtml(htmlContent)
        });
        console.log(`📧 Email sent to ${to}: ${info.messageId}`);
        return info;
    } catch (err) {
        if (err.code === 'EAUTH') {
            console.error('❌ Email Auth Failure: Your SMTP credentials in .env are incorrect.');
            console.log('💡 TIP: If using Gmail, make sure you created an "App Password" (16 chars).');
        } else {
            console.error('Email send error:', err.message);
        }
        return null;
    }
};

// ─── Email Templates ─────────────────────────────

const sendWelcomeEmail = (to, name, role) => {
    return sendEmail(to, 'Welcome to Tuition Meet! 🎓', `
        <h2 style="color:#0f172a;margin:0 0 12px;">Welcome, ${name}! 🎉</h2>
        <p style="color:#475569;line-height:1.6;">
            Your ${role} account has been created successfully. You're all set to
            ${role === 'teacher' ? 'start teaching and connecting with students' : 'begin learning from expert tutors'}.
        </p>
        <div style="text-align:center;margin:28px 0;">
            <a href="${process.env.APP_URL || 'http://localhost:5005'}/login" 
               style="background:${BRAND_COLOR};color:white;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:700;display:inline-block;">
                Get Started →
            </a>
        </div>
        <p style="color:#94a3b8;font-size:0.85rem;">If you didn't create this account, please ignore this email.</p>
    `);
};

const sendPaymentConfirmation = (to, name, amount, days, paymentId) => {
    return sendEmail(to, 'Payment Confirmed ✅', `
        <h2 style="color:#0f172a;margin:0 0 12px;">Payment Successful!</h2>
        <p style="color:#475569;line-height:1.6;">Hi ${name}, your subscription has been activated.</p>
        <div style="background:#f8f9fa;border-radius:12px;padding:20px;margin:20px 0;">
            <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#94a3b8;">Amount</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0f172a;">₹${amount}</td></tr>
                <tr><td style="padding:8px 0;color:#94a3b8;">Duration</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0f172a;">${days} days</td></tr>
                <tr><td style="padding:8px 0;color:#94a3b8;">Payment ID</td><td style="padding:8px 0;text-align:right;font-size:0.8rem;color:#64748b;">${paymentId}</td></tr>
            </table>
        </div>
        <p style="color:#475569;">You now have full access to all courses and live sessions. Happy learning! 🚀</p>
    `);
};

const sendClassReminder = (to, name, className, teacherName, startTime) => {
    return sendEmail(to, `📹 Class Reminder: ${className}`, `
        <h2 style="color:#0f172a;margin:0 0 12px;">Your class is starting soon!</h2>
        <p style="color:#475569;line-height:1.6;">Hi ${name}, here's a reminder for your upcoming class:</p>
        <div style="background:#fff7ed;border-left:4px solid ${BRAND_COLOR};border-radius:0 12px 12px 0;padding:16px 20px;margin:20px 0;">
            <strong style="color:#0f172a;">${className}</strong><br>
            <span style="color:#64748b;">by ${teacherName} • ${startTime}</span>
        </div>
        <div style="text-align:center;margin:28px 0;">
            <a href="${process.env.APP_URL || 'http://localhost:5005'}/dashboard" 
               style="background:${BRAND_COLOR};color:white;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:700;display:inline-block;">
                Join Class →
            </a>
        </div>
    `);
};

const sendOtpEmail = (to, otp) => {
    return sendEmail(to, 'Password Reset OTP — Tuition Meet', `
        <div style="text-align:center;padding:20px;background:#f8f9fa;border-radius:12px;">
            <p style="color:#475569;margin-bottom:20px;">Your password reset OTP is:</p>
            <span style="font-size:2.5rem;font-weight:900;letter-spacing:10px;color:${BRAND_COLOR};">${otp}</span>
            <p style="color:#94a3b8;font-size:0.85rem;margin-top:20px;">This OTP expires in 10 minutes. Don't share it with anyone.</p>
        </div>
    `);
};

module.exports = { sendEmail, sendWelcomeEmail, sendPaymentConfirmation, sendClassReminder, sendOtpEmail };
