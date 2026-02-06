export const SUBMENU_BACK_INSTRUCTION =
  "Ketik *back* untuk kembali ke menu sebelumnya.";

export const appendSubmenuBackInstruction = (message) => {
  if (!message) {
    return SUBMENU_BACK_INSTRUCTION;
  }
  if (message.includes(SUBMENU_BACK_INSTRUCTION)) {
    return message;
  }
  const separator = message.endsWith("\n") ? "" : "\n";
  return `${message}${separator}${SUBMENU_BACK_INSTRUCTION}`;
};
