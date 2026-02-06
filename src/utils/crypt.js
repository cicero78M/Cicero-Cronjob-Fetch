import CryptoJS from "crypto-js";

const PASSPHRASE = process.env.SECRET_KEY; // sama di semua sistem/env Anda!

export function encrypt(text) {
    try {
        return CryptoJS.AES.encrypt(text, PASSPHRASE).toString();
    } catch (error) {
        console.error(error);
        return null;
    }
}

export function decrypt(encrypted) {
    try {
        return CryptoJS.AES.decrypt(encrypted, PASSPHRASE).toString(CryptoJS.enc.Utf8);
    } catch (error) {
        console.error(error);
        return null;
    }
}
