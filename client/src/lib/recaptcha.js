import { RecaptchaVerifier } from "firebase/auth";
import { auth } from "./firebase";

// Creates (or reuses) a single invisible reCAPTCHA instance
export function getRecaptcha() {
  if (window._recaptchaVerifier) return window._recaptchaVerifier;
  window._recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
    size: "invisible",
    callback: () => {}, // solved automatically
  });
  return window._recaptchaVerifier;
}
