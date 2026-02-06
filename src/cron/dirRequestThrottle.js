export const MESSAGE_THROTTLE_MS = 2000;

export async function delayAfterSend(delayMs = MESSAGE_THROTTLE_MS) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
