import { sendOtpEmail } from './emailService.js';

/**
 * Send an OTP email directly. The previous implementation
 * used a queue introducing delay. By sending the
 * email synchronously, the OTP reaches the user immediately.
 */
export async function enqueueOtp(email, otp) {
  try {
    await sendOtpEmail(email, otp);
  } catch (err) {
    console.warn(`[Email] Failed to send OTP to ${email}: ${err.message}`);
    throw err;
  }
}

// Kept for backward compatibility; no longer needed when sending OTP directly.
export async function startOtpWorker() {
  return Promise.resolve();
}
