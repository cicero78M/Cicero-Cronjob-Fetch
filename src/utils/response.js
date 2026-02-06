export function sendSuccess(res, data, code = 200) {
  res.status(code).json({ success: true, data });
}
